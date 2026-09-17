import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/drafts
// Returns all drafts for the current user. Used by the sidebar to show
// "Draft" badges + "Draft: <preview>" last-message previews per conversation.
//
// Response shape: { drafts: [{ conversationId, content, replyToId, updatedAt }] }
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const drafts = await db.draft.findMany({
    where: { userId: session.id },
    select: {
      conversationId: true,
      content: true,
      replyToId: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({
    drafts: drafts.map((d) => ({
      conversationId: d.conversationId,
      content: d.content,
      replyToId: d.replyToId,
      updatedAt: d.updatedAt,
    })),
  })
}

// POST /api/drafts
// Body: { conversationId, content, replyToId? }
// Upserts a draft for the current user on the given conversation.
//
// Special case: if `content` is empty (after trim), the draft is DELETED
// instead of saved with an empty string. This keeps the table clean and lets
// the sidebar badge disappear as soon as the user clears the textarea.
//
// Returns { ok: true } on success.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const conversationId =
    body && typeof body.conversationId === 'string' ? body.conversationId : null
  if (!conversationId) {
    return NextResponse.json(
      { error: 'conversationId is required' },
      { status: 400 }
    )
  }

  // Verify the user is a participant of the target conversation — don't let
  // users save drafts for conversations they aren't a member of.
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId: session.id,
      },
    },
    select: { id: true },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const content =
    body && typeof body.content === 'string' ? body.content : ''
  const replyToId =
    body && typeof body.replyToId === 'string' && body.replyToId.trim()
      ? body.replyToId
      : null

  // Empty draft → delete if it exists, otherwise no-op. Always returns ok so
  // the client doesn't have to special-case the empty state.
  if (!content.trim()) {
    try {
      await db.draft.delete({
        where: {
          userId_conversationId: { userId: session.id, conversationId },
        },
      })
    } catch {
      // P2025 = record not found — fine, we wanted it gone anyway.
    }
    return NextResponse.json({ ok: true, deleted: true })
  }

  // Upsert on the (userId, conversationId) unique constraint — creates the
  // draft if it doesn't exist, otherwise updates `content` + `replyToId`.
  await db.draft.upsert({
    where: {
      userId_conversationId: { userId: session.id, conversationId },
    },
    create: {
      userId: session.id,
      conversationId,
      content,
      replyToId,
    },
    update: {
      content,
      replyToId,
    },
  })

  return NextResponse.json({ ok: true })
}
