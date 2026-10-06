import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { aiChat } from '@/lib/ai'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// Conversation Health Score — algorithmic composite metric (Task 88)
// ═══════════════════════════════════════════════════════════════════════
//
// Quantifies the "health" of a 1-on-1 conversation on a 0-100 scale.
// Uses 5 signals combined via weighted sum + an AI sentiment pass that can
// provide a written assessment (graceful fallback to null on timeout).
//
// Signals:
//   1. Response symmetry  — ratio of my msgs to their msgs.
//                           1:1 → 100, 3:1 → 50, 10:1 → 10.
//   2. Response latency trend — compares median response time in the
//                           first half vs second half of the conversation.
//                           Improving → 100, worsening → 0.
//   3. Initiation balance — who starts conversations?
//                           50/50 → 100, 100/0 → 30.
//   4. Sentiment trend    — AI-derived (-1..1 → 0..100).
//   5. Recency            — days since last exchange, exponential decay.
//
// Final score = 0.25*sym + 0.20*latency + 0.20*init + 0.20*sentiment + 0.15*recency
// Label: 80-100 Thriving, 60-79 Healthy, 40-59 Fading, 0-39 At-risk

const URGENCY_LABELS = [
  { min: 80, label: 'Thriving', color: 'green', emoji: '🌱' },
  { min: 60, label: 'Healthy', color: 'teal', emoji: '✓' },
  { min: 40, label: 'Fading', color: 'amber', emoji: '◐' },
  { min: 0, label: 'At risk', color: 'rose', emoji: '⚠' },
]

function labelFor(score: number) {
  return URGENCY_LABELS.find((l) => score >= l.min)!
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await req.json().catch(() => ({}))
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  const convo = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      isGroup: true,
      name: true,
      participants: {
        select: {
          userId: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!convo || !convo.participants.some((p) => p.userId === session.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const messages = await db.message.findMany({
    where: { conversationId, type: { not: 'system' } },
    orderBy: { createdAt: 'asc' },
    take: 600,
    select: {
      id: true,
      senderId: true,
      content: true,
      createdAt: true,
    },
  })

  if (messages.length < 4) {
    return NextResponse.json({
      conversationId,
      score: null,
      label: 'Not enough data',
      reason: 'Need at least 4 messages to compute health.',
      signals: null,
    })
  }

  const otherUserId = convo.participants.find((p) => p.userId !== session.id)?.userId ?? null

  // ---- Signal 1: Response symmetry ----
  // For 1-on-1: my msgs vs the other person's msgs.
  // For groups: my msgs vs the SUM of all other participants' msgs.
  const myMsgs = messages.filter((m) => m.senderId === session.id)
  const theirMsgs = convo.isGroup
    ? messages.filter((m) => m.senderId !== session.id)
    : messages.filter((m) => m.senderId === otherUserId)
  const total = myMsgs.length + theirMsgs.length
  const ratio = total > 0 ? Math.min(myMsgs.length, theirMsgs.length) / Math.max(myMsgs.length, theirMsgs.length, 1) : 0
  const symScore = Math.round(ratio * 100)

  // ---- Signal 2: Response latency trend ----
  const responseGaps: number[] = []
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1]
    const curr = messages[i]
    if (prev.senderId !== curr.senderId) {
      const gap = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime()
      if (gap > 0 && gap < 24 * 60 * 60_000) responseGaps.push(gap)
    }
  }
  const mid = Math.floor(responseGaps.length / 2)
  const firstHalf = responseGaps.slice(0, mid)
  const secondHalf = responseGaps.slice(mid)
  const m1 = median(firstHalf)
  const m2 = median(secondHalf)
  let latencyScore = 50
  if (m1 > 0 && m2 > 0) {
    const diff = (m1 - m2) / Math.max(m1, m2)
    latencyScore = Math.round(50 + diff * 50)
    latencyScore = Math.max(0, Math.min(100, latencyScore))
  } else if (m2 > 0 && m1 === 0) {
    latencyScore = 70
  }

  // ---- Signal 3: Initiation balance ----
  const SIX_HOURS = 6 * 60 * 60_000
  let myInitiations = 0
  let theirInitiations = 0
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const prev = i > 0 ? messages[i - 1] : null
    const prevTime = prev ? new Date(prev.createdAt).getTime() : 0
    const currTime = new Date(m.createdAt).getTime()
    if (!prev || currTime - prevTime > SIX_HOURS) {
      if (m.senderId === session.id) myInitiations++
      else theirInitiations++
    }
  }
  const totalInit = myInitiations + theirInitiations
  const initRatio = totalInit > 0
    ? Math.min(myInitiations, theirInitiations) / Math.max(myInitiations, theirInitiations, 1)
    : 0
  const initScore = Math.round(initRatio * 100)

  // ---- Signal 4: AI sentiment trend ----
  let sentimentScore = 50
  let sentimentLabel = 'neutral'
  let aiAssessment: string | null = null
  try {
    const compact = messages
      .slice(-100)
      .map((m) => {
        const who = m.senderId === session.id ? 'Me' : (convo.participants.find((p) => p.userId === m.senderId)?.user.name || 'Them')
        return `${who}: ${m.content.slice(0, 100)}`
      })
      .join('\n')

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 7000))
    const aiResult = await Promise.race([
      aiChat(
        'You analyze conversation health. Reply with strict JSON: {"sentimentScore":0-100, "label":"positive|neutral|negative", "assessment":"<40 word assessment of relationship health>"}. sentimentScore: 100=warm/thriving, 50=neutral/formal, 10=strained/cold. Be honest but kind.',
        `Conversation:\n${compact}`,
        200,
      ),
      timeoutPromise,
    ])
    if (aiResult) {
      const jsonMatch = aiResult.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          if (typeof parsed.sentimentScore === 'number') sentimentScore = parsed.sentimentScore
          if (parsed.label) sentimentLabel = parsed.label
          if (parsed.assessment) aiAssessment = parsed.assessment
        } catch { /* ignore */ }
      }
    }
  } catch {
    // Keep defaults
  }

  // ---- Signal 5: Recency ----
  const lastMsgAt = new Date(messages[messages.length - 1].createdAt)
  const daysSince = (Date.now() - lastMsgAt.getTime()) / (24 * 60 * 60_000)
  const recencyScore = Math.round(Math.exp(-daysSince / 10) * 100)

  // ---- Weighted composite ----
  const composite = Math.round(
    0.25 * symScore +
    0.20 * latencyScore +
    0.20 * initScore +
    0.20 * sentimentScore +
    0.15 * recencyScore
  )

  const label = labelFor(composite)

  // Trend: compare last 25% of messages vs first 25% on rate.
  const quarterSize = Math.max(2, Math.floor(messages.length / 4))
  const firstQuarter = messages.slice(0, quarterSize)
  const lastQuarter = messages.slice(-quarterSize)
  const firstSpan = firstQuarter.length > 1
    ? new Date(firstQuarter[firstQuarter.length - 1].createdAt).getTime() - new Date(firstQuarter[0].createdAt).getTime()
    : 1
  const lastSpan = lastQuarter.length > 1
    ? new Date(lastQuarter[lastQuarter.length - 1].createdAt).getTime() - new Date(lastQuarter[0].createdAt).getTime()
    : 1
  const firstRate = firstQuarter.length / Math.max(1, firstSpan)
  const lastRate = lastQuarter.length / Math.max(1, lastSpan)
  const rateRatio = lastRate / Math.max(0.0001, firstRate)
  let trend: 'up' | 'flat' | 'down' = 'flat'
  if (rateRatio > 1.25) trend = 'up'
  else if (rateRatio < 0.75) trend = 'down'

  return NextResponse.json({
    conversationId,
    isGroup: convo.isGroup,
    conversationName: convo.name,
    score: composite,
    label: label.label,
    emoji: label.emoji,
    color: label.color,
    trend,
    signals: {
      symmetry: symScore,
      latencyTrend: latencyScore,
      initiation: initScore,
      sentiment: sentimentScore,
      recency: recencyScore,
    },
    sentimentLabel,
    aiAssessment,
    stats: {
      totalMessages: total,
      myMessages: myMsgs.length,
      theirMessages: theirMsgs.length,
      myInitiations,
      theirInitiations,
      firstHalfMedianResponseMs: m1,
      secondHalfMedianResponseMs: m2,
      daysSinceLastMessage: Math.round(daysSince * 10) / 10,
    },
    weights: { symmetry: 0.25, latencyTrend: 0.20, initiation: 0.20, sentiment: 0.20, recency: 0.15 },
    algorithm: 'health-score-v1',
  })
}
