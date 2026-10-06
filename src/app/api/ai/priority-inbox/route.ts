import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// Priority Inbox — Multi-signal weighted ranking algorithm (Task 88)
// ═══════════════════════════════════════════════════════════════════════
//
// Ranks every conversation the user is part of using a weighted score built
// from seven independent signals. The top conversations are surfaced in the
// "Priority" sidebar tab so the user can triage what actually matters first.
//
// Signals (each normalized to roughly 0..1, then weighted):
//   1. Unread volume       — how many unread msgs, log-scaled + capped
//   2. Sender importance   — freq of msgs from the OTHER party in last 30d,
//                            with a recency-decay so older chats fade.
//   3. Mention score       — count of "@username" / "first name" tokens in
//                            recent unread messages.
//   4. Urgency keywords    — urgent / asap / today / tomorrow / deadline /
//                            "call me" / "need you" + date mentions.
//   5. Action-item score   — questions ("?") + imperative verbs ("please
//                            send", "can you", "could you", "remind me").
//   6. Thread engagement   — has the user replied in this thread in the
//                            last 7 days? (+) or has it gone cold? (-).
//   7. Time-of-day context — modest boost for messages arriving during
//                            typical waking hours (8–23 local).
//
// Final score = w1*unread + w2*sender + w3*mention + w4*urgency
//             + w5*action + w6*thread + w7*timeofday
//
// Weights were chosen to prioritize direct-address + urgency over raw
// unread volume (so a 2-message urgent chat outranks a 50-message meme
// dump). The whole algorithm is deterministic and O(N) over the user's
// unread + recent messages.

const WEIGHTS = {
  unread: 0.18,
  sender: 0.16,
  mention: 0.24,
  urgency: 0.22,
  action: 0.12,
  thread: 0.06,
  timeOfDay: 0.02,
}

const URGENCY_PATTERNS = [
  /\b(urgent|asap|emergency|critical|immediately|right away)\b/gi,
  /\b(today|tonight|tomorrow)\b/gi,
  /\b(deadline|due|by end of|eod|cob)\b/gi,
  /\b(call me|call you|ring me|need you|need to talk)\b/gi,
  /\b(asap|now|pls|please)\b/gi,
  /\b\d{1,2}[:.]?\d{2}\s*(am|pm)?\b/gi, // time mentions like "3pm"
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
]

const ACTION_PATTERNS = [
  /\?\s*$/g, // questions
  /\b(can you|could you|would you|will you|please send|please share)\b/gi,
  /\b(remind me|don't forget|let me know|get back to me|follow up)\b/gi,
  /\b(send|share|forward|review|approve|confirm|sign|book|schedule)\b/gi,
]

function scoreUrgency(text: string): number {
  let hits = 0
  for (const p of URGENCY_PATTERNS) {
    const m = text.match(p)
    if (m) hits += m.length
  }
  // 3 hits → saturated (1.0). Diminishing returns.
  return Math.min(1, hits / 3)
}

function scoreAction(text: string): number {
  let hits = 0
  for (const p of ACTION_PATTERNS) {
    const m = text.match(p)
    if (m) hits += m.length
  }
  return Math.min(1, hits / 3)
}

function scoreMention(text: string, username: string, firstName: string): number {
  if (!text) return 0
  const uname = (username || '').toLowerCase()
  const fname = (firstName || '').toLowerCase().trim()
  let hits = 0
  if (uname && new RegExp(`@${uname}\\b`, 'i').test(text)) hits += 2
  if (fname && fname.length > 2 && new RegExp(`\\b${fname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) hits += 1
  return Math.min(1, hits / 2)
}

// Recency decay: 1.0 now → 0.5 at 7d → 0.15 at 30d → 0 after 60d.
function recencyDecay(daysAgo: number): number {
  if (daysAgo <= 0) return 1
  if (daysAgo >= 60) return 0
  // exponential-ish decay
  return Math.exp(-daysAgo / 14)
}

function timeOfDayBoost(date: Date): number {
  const h = date.getHours()
  // Peak during 8-23 (waking), low at night.
  if (h >= 8 && h <= 23) return 1
  if (h >= 0 && h < 8) return 0.4
  return 0.2
}

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1) User's conversations
  const participations = await db.participant.findMany({
    where: { userId: session.id, archived: false },
    select: {
      conversationId: true,
      lastReadAt: true,
      conversation: {
        select: {
          id: true,
          name: true,
          isGroup: true,
          updatedAt: true,
          participants: {
            select: {
              userId: true,
              user: {
                select: { id: true, name: true, username: true, online: true, lastSeen: true },
              },
            },
          },
        },
      },
    },
  })

  if (participations.length === 0) {
    return NextResponse.json({ items: [], algorithm: 'priority-inbox-v1' })
  }

  const conversationIds = participations.map((p) => p.conversationId)

  // 2) Pull messages from the last 30 days across all conversations (single query)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000)

  const recentMessages = await db.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      createdAt: { gte: thirtyDaysAgo },
      type: { not: 'system' },
    },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      content: true,
      createdAt: true,
      type: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 800, // safety cap
  })

  // Build per-conversation working state
  type ConvState = {
    id: string
    name: string
    isGroup: boolean
    lastReadAt: Date
    updatedAt: Date
    unreadCount: number
    otherUserId: string | null
    otherUserName: string
    otherUserOnline: boolean
    unreadContents: { text: string; createdAt: Date }[]
    otherMsgCount30d: number
    myMsgCount7d: number
    lastMessageAt: Date | null
  }

  const stateById = new Map<string, ConvState>()
  for (const p of participations) {
    const c = p.conversation
    const otherP = c.participants.find((pp) => pp.userId !== session.id)
    stateById.set(c.id, {
      id: c.id,
      name: c.isGroup ? (c.name || 'Group') : (otherP?.user.name || 'Unknown'),
      isGroup: c.isGroup,
      lastReadAt: p.lastReadAt ?? new Date(0),
      updatedAt: c.updatedAt,
      unreadCount: 0,
      otherUserId: otherP?.userId ?? null,
      otherUserName: otherP?.user.name ?? '',
      otherUserOnline: otherP?.user.online ?? false,
      unreadContents: [],
      otherMsgCount30d: 0,
      myMsgCount7d: 0,
      lastMessageAt: null,
    })
  }

  for (const m of recentMessages) {
    const s = stateById.get(m.conversationId)
    if (!s) continue
    if (!s.lastMessageAt || new Date(m.createdAt) > s.lastMessageAt) {
      s.lastMessageAt = new Date(m.createdAt)
    }
    if (m.senderId === session.id) {
      if (new Date(m.createdAt) >= sevenDaysAgo) s.myMsgCount7d++
    } else {
      s.otherMsgCount30d++
      if (new Date(m.createdAt) > s.lastReadAt) {
        s.unreadCount++
        if (s.unreadContents.length < 25) {
          s.unreadContents.push({ text: m.content || '', createdAt: new Date(m.createdAt) })
        }
      }
    }
  }

  // 3) Apply the scoring algorithm
  const items: Array<{
    conversationId: string
    name: string
    isGroup: boolean
    score: number
    signals: Record<string, number>
    reasons: string[]
    unreadCount: number
    otherUserOnline: boolean
    topSnippet?: string
  }> = []

  for (const s of stateById.values()) {
    if (!s.lastMessageAt) continue
    const daysSinceLast = (Date.now() - s.lastMessageAt.getTime()) / (24 * 60 * 60_000)
    if (daysSinceLast > 14 && s.unreadCount === 0) continue

    const uname = session.username || ''
    const fname = (session.name || '').split(' ')[0] || ''

    const unreadScore = Math.min(1, Math.log2(1 + s.unreadCount) / 4.5)
    const recencyMult = recencyDecay(daysSinceLast)
    const senderScore = Math.min(1, (s.otherMsgCount30d / 20) * recencyMult)

    let mentionMax = 0
    let urgencyMax = 0
    let actionMax = 0
    let topSnippet = ''
    for (const um of s.unreadContents) {
      const mn = scoreMention(um.text, uname, fname)
      const ug = scoreUrgency(um.text)
      const ac = scoreAction(um.text)
      if (mn > mentionMax) mentionMax = mn
      if (ug > urgencyMax) urgencyMax = ug
      if (ac > actionMax) actionMax = ac
      const combined = mn + ug + ac
      if (combined > 0 && !topSnippet) {
        topSnippet = um.text.slice(0, 120)
      }
    }

    const threadScore = s.myMsgCount7d > 0 ? 1 : 0.2
    const todScore = s.lastMessageAt ? timeOfDayBoost(s.lastMessageAt) : 0

    const score =
      WEIGHTS.mention * mentionMax +
      WEIGHTS.urgency * urgencyMax +
      WEIGHTS.unread * unreadScore +
      WEIGHTS.sender * senderScore +
      WEIGHTS.action * actionMax +
      WEIGHTS.thread * threadScore +
      WEIGHTS.timeOfDay * todScore

    const finalScore = daysSinceLast > 7
      ? score * Math.max(0.25, 1 - (daysSinceLast - 7) / 21)
      : score

    if (finalScore < 0.05 && s.unreadCount === 0) continue

    const reasons: string[] = []
    if (mentionMax >= 0.5) reasons.push('Mentions you')
    if (urgencyMax >= 0.5) reasons.push('Time-sensitive')
    if (actionMax >= 0.5) reasons.push('Action needed')
    if (s.unreadCount >= 5) reasons.push(`${s.unreadCount} unread`)
    if (senderScore >= 0.6) reasons.push('Frequent contact')
    if (s.myMsgCount7d > 0 && !reasons.length) reasons.push('Active thread')
    if (!reasons.length && s.unreadCount > 0) reasons.push(`${s.unreadCount} unread`)

    items.push({
      conversationId: s.id,
      name: s.name,
      isGroup: s.isGroup,
      score: Math.round(finalScore * 1000) / 1000,
      signals: {
        unread: Math.round(unreadScore * 100) / 100,
        sender: Math.round(senderScore * 100) / 100,
        mention: Math.round(mentionMax * 100) / 100,
        urgency: Math.round(urgencyMax * 100) / 100,
        action: Math.round(actionMax * 100) / 100,
        thread: Math.round(threadScore * 100) / 100,
        timeOfDay: Math.round(todScore * 100) / 100,
      },
      reasons: reasons.slice(0, 3),
      unreadCount: s.unreadCount,
      otherUserOnline: s.otherUserOnline,
      topSnippet: topSnippet || undefined,
    })
  }

  items.sort((a, b) => b.score - a.score)

  return NextResponse.json({
    items: items.slice(0, 8),
    algorithm: 'priority-inbox-v1',
    weights: WEIGHTS,
    generatedAt: new Date().toISOString(),
  })
}
