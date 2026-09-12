import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/messages/[id]/pin
// Toggles the pinned state of a message. Only the sender can pin their own
// message. Only one message per conversation can be pinned at a time — pinning
// a new message will unpin any previously-pinned message in the same
// conversation.
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
    select: { id: true, senderId: true, conversationId: true },
  })
  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Verify membership
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: message.conversationId,
        userId: session.id,
      },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (pinned) {
    // Only the sender can pin
    if (message.senderId !== session.id) {
      return NextResponse.json(
        { error: 'You can only pin your own messages' },
        { status: 403 }
      )
    }
    // Unpin any previously-pinned message in this conversation
    await db.message.updateMany({
      where: { conversationId: message.conversationId, pinned: true },
      data: { pinned: false },
    })
    // Pin the new message
    await db.message.update({
      where: { id },
      data: { pinned: true },
    })
  } else {
    // Unpin — any participant can unpin
    await db.message.update({
      where: { id },
      data: { pinned: false },
    })
  }

  return NextResponse.json({ pinned })
}
