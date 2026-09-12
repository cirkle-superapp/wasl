import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/messages/[id] — single message with reactions + starred status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const message = await db.message.findUnique({
    where: { id },
    include: {
      reactions: { select: { id: true, userId: true, emoji: true } },
    },
  })
  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const isMember = await db.participant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: message.conversationId,
        userId: session.id,
      },
    },
  })
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const starred = await db.starredMessage.findUnique({
    where: { messageId_userId: { messageId: id, userId: session.id } },
  })
  return NextResponse.json({
    message: {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      type: message.type,
      status: message.status,
      createdAt: message.createdAt,
      replyToId: message.replyToId,
      commitId: message.commitId,
      protected: message.protected,
      starred: !!starred,
      reactions: message.reactions.map((r) => ({
        id: r.id,
        userId: r.userId,
        emoji: r.emoji,
      })),
    },
  })
}

// DELETE /api/messages/[id] — delete a message (sender only).
// Also cascades reactions + starred entries via Prisma onDelete: Cascade.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const message = await db.message.findUnique({
    where: { id },
    select: { senderId: true, conversationId: true, type: true },
  })
  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (message.senderId !== session.id) {
    return NextResponse.json(
      { error: 'You can only delete your own messages' },
      { status: 403 }
    )
  }
  // For commit-type messages, also delete the linked Commit.
  if (message.type === 'commit') {
    const fullMsg = await db.message.findUnique({
      where: { id },
      select: { commitId: true },
    })
    if (fullMsg?.commitId) {
      await db.commit.delete({ where: { id: fullMsg.commitId } }).catch(() => {})
    }
  }
  await db.message.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
