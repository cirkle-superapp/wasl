import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { aiChat } from '@/lib/ai'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// "Catch me up" — Structured digest for returning to a busy chat (Task 88)
// ═══════════════════════════════════════════════════════════════════════
//
// When a user opens a chat with many unread messages, instead of making them
// scroll through 50+ bubbles, this endpoint returns a STRUCTURED digest:
//   - tldr:          one-paragraph plain-language summary
//   - decisions:    list of agreed-upon items
//   - actionItems:  list of { text, ownerName, dueByText? }
//   - mentionsOfYou:list of { messageId, senderName, snippet } where you
//                   were mentioned by name / @username / direct question
//   - links:        list of { url, senderName } extracted from messages
//   - questions:    list of open questions asked in the unread window
//
// The algorithm:
//   1) Fetch up to 200 unread messages from the user's lastReadAt forward.
//   2) Run local extraction (regex) for links, mentions, questions.
//   3) Send a compact transcript to the AI for tldr / decisions / actions.
//   4) AI has 7s timeout; on timeout we still return local extractions
//      (links, mentions, questions) with a fallback tldr built from
//      top-N message snippets.

const LINK_RE = /https?:\/\/[^\s<>"']{4,200}/gi
const QUESTION_RE = /[^.!?]*\?\s*$/gm

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId, limit = 200, unreadCount } = await req.json().catch(() => ({}))
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  const participation = await db.participant.findFirst({
    where: { userId: session.id, conversationId },
    select: { lastReadAt: true },
  })
  const lastReadAt = participation?.lastReadAt ?? new Date(0)

  // Two-pass fetch strategy:
  //   1) If the caller passed an explicit `unreadCount` (captured client-side
  //      BEFORE the chat-window's GET messages call auto-marks-read), use
  //      that count to fetch the LAST N messages — because by the time the
  //      user clicks "Catch me up", the server has already updated their
  //      lastReadAt to NOW (the GET /messages endpoint marks-read on fetch).
  //   2) Fall back to the legacy "messages newer than lastReadAt" filter
  //      for cases where the caller doesn't supply a count.
  let messages: { id: string; senderId: string; content: string; createdAt: Date; type: string }[] = []
  if (typeof unreadCount === 'number' && unreadCount > 0) {
    messages = await db.message.findMany({
      where: {
        conversationId,
        type: { in: ['text', 'image', 'commit'] },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, unreadCount), 400),
      select: {
        id: true,
        senderId: true,
        content: true,
        createdAt: true,
        type: true,
      },
    })
    messages.reverse() // restore chronological order
  } else {
    messages = await db.message.findMany({
      where: {
        conversationId,
        createdAt: { gt: lastReadAt },
        type: { in: ['text', 'image', 'commit'] },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(1, Number(limit) || 200), 400),
      select: {
        id: true,
        senderId: true,
        content: true,
        createdAt: true,
        type: true,
      },
    })
  }

  if (messages.length === 0) {
    return NextResponse.json({
      conversationId,
      messageCount: 0,
      tldr: 'Nothing new to catch up on.',
      decisions: [],
      actionItems: [],
      mentionsOfYou: [],
      links: [],
      questions: [],
    })
  }

  const convo = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      isGroup: true,
      name: true,
      participants: {
        select: { userId: true, user: { select: { id: true, name: true, username: true } } },
      },
    },
  })

  const nameFor = (senderId: string) => {
    if (senderId === session.id) return 'You'
    return convo?.participants.find((p) => p.userId === senderId)?.user.name || 'Someone'
  }
  const uname = (session.username || '').toLowerCase()
  const fname = (session.name || '').split(' ')[0].toLowerCase()

  // ---- Local extraction ----
  const links: { url: string; senderName: string; messageId: string }[] = []
  const mentionsOfYou: { messageId: string; senderName: string; snippet: string }[] = []
  const questions: { messageId: string; senderName: string; snippet: string }[] = []

  for (const m of messages) {
    if (m.type !== 'text' && m.type !== 'commit') continue
    const text = m.content || ''
    const senderName = nameFor(m.senderId)

    const linkMatches = text.match(LINK_RE)
    if (linkMatches) {
      for (const url of linkMatches.slice(0, 5)) {
        if (links.length < 12) links.push({ url, senderName, messageId: m.id })
      }
    }

    const mentionHit =
      (uname && new RegExp(`@${uname}\\b`, 'i').test(text)) ||
      (fname && fname.length > 2 && new RegExp(`\\b${fname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text))
    if (mentionHit && m.senderId !== session.id) {
      let snippet = text
      if (snippet.length > 140) {
        const idx = fname ? snippet.toLowerCase().indexOf(fname) : -1
        if (idx >= 0) {
          const start = Math.max(0, idx - 60)
          snippet = (start > 0 ? '…' : '') + snippet.slice(start, start + 140) + (start + 140 < text.length ? '…' : '')
        } else {
          snippet = snippet.slice(0, 140) + '…'
        }
      }
      mentionsOfYou.push({ messageId: m.id, senderName, snippet })
    }

    if (m.senderId !== session.id) {
      const qMatches = text.match(QUESTION_RE)
      if (qMatches) {
        for (const q of qMatches.slice(0, 2)) {
          const trimmed = q.trim().slice(0, 160)
          if (trimmed.length > 5 && questions.length < 10) {
            questions.push({ messageId: m.id, senderName, snippet: trimmed })
          }
        }
      }
    }
  }

  // ---- AI digest (tldr + decisions + actionItems) ----
  const compact = messages
    .slice(-120)
    .map((m) => {
      const who = nameFor(m.senderId)
      const txt = m.content.slice(0, 160)
      return `${who}: ${txt}`
    })
    .join('\n')

  let tldr: string | null = null
  let decisions: { text: string }[] = []
  let actionItems: { text: string; ownerName?: string }[] = []

  try {
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 7000))
    const aiResult = await Promise.race([
      aiChat(
        'You produce structured chat digests. Respond with strict JSON only: {"tldr":"<2-3 sentence plain-language summary>","decisions":[{"text":"..."}],"actionItems":[{"text":"...","ownerName":"..."}]}. Only include explicit decisions and action items actually mentioned. If none, use empty arrays. Keep each item under 80 chars.',
        `Conversation (newest last):\n${compact}`,
        500,
      ),
      timeoutPromise,
    ])

    if (aiResult) {
      const jsonMatch = aiResult.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          if (typeof parsed.tldr === 'string') tldr = parsed.tldr
          if (Array.isArray(parsed.decisions)) {
            decisions = parsed.decisions
              .filter((d: any) => d && typeof d.text === 'string')
              .slice(0, 8)
              .map((d: any) => ({ text: String(d.text).slice(0, 200) }))
          }
          if (Array.isArray(parsed.actionItems)) {
            actionItems = parsed.actionItems
              .filter((a: any) => a && typeof a.text === 'string')
              .slice(0, 8)
              .map((a: any) => ({
                text: String(a.text).slice(0, 200),
                ownerName: typeof a.ownerName === 'string' ? a.ownerName : undefined,
              }))
          }
        } catch { /* ignore parse */ }
      }
    }
  } catch { /* keep defaults */ }

  if (!tldr) {
    const senders = new Set(messages.map((m) => nameFor(m.senderId)))
    const senderStr = Array.from(senders).slice(0, 3).join(', ')
    tldr = `${messages.length} new message${messages.length === 1 ? '' : 's'} from ${senderStr}. ` +
      `Use the highlighted mentions and questions below to jump back in.`
  }

  return NextResponse.json({
    conversationId,
    messageCount: messages.length,
    unreadSince: lastReadAt,
    tldr,
    decisions,
    actionItems,
    mentionsOfYou: mentionsOfYou.slice(0, 10),
    links: links.slice(0, 10),
    questions: questions.slice(0, 8),
    algorithm: 'catch-up-v1',
  })
}
