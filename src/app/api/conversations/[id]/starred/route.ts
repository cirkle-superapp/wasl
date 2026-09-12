import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/conversations/[id]/starred
// Returns all messages starred by the current user in this conversation.
// A message is "starred" if there's a StarredMessage row linking the message
// to the current user.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  // Verify membership
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find all starred messages for this user in this conversation.
  // We join through StarredMessage → Message → Conversation to ensure we only
  // get messages from this conversation.
  const starred = await db.starredMessage.findMany({
    where: {
      userId: session.id,
      message: { conversationId: id },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      message: {
        select: {
          id: true,
          content: true,
          type: true,
          createdAt: true,
          senderId: true,
          replyToId: true,
          protected: true,
        },
      },
    },
  })

  // Look up sender names for all messages in one query
  const senderIds = Array.from(
    new Set(starred.map((s) => s.message.senderId))
  )
  const senders = await db.user.findMany({
    where: { id: { in: senderIds } },
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      avatarColor: true,
    },
  })
  const senderMap = new Map(senders.map((s) => [s.id, s]))

  return NextResponse.json({
    starred: starred.map((s) => ({
      id: s.id,
      starredAt: s.createdAt,
      message: {
        id: s.message.id,
        content: s.message.content,
        type: s.message.type,
        createdAt: s.message.createdAt,
        senderId: s.message.senderId,
        replyToId: s.message.replyToId,
        protected: s.message.protected,
        sender: senderMap.get(s.message.senderId)
          ? {
              id: senderMap.get(s.message.senderId)!.id,
              name: senderMap.get(s.message.senderId)!.name,
              username: senderMap.get(s.message.senderId)!.username,
              avatar: senderMap.get(s.message.senderId)!.avatar,
              avatarColor: senderMap.get(s.message.senderId)!.avatarColor,
            }
          : null,
      },
    })),
  })
}
