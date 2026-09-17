import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/conversations/[id]/search?q=...&from=YYYY-MM-DD&to=YYYY-MM-DD
// Search messages within a conversation by content and/or date range.
//
// - `q`    : substring filter (case-insensitive in SQLite/libSQL).
// - `from` : only messages on or after this date (inclusive lower bound).
// - `to`   : only messages on or before this date (inclusive upper bound,
//            extended to end-of-day so a whole-day `to=2026-12-31` includes
//            messages sent at 23:59 that day).
//
// Either `q` or a date bound may be omitted. When ALL of `q`/`from`/`to` are
// missing the response is an empty `results: []` (no work to do).
//
// Invalid date strings are silently ignored rather than rejected with a 400 —
// this keeps the UI resilient to partial/typo'd `from`/`to` query params.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const fromRaw = searchParams.get('from')
  const toRaw = searchParams.get('to')

  // Parse the date bounds: keep only valid ones. An invalid date string is
  // silently dropped (per the task spec — we don't 400 on bad input).
  let from: Date | undefined
  let to: Date | undefined
  if (fromRaw) {
    const d = new Date(fromRaw)
    if (!Number.isNaN(d.getTime())) from = d
  }
  if (toRaw) {
    const d = new Date(toRaw)
    if (!Number.isNaN(d.getTime())) {
      // Inclusive upper bound: extend to the last millisecond of the day so
      // messages sent at 23:59 on the `to` date are still included.
      d.setHours(23, 59, 59, 999)
      to = d
    }
  }

  // Nothing to search for: no text query AND no valid date bound.
  if (!q && !from && !to) {
    return NextResponse.json({ results: [] })
  }

  // Fetch the user's "deleted for me" message IDs for this conversation so
  // we can exclude them from search results — a message the user hid from
  // their view shouldn't appear in search.
  const deletedForMeRows = await db.deletedForMe.findMany({
    where: { userId: session.id, message: { conversationId: id } },
    select: { messageId: true },
  })
  const deletedIds = new Set(deletedForMeRows.map((d) => d.messageId))

  // Build the createdAt range clause only with the bounds that were provided
  // (Prisma happily accepts an empty object, but it's cleaner to omit it).
  const createdAt: { gte?: Date; lte?: Date } = {}
  if (from) createdAt.gte = from
  if (to) createdAt.lte = to

  // SQLite/libSQL's `contains` is case-insensitive by default for ASCII,
  // so we don't need `mode: 'insensitive'` (which isn't supported by the
  // libSQL adapter anyway).
  const messages = await db.message.findMany({
    where: {
      conversationId: id,
      ...(q ? { content: { contains: q } } : {}),
      type: { not: 'system' },
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      reactions: { select: { id: true, userId: true, emoji: true } },
    },
  })

  // Filter out "deleted for me" messages (not supported directly in the
  // Prisma query because the relation is via DeletedForMe, not a flag on
  // Message).
  const visibleMessages = messages.filter((m) => !deletedIds.has(m.id))
  const starredRows = await db.starredMessage.findMany({
    where: { userId: session.id, message: { conversationId: id } },
    select: { messageId: true },
  })
  const starredIds = new Set(starredRows.map((s) => s.messageId))
  return NextResponse.json({
    results: visibleMessages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      content: m.content,
      type: m.type,
      status: m.status,
      createdAt: m.createdAt,
      commitId: m.commitId,
      starred: starredIds.has(m.id),
      reactions: m.reactions.map((r) => ({
        id: r.id,
        userId: r.userId,
        emoji: r.emoji,
      })),
    })),
  })
}
