import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// Send-time optimizer — peak-hour prediction from presence history (Task 88)
// ═══════════════════════════════════════════════════════════════════════
//
// Predicts the optimal time to send a message to a recipient based on their
// observed activity pattern. Uses the recipient's last 30 days of message
// send timestamps as a proxy for "when they're usually online and looking
// at the app" — binned by hour of day and weighted by recency.
//
// Algorithm:
//   1) Fetch all messages sent BY the recipient across all their
//      conversations in the last 30 days. (We can do this without needing a
//      separate PresencePing table — we already have message timestamps.)
//   2) Bin counts by hour-of-day (0..23). Apply recency weighting so the
//      last week matters more than 3 weeks ago.
//   3) Smooth with a 3-hour moving average so the recommendation isn't
//      biased by a single busy hour.
//   4) Find the peak hour within the next 24h (relative to NOW). Convert
//      to "HH:00" label and a human-readable confidence label.
//
// Returns: { recommendedHour, recommendedLabel, recommendedTimeISO, confidence,
//            topHours: [{ hour, count, weight, label }], reasoning, hasData }

const SMOOTH_WINDOW = 3

function hourLabel(h: number): string {
  const period = h < 12 ? 'AM' : 'PM'
  const display = h === 0 ? 12 : (h > 12 ? h - 12 : h)
  return `${display}:00 ${period}`
}

function next24hWindow(currentHour: number): number[] {
  // The next 24 hours starting from currentHour
  const hours: number[] = []
  for (let i = 0; i < 24; i++) {
    hours.push((currentHour + i) % 24)
  }
  return hours
}

function smooth(values: number[], window: number): number[] {
  const result: number[] = []
  for (let i = 0; i < values.length; i++) {
    let sum = 0
    let count = 0
    for (let j = -Math.floor(window / 2); j <= Math.floor(window / 2); j++) {
      const idx = i + j
      if (idx >= 0 && idx < values.length) {
        sum += values[idx]
        count++
      }
    }
    result.push(count > 0 ? sum / count : 0)
  }
  return result
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await req.json().catch(() => ({}))
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  // Verify the recipient is in this conversation with the user
  const convo = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      isGroup: true,
      name: true,
      participants: { select: { userId: true } },
    },
  })
  if (!convo || !convo.participants.some((p) => p.userId === session.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (convo.isGroup) {
    // For groups, aggregate over all participants
    const participantIds = convo.participants.map((p) => p.userId).filter((id) => id !== session.id)
    if (participantIds.length === 0) {
      return NextResponse.json({ error: 'No recipients' }, { status: 400 })
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000)
    const recentMessages = await db.message.findMany({
      where: {
        senderId: { in: participantIds },
        createdAt: { gte: thirtyDaysAgo },
        type: { not: 'system' },
      },
      select: { senderId: true, createdAt: true },
      take: 5000,
    })

    return analyze(recentMessages, 'group')
  }

  // 1-on-1 — find the other user
  const otherUserId = convo.participants.find((p) => p.userId !== session.id)?.userId
  if (!otherUserId) {
    return NextResponse.json({ error: 'No recipient' }, { status: 400 })
  }

  // Fetch the recipient's last 30 days of OUTGOING messages (across all their
  // conversations — this is a proxy for "when they're usually online").
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000)
  const recentMessages = await db.message.findMany({
    where: {
      senderId: otherUserId,
      createdAt: { gte: thirtyDaysAgo },
      type: { not: 'system' },
    },
    select: { createdAt: true },
    take: 5000,
  })

  return analyze(recentMessages, '1-on-1', otherUserId)
}

function analyze(
  messages: { senderId?: string; createdAt: Date | string }[],
  kind: 'group' | '1-on-1',
  otherUserId?: string | null,
) {
  if (messages.length < 5) {
    return NextResponse.json({
      hasData: false,
      reason: 'Not enough activity yet to predict optimal send time.',
      recommendedHour: null,
      recommendedLabel: null,
      recommendedTimeISO: null,
      confidence: 'low',
      topHours: [],
    })
  }

  const now = new Date()
  const currentHour = now.getHours()
  const nowMs = now.getTime()

  // Bin by hour, with recency weighting (more recent messages count more).
  // Weight formula: exp(-age/days/21) — recent week ~1.0, 30 days ago ~0.24.
  const hourWeights: number[] = new Array(24).fill(0)
  for (const m of messages) {
    const d = new Date(m.createdAt)
    const ageDays = (nowMs - d.getTime()) / (24 * 60 * 60_000)
    const weight = Math.exp(-ageDays / 21)
    hourWeights[d.getHours()] += weight
  }

  // Smooth with a 3-hour moving average so we don't recommend 3 AM because
  // the recipient happened to send one late-night text.
  const smoothed = smooth(hourWeights, SMOOTH_WINDOW)

  // Look at the NEXT 24 hours (starting from current hour).
  const nextHours = next24hWindow(currentHour)
  // For each candidate hour, find the smoothed weight, but also apply a
  // penalty for hours where the user is probably asleep (0-6 AM, mild penalty).
  let bestHour: number | null = null
  let bestWeight = -1
  const topHours: { hour: number; count: number; weight: number; label: string }[] = []

  for (const h of nextHours) {
    const weight = smoothed[h]
    // Apply mild penalty for 0-6 AM (typical sleep hours)
    const adjusted = h >= 0 && h < 6 ? weight * 0.3 : weight
    if (adjusted > bestWeight) {
      bestWeight = adjusted
      bestHour = h
    }
    topHours.push({
      hour: h,
      count: Math.round(hourWeights[h]),
      weight: Math.round(adjusted * 100) / 100,
      label: hourLabel(h),
    })
  }

  if (bestHour === null || bestWeight <= 0) {
    return NextResponse.json({
      hasData: false,
      reason: 'No clear activity pattern detected in the last 30 days.',
      recommendedHour: null,
      recommendedLabel: null,
      recommendedTimeISO: null,
      confidence: 'low',
      topHours: [],
    })
  }

  // Build the recommended time (today if best hour is later, else tomorrow).
  const recommended = new Date(now)
  if (bestHour > currentHour) {
    recommended.setHours(bestHour, 0, 0, 0)
  } else {
    recommended.setDate(recommended.getDate() + 1)
    recommended.setHours(bestHour, 0, 0, 0)
  }

  // Confidence: ratio of best weight vs total
  const totalWeight = smoothed.reduce((s, w) => s + w, 0)
  const peakRatio = totalWeight > 0 ? bestWeight / totalWeight : 0
  let confidence: 'low' | 'medium' | 'high' = 'low'
  if (peakRatio > 0.15 && messages.length > 50) confidence = 'high'
  else if (peakRatio > 0.08 && messages.length > 15) confidence = 'medium'

  // Find top 3 hours (sorted by weight) in next 24h
  const sortedTop = [...topHours]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)

  return NextResponse.json({
    hasData: true,
    kind,
    otherUserId,
    recommendedHour: bestHour,
    recommendedLabel: hourLabel(bestHour),
    recommendedTimeISO: recommended.toISOString(),
    recommendedTimeLocal: recommended.toLocaleString(),
    confidence,
    peakRatio: Math.round(peakRatio * 100) / 100,
    topHours: sortedTop,
    totalMessages: messages.length,
    algorithm: 'send-time-v1',
  })
}
