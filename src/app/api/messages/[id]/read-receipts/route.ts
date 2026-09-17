import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/messages/[id]/read-receipts
// Returns a FULL breakdown of per-recipient delivery status for a message the
// caller sent. The response has three buckets:
//
//   {
//     readBy:      [{ userId, name, username, avatar, avatarColor, online,
//                     lastSeen, readAt }],
//     deliveredTo: [{ userId, name, username, avatar, avatarColor, online,
//                     lastSeen, deliveredAt }],
//     pending:     [{ userId, name, username, avatar, avatarColor, online,
//                     lastSeen }],
//     totalParticipants: number
//   }
//
// Bucketing rules (the data model has no per-recipient delivery record, so we
// infer each recipient's status from `Participant.lastReadAt` +
// `User.online` / `User.lastSeen` relative to `Message.createdAt`):
//
//   - READ       → lastReadAt >= message.createdAt
//                  (participant opened the conversation since the message was
//                   sent, which is how Wasl tracks read receipts.)
//   - DELIVERED  → lastReadAt <  message.createdAt  AND
//                  (user.online === true  OR  user.lastSeen >= message.createdAt)
//                  (participant has been online since the message was sent,
//                   so it reached their device, but they haven't opened this
//                   chat yet.)
//   - PENDING    → lastReadAt <  message.createdAt  AND
//                  user.online === false  AND  user.lastSeen < message.createdAt
//                  (participant hasn't been online since the message was sent,
//                   so it hasn't been delivered yet.)
//
// Only the SENDER of the message can view read receipts (403 otherwise).
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

  // Fetch ALL participants in this conversation (excluding the sender). We
  // pull lastReadAt + the user's online/lastSeen so we can bucket each one.
  const participants = await db.participant.findMany({
    where: {
      conversationId: message.conversationId,
      userId: { not: session.id },
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

  const messageCreatedAt = message.createdAt.getTime()

  const readBy: Array<{
    userId: string
    name: string
    username: string
    avatar: string | null
    avatarColor: string | null
    online: boolean
    lastSeen: string
    readAt: string
  }> = []
  const deliveredTo: Array<{
    userId: string
    name: string
    username: string
    avatar: string | null
    avatarColor: string | null
    online: boolean
    lastSeen: string
    deliveredAt: string
  }> = []
  const pending: Array<{
    userId: string
    name: string
    username: string
    avatar: string | null
    avatarColor: string | null
    online: boolean
    lastSeen: string
  }> = []

  for (const p of participants) {
    const lastReadAtTs = p.lastReadAt.getTime()
    const lastSeenTs = p.user.lastSeen.getTime()
    const userIsOnline = !!p.user.online
    const hasBeenOnlineSinceMessage =
      userIsOnline || lastSeenTs >= messageCreatedAt

    const base = {
      userId: p.userId,
      name: p.user.name,
      username: p.user.username,
      avatar: p.user.avatar,
      avatarColor: p.user.avatarColor,
      online: userIsOnline,
      lastSeen: p.user.lastSeen.toISOString(),
    }

    if (lastReadAtTs >= messageCreatedAt) {
      // READ — participant opened the chat since the message was sent.
      readBy.push({
        ...base,
        readAt: p.lastReadAt.toISOString(),
      })
    } else if (hasBeenOnlineSinceMessage) {
      // DELIVERED — the message reached the participant's device (they were
      // online at/after the message was created) but they haven't opened this
      // chat yet. The closest proxy for "deliveredAt" is the user's
      // lastSeen — the time they were last connected.
      deliveredTo.push({
        ...base,
        deliveredAt: p.user.lastSeen.toISOString(),
      })
    } else {
      // PENDING — participant hasn't been online since the message was sent,
      // so the message hasn't been delivered to their device yet.
      pending.push(base)
    }
  }

  return NextResponse.json({
    readBy,
    deliveredTo,
    pending,
    totalParticipants: participants.length,
  })
}
