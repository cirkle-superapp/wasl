import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/messages/[id]/read-receipts
// Returns the list of participants who have read this message (i.e. whose
// `lastReadAt` is >= the message's `createdAt`), excluding the sender.
// Only the SENDER of the message can view read receipts.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const message = await db.message.findUnique({
    where: { id },
    select: {
      id: true,
      senderId: true,
      createdAt: true,
      conversationId: true,
    },
  })
  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Only the sender can view read receipts
  if (message.senderId !== session.id) {
    return NextResponse.json(
      { error: 'Only the sender can view read receipts' },
      { status: 403 }
    )
  }

  // Find all participants in this conversation (excluding the sender)
  // whose lastReadAt is >= the message's createdAt.
  const participants = await db.participant.findMany({
    where: {
      conversationId: message.conversationId,
      userId: { not: session.id },
      lastReadAt: { gte: message.createdAt },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          avatarColor: true,
          online: true,
          lastSeen: true,
        },
      },
    },
    orderBy: { lastReadAt: 'desc' },
  })

  return NextResponse.json({
    readBy: participants.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      username: p.user.username,
      avatar: p.user.avatar,
      avatarColor: p.user.avatarColor,
      online: p.user.online,
      lastSeen: p.user.lastSeen,
      readAt: p.lastReadAt,
    })),
    totalParticipants: await db.participant.count({
      where: {
        conversationId: message.conversationId,
        userId: { not: session.id },
      },
    }),
  })
}
