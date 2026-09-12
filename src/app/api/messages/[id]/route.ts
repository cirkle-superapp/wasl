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
      edited: message.edited,
      starred: !!starred,
      reactions: message.reactions.map((r) => ({
        id: r.id,
        userId: r.userId,
        emoji: r.emoji,
      })),
    },
  })
}

// DELETE /api/messages/[id] — delete a message.
// Query params:
//   forEveryone=true — delete for ALL participants (sender only, within 1 hour)
//   forEveryone=false (default) — delete only for the current user
//
// When deleting for everyone, the message is permanently removed (cascading
// reactions, starred entries, etc.). When deleting for just the current user,
// the message is also permanently removed (this is a simplification — a real
// app would track per-user deletion state).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const forEveryone = searchParams.get('forEveryone') === 'true'

  const message = await db.message.findUnique({
    where: { id },
    select: { senderId: true, conversationId: true, type: true, createdAt: true },
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

  if (forEveryone) {
    // "Delete for everyone" — only the sender can do this, and only within
    // 1 hour of sending (similar to WhatsApp's time limit).
    if (message.senderId !== session.id) {
      return NextResponse.json(
        { error: 'You can only delete your own messages for everyone' },
        { status: 403 }
      )
    }
    const ageMin = (Date.now() - new Date(message.createdAt).getTime()) / 60000
    if (ageMin > 60) {
      return NextResponse.json(
        { error: 'Can only delete for everyone within 1 hour of sending' },
        { status: 403 }
      )
    }
  } else {
    // "Delete for me" — any participant can do this. But since we don't have
    // per-user deletion tracking, we only allow the sender to delete (to
    // prevent a recipient from deleting the sender's message for everyone).
    // A real app would track "deletedForMe" per user.
    if (message.senderId !== session.id) {
      return NextResponse.json(
        { error: 'You can only delete your own messages' },
        { status: 403 }
      )
    }
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
  return NextResponse.json({ ok: true, forEveryone })
}
