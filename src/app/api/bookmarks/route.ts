import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/bookmarks?done=true|false&q=search
// Returns all bookmarks for the current user (include message + conversation
// info). Sort by createdAt desc.
//
// Optional query params:
//   - done=true|false  → filter by the bookmark's done state
//   - q=<search>       → case-insensitive substring match against the bookmark's
//                        note OR the underlying message content
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const doneParam = searchParams.get('done')
  const q = searchParams.get('q')?.trim() || ''

  // Build the Prisma `where` clause. We always scope by userId, then add the
  // optional filters on top.
  const where: {
    userId: string
    done?: boolean
    OR?: Array<
      | { note: { contains: string } }
      | { message: { content: { contains: string } } }
    >
  } = { userId: session.id }

  if (doneParam === 'true') where.done = true
  if (doneParam === 'false') where.done = false

  if (q) {
    where.OR = [
      { note: { contains: q } },
      { message: { content: { contains: q } } },
    ]
  }

  const bookmarks = await db.bookmark.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
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
          conversationId: true,
        },
      },
    },
  })

  // Look up related conversations + senders in batched queries so we don't
  // fire N+1 queries.
  const conversationIds = Array.from(
    new Set(bookmarks.map((b) => b.message.conversationId))
  )
  const senderIds = Array.from(
    new Set(bookmarks.map((b) => b.message.senderId))
  )

  const [conversations, senders] = await Promise.all([
    db.conversation.findMany({
      where: { id: { in: conversationIds } },
      select: {
        id: true,
        name: true,
        isGroup: true,
        avatar: true,
        avatarColor: true,
      },
    }),
    db.user.findMany({
      where: { id: { in: senderIds } },
      select: {
        id: true,
        name: true,
        username: true,
        avatar: true,
        avatarColor: true,
      },
    }),
  ])

  const convMap = new Map(conversations.map((c) => [c.id, c]))
  const senderMap = new Map(senders.map((s) => [s.id, s]))

  return NextResponse.json({
    bookmarks: bookmarks.map((b) => {
      const conv = convMap.get(b.message.conversationId) || null
      const sender = senderMap.get(b.message.senderId) || null
      return {
        id: b.id,
        note: b.note,
        done: b.done,
        doneAt: b.doneAt,
        createdAt: b.createdAt,
        message: {
          id: b.message.id,
          content: b.message.content,
          type: b.message.type,
          createdAt: b.message.createdAt,
          senderId: b.message.senderId,
          replyToId: b.message.replyToId,
          protected: b.message.protected,
          conversationId: b.message.conversationId,
          sender: sender
            ? {
                id: sender.id,
                name: sender.name,
                username: sender.username,
                avatar: sender.avatar,
                avatarColor: sender.avatarColor,
              }
            : null,
          conversation: conv
            ? {
                id: conv.id,
                name: conv.name,
                isGroup: conv.isGroup,
                avatar: conv.avatar,
                avatarColor: conv.avatarColor,
              }
            : null,
        },
      }
    }),
  })
}

// POST /api/bookmarks
// Body: { messageId, note? }
// Returns 409 if already bookmarked (unique constraint).
// Returns { ok: true, id } on success.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const messageId =
    body && typeof body.messageId === 'string' ? body.messageId : null
  if (!messageId) {
    return NextResponse.json(
      { error: 'messageId is required' },
      { status: 400 }
    )
  }
  const note =
    body && typeof body.note === 'string' && body.note.trim()
      ? body.note.trim()
      : null

  // Verify the message exists AND the user is a participant of the parent
  // conversation (don't let users bookmark messages they can't see).
  const message = await db.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true },
  })
  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: message.conversationId,
        userId: session.id,
      },
    },
    select: { id: true },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Enforce the unique constraint ourselves so we can return a clean 409
  // (Prisma's P2002 error also works, but this is more readable).
  const existing = await db.bookmark.findUnique({
    where: {
      userId_messageId: { userId: session.id, messageId },
    },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'Already bookmarked', id: existing.id },
      { status: 409 }
    )
  }

  const bookmark = await db.bookmark.create({
    data: { userId: session.id, messageId, note },
  })
  return NextResponse.json({ ok: true, id: bookmark.id })
}
