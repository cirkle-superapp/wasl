import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { aiChat } from '@/lib/ai'

export const runtime = 'nodejs'

// POST /api/ai/insights — AI-powered conversation analytics
// Body: { conversationId }
// Returns: message count, sentiment, key topics, response time, most active hours
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await req.json().catch(() => ({}))
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  // Get last 200 messages for analysis
  const messages = await db.message.findMany({
    where: { conversationId, type: { not: 'system' } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      senderId: true,
      content: true,
      createdAt: true,
      type: true,
    },
  })

  if (messages.length === 0) {
    return NextResponse.json({ error: 'No messages to analyze' }, { status: 404 })
  }

  // Get conversation details
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      name: true,
      isGroup: true,
      participants: {
        select: {
          userId: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  })

  // ---- Local analytics (fast, no AI needed) ----
  const totalMsgs = messages.length
  const myMsgs = messages.filter((m) => m.senderId === session.id).length
  const theirMsgs = totalMsgs - myMsgs

  // Response time: average gap between their message and my next message
  let responseTimes: number[] = []
  for (let i = messages.length - 1; i > 0; i--) {
    const prev = messages[i]
    const curr = messages[i - 1]
    if (prev.senderId !== session.id && curr.senderId === session.id) {
      const gap = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime()
      if (gap > 0 && gap < 24 * 60 * 60_000) responseTimes.push(gap)
    }
  }
  const avgResponseMs = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length)
    : 0

  // Most active hours
  const hourFreq: Record<number, number> = {}
  for (const m of messages) {
    const h = new Date(m.createdAt).getHours()
    hourFreq[h] = (hourFreq[h] || 0) + 1
  }
  const topHours = Object.entries(hourFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h, c]) => ({ hour: parseInt(h), count: c }))

  // Message types breakdown
  const typeBreakdown: Record<string, number> = {}
  for (const m of messages) {
    typeBreakdown[m.type] = (typeBreakdown[m.type] || 0) + 1
  }

  // Per-sender breakdown
  const senderBreakdown: Record<string, { name: string; count: number }> = {}
  for (const m of messages) {
    const p = conversation?.participants.find((pp) => pp.userId === m.senderId)
    const name = m.senderId === session.id ? 'You' : p?.user?.name || 'Unknown'
    if (!senderBreakdown[m.senderId]) {
      senderBreakdown[m.senderId] = { name, count: 0 }
    }
    senderBreakdown[m.senderId].count++
  }

  // Average message length
  const avgLength = Math.round(messages.reduce((s, m) => s + m.content.length, 0) / totalMsgs)

  // Date range
  const oldest = new Date(messages[messages.length - 1].createdAt)
  const newest = new Date(messages[0].createdAt)
  const daySpan = Math.max(1, Math.ceil((newest.getTime() - oldest.getTime()) / (24 * 60 * 60_000)))

  // ---- AI-powered insights (with 7s timeout) ----
  let aiInsights: string | null = null
  try {
    // Build a compact version of the conversation for AI analysis
    const compactConvo = messages
      .reverse()
      .slice(-100) // Last 100 messages for AI
      .map((m) => {
        const name = m.senderId === session.id ? 'Me' : 'Them'
        return `${name}: ${m.content.slice(0, 100)}`
      })
      .join('\n')

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 7000))
    aiInsights = await Promise.race([
      aiChat(
        'You are a conversation analyst. Analyze this chat and provide: 1) Overall sentiment (positive/neutral/negative), 2) 3 key topics discussed, 3) Communication health assessment (healthy/needs attention), 4) One actionable recommendation. Keep it under 150 words.',
        `Analyze this conversation:\n\n${compactConvo}`,
        250,
      ),
      timeoutPromise,
    ])
  } catch {
    aiInsights = null
  }

  return NextResponse.json({
    conversationName: conversation?.name,
    isGroup: conversation?.isGroup || false,
    totalMessages: totalMsgs,
    myMessages: myMsgs,
    theirMessages: theirMsgs,
    myPercentage: Math.round((myMsgs / totalMsgs) * 100),
    avgMessageLength: avgLength,
    avgResponseTimeMs: avgResponseMs,
    avgResponseTimeLabel: formatDuration(avgResponseMs),
    topActiveHours: topHours.map((h) => `${h.hour}:00 (${h.count} msgs)`),
    messageTypeBreakdown: typeBreakdown,
    senderBreakdown: Object.values(senderBreakdown),
    daySpan,
    messagesPerDay: Math.round(totalMsgs / daySpan * 10) / 10,
    dateRange: {
      from: oldest.toISOString(),
      to: newest.toISOString(),
    },
    aiInsights: aiInsights || null,
  })
}

function formatDuration(ms: number): string {
  if (ms === 0) return 'N/A'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.round(min / 60)
  return `${hr}h`
}
