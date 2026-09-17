import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// ---- Shared helpers -------------------------------------------------------

/**
 * Fetch the requester's Participant row for this conversation and confirm
 * they are an admin. Returns either the conversation (with participants) or
 * an appropriate NextResponse to short-circuit the request.
 */
async function requireAdmin(
  conversationId: string,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>
): Promise<
  | {
      ok: true
      conversation: NonNullable<Awaited<ReturnType<typeof db.conversation.findUnique>>>
    }
  | { ok: false; response: NextResponse }
> {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: true },
  })
  if (!conversation) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  if (!conversation.isGroup) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Only group conversations support invite links' },
        { status: 400 }
      ),
    }
  }
  const me = conversation.participants.find((p) => p.userId === session.id)
  if (!me) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  if (me.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Only group admins can manage the invite link' },
        { status: 403 }
      ),
    }
  }
  return { ok: true, conversation }
}

// GET /api/conversations/:id/invite — return the current invite link.
// Any member of the group can view the link (so they can share it). Returns
// `{ inviteUrl: null }` when no token has been generated yet.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const conversation = await db.conversation.findUnique({
    where: { id },
    select: {
      isGroup: true,
      inviteToken: true,
      inviteTokenSetAt: true,
      participants: { select: { userId: true } },
    },
  })
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!conversation.isGroup) {
    return NextResponse.json(
      { error: 'Only group conversations support invite links' },
      { status: 400 }
    )
  }
  const isMember = conversation.participants.some((p) => p.userId === session.id)
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!conversation.inviteToken) {
    return NextResponse.json({ inviteUrl: null, token: null, setAt: null })
  }

  return NextResponse.json({
    inviteUrl: `/join/${conversation.inviteToken}`,
    token: conversation.inviteToken,
    setAt: conversation.inviteTokenSetAt,
  })
}

// POST /api/conversations/:id/invite — generate (or regenerate) the invite
// token (admin only). If a token already exists, the old link stops working
// immediately. Emits a system message recording the change.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const guard = await requireAdmin(id, session)
  if (!guard.ok) return guard.response
  const conversation = guard.conversation

  const token = randomUUID()
  const now = new Date()

  const hadPreviousToken = !!conversation.inviteToken

  const updated = await db.conversation.update({
    where: { id },
    data: {
      inviteToken: token,
      inviteTokenSetAt: now,
    },
    select: { inviteToken: true, inviteTokenSetAt: true },
  })

  await db.message.create({
    data: {
      conversationId: id,
      senderId: session.id,
      content: hadPreviousToken
        ? `${session.name} reset the group invite link`
        : `${session.name} created the group invite link`,
      type: 'system',
      status: 'read',
    },
  })

  return NextResponse.json({
    inviteUrl: `/join/${updated.inviteToken}`,
    token: updated.inviteToken,
    setAt: updated.inviteTokenSetAt,
  })
}

// DELETE /api/conversations/:id/invite — revoke the invite link (admin only).
// Clears `inviteToken` so the existing link stops working immediately.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const guard = await requireAdmin(id, session)
  if (!guard.ok) return guard.response
  const conversation = guard.conversation

  // No-op if there is no token to revoke — keeps the call idempotent.
  if (!conversation.inviteToken) {
    return NextResponse.json({ ok: true, revoked: false })
  }

  await db.conversation.update({
    where: { id },
    data: {
      inviteToken: null,
      inviteTokenSetAt: null,
    },
  })

  await db.message.create({
    data: {
      conversationId: id,
      senderId: session.id,
      content: `${session.name} revoked the group invite link`,
      type: 'system',
      status: 'read',
    },
  })

  return NextResponse.json({ ok: true, revoked: true })
}
