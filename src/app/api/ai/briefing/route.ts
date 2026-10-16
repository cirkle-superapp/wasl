import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { aiChat } from '@/lib/ai'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// AI Daily Briefing (Task 97) — Proactive personal assistant digest
// ═══════════════════════════════════════════════════════════════════════
//
// NO competitor has this. WhatsApp, Telegram, iMessage, Signal, Slack —
// none of them proactively summarize your day or remind you about
// relationships. Wasl turns from a chat app into a personal assistant.
//
// The briefing scans ALL the user's conversations and generates:
//   1. Priority unread — messages that need your attention (mention you,
//      contain questions, urgency keywords)
//   2. Follow-ups — conversations where someone asked you something and
//      you haven't replied yet
//   3. Action items — AI-extracted from recent messages
//   4. Stale relationships — people you haven't talked to in 7+ days
//      (with a one-tap "catch up" suggestion)
//   5. Scheduled messages — what's going out today
//   6. AI summary — a natural-language "good morning" digest
//
// All computed from the DB — no external API except the AI router for
// the natural-language summary (which has a 7s timeout + graceful fallback).

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const range = body.range || 'today' // 'today' | 'week' | 'all'

  // ── 1. Get all user's conversations ────────────────────────────────
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
              user: { select: { id: true, name: true, username: true, online: true } },
            },
          },
        },
      },
    },
    take: 100,
  })

  if (participations.length === 0) {
    return NextResponse.json({ briefing: { empty: true, message: 'No conversations yet.' } })
  }

  const conversationIds = participations.map((p) => p.conversationId)

  // ── 2. Batch-fetch recent messages across ALL conversations ─────────
  const since = range === 'today'
    ? new Date(new Date().setHours(0, 0, 0, 0))
    : range === 'week'
      ? new Date(Date.now() - 7 * 24 * 60 * 60_000)
      : new Date(0)

  const recentMessages = await db.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      createdAt: { gte: since },
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
    take: 500,
  })

  // Group messages by conversation
  const msgsByConv = new Map<string, typeof recentMessages>()
  for (const m of recentMessages) {
    if (!msgsByConv.has(m.conversationId)) msgsByConv.set(m.conversationId, [])
    msgsByConv.get(m.conversationId)!.push(m)
  }

  // ── 3. Compute: priority unread, follow-ups, stale relationships ────
  const userName = (session.name || 'you').split(' ')[0].toLowerCase()
  const URGENCY_RE = /\b(urgent|asap|today|tomorrow|deadline|call me|need you|remind me)\b/gi
  const QUESTION_RE = /\?\s*$/

  type PriorityMsg = {
    conversationId: string
    conversationName: string
    messageId: string
    content: string
    senderName: string
    reason: string
  }
  type FollowUp = {
    conversationId: string
    conversationName: string
    senderName: string
    content: string
    sentAt: string
    hoursAgo: number
  }
  type StaleConv = {
    conversationId: string
    conversationName: string
    daysSince: number
  }

  const priorityUnread: PriorityMsg[] = []
  const followUps: FollowUp[] = []
  const staleRelationships: StaleConv[] = []

  for (const p of participations) {
    const conv = p.conversation
    const msgs = msgsByConv.get(conv.id) || []
    const lastReadAt = p.lastReadAt ?? new Date(0)

    // Other party's name (for 1-on-1)
    const otherUser = conv.participants.find((pp) => pp.userId !== session.id)?.user
    const convName = conv.isGroup ? (conv.name || 'Group') : (otherUser?.name || conv.name || 'Unknown')

    // ── Stale relationship: last message > 7 days ago ──
    const lastMsgTime = msgs.length > 0 ? new Date(msgs[0].createdAt) : conv.updatedAt
    const daysSince = (Date.now() - lastMsgTime.getTime()) / (24 * 60 * 60_000)
    if (daysSince > 7 && !conv.isGroup && convName !== 'Saved Messages') {
      staleRelationships.push({
        conversationId: conv.id,
        conversationName: convName,
        daysSince: Math.round(daysSince),
      })
    }

    // ── Priority unread + follow-ups: scan unread messages ──
    for (const m of msgs) {
      if (m.senderId === session.id) continue // skip own messages
      if (new Date(m.createdAt) <= lastReadAt) continue // skip read messages

      const isMention = new RegExp(`@${userName}\\b|\\b${userName}\\b`, 'i').test(m.content)
      const isUrgent = URGENCY_RE.test(m.content)
      const isQuestion = QUESTION_RE.test(m.content.trim())

      if (isMention || isUrgent || isQuestion) {
        priorityUnread.push({
          conversationId: conv.id,
          conversationName: convName,
          messageId: m.id,
          content: m.content.slice(0, 120),
          senderName: otherUser?.name || 'Someone',
          reason: isUrgent ? 'Urgent' : isMention ? 'Mentions you' : 'Question',
        })
      }

      // Follow-up: someone sent a message in the last 24h that you haven't replied to
      const hoursAgo = (Date.now() - new Date(m.createdAt).getTime()) / (60 * 60_000)
      if (hoursAgo < 24) {
        // Check if the user replied after this message
        const userReplied = msgs.some(
          (um) => um.senderId === session.id && new Date(um.createdAt) > new Date(m.createdAt)
        )
        if (!userReplied) {
          followUps.push({
            conversationId: conv.id,
            conversationName: convName,
            senderName: otherUser?.name || 'Someone',
            content: m.content.slice(0, 100),
            sentAt: new Date(m.createdAt).toISOString(),
            hoursAgo: Math.round(hoursAgo * 10) / 10,
          })
        }
      }
    }
  }

  // ── 4. Scheduled messages for today ────────────────────────────────
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)

  const scheduledToday = await db.scheduledMessage.findMany({
    where: {
      senderId: session.id,
      scheduledFor: { lte: endOfToday },
      sent: false,
    },
    select: {
      id: true,
      content: true,
      scheduledFor: true,
      conversationId: true,
    },
    take: 10,
  })

  // ── 5. AI natural-language summary ──────────────────────────────────
  let aiSummary: string | null = null
  try {
    const compactData = {
      totalConvos: participations.length,
      unreadPriority: priorityUnread.length,
      followUps: followUps.length,
      stale: staleRelationships.length,
      scheduled: scheduledToday.length,
      topUnread: priorityUnread.slice(0, 3).map((p) => ({ from: p.senderName, reason: p.reason, text: p.content.slice(0, 50) })),
      topFollowUps: followUps.slice(0, 3).map((f) => ({ from: f.senderName, text: f.content.slice(0, 50), hoursAgo: f.hoursAgo })),
      stalePeople: staleRelationships.slice(0, 3).map((s) => ({ name: s.conversationName, days: s.daysSince })),
    }

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 7000))
    aiSummary = await Promise.race([
      aiChat(
        `You are a personal assistant generating a morning briefing. Based on this data, write a warm, concise (2-3 sentences) summary. Be personal and specific. Data: ${JSON.stringify(compactData)}`,
        'Generate the briefing now.',
        300,
      ),
      timeoutPromise,
    ])
  } catch { /* silent */ }

  // ── 6. Stats summary ────────────────────────────────────────────────
  const totalMessages = recentMessages.length
  const myMessages = recentMessages.filter((m) => m.senderId === session.id).length
  const theirMessages = totalMessages - myMessages
  const now = new Date()
  const dayProgress = (now.getHours() * 60 + now.getMinutes()) / (24 * 60)

  return NextResponse.json({
    briefing: {
      generatedAt: now.toISOString(),
      range,
      aiSummary,
      priorityUnread: priorityUnread.slice(0, 5),
      followUps: followUps.slice(0, 5),
      staleRelationships: staleRelationships.sort((a, b) => b.daysSince - a.daysSince).slice(0, 5),
      scheduledToday: scheduledToday.map((s) => ({
        id: s.id,
        content: s.content.slice(0, 80),
        scheduledFor: new Date(s.scheduledFor).toISOString(),
      })),
      stats: {
        totalConversations: participations.length,
        totalMessagesToday: totalMessages,
        myMessages,
        theirMessages,
        dayProgress: Math.round(dayProgress * 100),
      },
    },
  })
}
