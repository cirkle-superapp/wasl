import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/conversations/[id]/search?q=...
// Search messages within a conversation by content.
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
  if (!q) {
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

  // SQLite/libSQL's `contains` is case-insensitive by default for ASCII,
  // so we don't need `mode: 'insensitive'` (which isn't supported by the
  // libSQL adapter anyway).
  const messages = await db.message.findMany({
    where: {
      conversationId: id,
      content: { contains: q },
      type: { not: 'system' },
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
