import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/messages/[id]/pin
// Toggles the pinned state of a message.
//
// Authorization rules:
//   - In a 1-on-1 conversation: only the message SENDER can pin/unpin their
//     own message (unchanged behaviour).
//   - In a group conversation:
//       * ADMINS (Participant.role === 'admin') can pin/unpin ANY message.
//       * MEMBERS can only pin/unpin their OWN messages.
//
// Only one message per conversation can be pinned at a time — pinning a new
// message will unpin any previously-pinned message in the same conversation.
//
// When an admin pins/unpins someone ELSE's message in a group, a system
// message ("X pinned a message" / "X unpinned a message") is emitted so the
// action is visible to all participants.
//
// Body: { pinned: boolean } — true to pin, false to unpin.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const pinned = !!body?.pinned

  const message = await db.message.findUnique({
    where: { id },
    select: {
      id: true,
      senderId: true,
      conversationId: true,
      pinned: true,
      type: true,
    },
  })
  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Verify membership + capture the role + whether the conversation is a group
  // so we can apply the admin-vs-member-vs-sender authorization matrix.
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: message.conversationId,
        userId: session.id,
      },
    },
    select: { id: true, role: true },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const conversation = await db.conversation.findUnique({
    where: { id: message.conversationId },
    select: { isGroup: true },
  })
  const isGroup = !!conversation?.isGroup
  const isAdmin = isGroup && membership.role === 'admin'
  const isSender = message.senderId === session.id

  // Authorization matrix:
  //   - Sender can always pin/unpin their own message (1-on-1 OR group).
  //   - In a group, admins can pin/unpin ANY message (including others').
  //   - Everyone else is forbidden.
  const canPin = isSender || isAdmin
  if (!canPin) {
    return NextResponse.json(
      {
        error: isGroup
          ? 'Only the sender or a group admin can pin this message'
          : 'You can only pin your own messages',
      },
      { status: 403 }
    )
  }

  // Only emit a system message when an admin acts on someone else's message
  // in a group (sender pinning their own message is a silent personal action,
  // matching the existing 1-on-1 behaviour).
  const adminActingForOther = isAdmin && !isSender

  if (pinned) {
    // Unpin any previously-pinned message in this conversation.
    // Capture the previously-pinned message id (if it was a different message)
    // so the client can update its state via the socket relay.
    const previousPinned = await db.message.findFirst({
      where: { conversationId: message.conversationId, pinned: true, id: { not: id } },
      select: { id: true },
    })
    if (previousPinned) {
      await db.message.update({
        where: { id: previousPinned.id },
        data: { pinned: false },
      })
    }
    await db.message.update({
      where: { id },
      data: { pinned: true },
    })
  } else {
    await db.message.update({
      where: { id },
      data: { pinned: false },
    })
  }

  // Emit a system message when an admin pins/unpins another user's message
  // in a group — keeps the action visible to everyone in the chat timeline.
  // Skip for `system`-type messages (avoid pinning the system log itself) and
  // when the admin is acting on their own message (no public record needed).
  if (adminActingForOther && message.type !== 'system') {
    await db.message.create({
      data: {
        conversationId: message.conversationId,
        senderId: session.id,
        content: pinned
          ? `${session.name} pinned a message`
          : `${session.name} unpinned a message`,
        type: 'system',
        status: 'read',
      },
    })
  }

  return NextResponse.json({ pinned })
}
