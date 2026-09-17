import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'

export const runtime = 'nodejs'

// ---- Shared helpers -------------------------------------------------------

/**
 * Fetch the requester's Participant row for this conversation and confirm
 * they are an admin. Returns either the conversation (with participants)
 * or an appropriate NextResponse to short-circuit the request.
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
        { error: 'Only group conversations support member management' },
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
        { error: 'Only group admins can perform this action' },
        { status: 403 }
      ),
    }
  }
  return { ok: true, conversation }
}

// GET /api/conversations/:id/members — list members with their role
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
    include: {
      participants: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              phone: true,
              avatar: true,
              avatarColor: true,
              about: true,
              online: true,
              lastSeen: true,
              verified: true,
            },
          },
        },
      },
    },
  })
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const isMember = conversation.participants.some((p) => p.userId === session.id)
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const members = conversation.participants
    .slice()
    .sort((a, b) => {
      // admins first, then by join date
      if (a.role === 'admin' && b.role !== 'admin') return -1
      if (a.role !== 'admin' && b.role === 'admin') return 1
      return a.joinedAt.getTime() - b.joinedAt.getTime()
    })
    .map((p) => ({
      userId: p.userId,
      role: p.role,
      joinedAt: p.joinedAt,
      username: p.user.username,
      name: p.user.name,
      phone: p.user.phone,
      avatar: p.user.avatar,
      avatarColor: p.user.avatarColor ?? pickAvatarColor(p.user.id),
      about: p.user.about,
      online: p.user.online,
      lastSeen: p.user.lastSeen,
      verified: p.user.verified,
    }))

  return NextResponse.json({
    members,
    isAdmin: members.some((m) => m.userId === session.id && m.role === 'admin'),
  })
}

// POST /api/conversations/:id/members — add a member (admin only)
// Body: { userId }
export async function POST(
  req: NextRequest,
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

  let body: { userId?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const userId =
    typeof body?.userId === 'string' ? body.userId.trim() : ''
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }
  if (userId === session.id) {
    return NextResponse.json(
      { error: 'You are already in this group' },
      { status: 400 }
    )
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, username: true },
  })
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Already a member?
  const existing = await db.participant.findUnique({
    where: { conversationId_userId: { conversationId: id, userId } },
  })
  if (existing) {
    return NextResponse.json({ ok: true, alreadyMember: true })
  }

  await db.participant.create({
    data: {
      conversationId: id,
      userId,
      role: 'member',
    },
  })

  await db.message.create({
    data: {
      conversationId: id,
      senderId: session.id,
      content: `${session.name} added ${target.name} to the group`,
      type: 'system',
      status: 'read',
    },
  })

  // touch updatedAt so the conversation floats to the top of the sidebar
  await db.conversation.update({ where: { id }, data: { updatedAt: new Date() } })

  return NextResponse.json({ ok: true })
}

// DELETE /api/conversations/:id/members?userId=... — remove a member (admin only)
export async function DELETE(
  req: NextRequest,
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

  const { searchParams } = new URL(req.url)
  const userId = (searchParams.get('userId') || '').trim()
  if (!userId) {
    return NextResponse.json(
      { error: 'userId query param is required' },
      { status: 400 }
    )
  }

  const target = await db.participant.findUnique({
    where: { conversationId_userId: { conversationId: id, userId } },
    include: { user: { select: { name: true } } },
  })
  if (!target) {
    return NextResponse.json(
      { error: 'User is not a member of this group' },
      { status: 404 }
    )
  }

  const targetName = target.user.name

  await db.participant.delete({ where: { id: target.id } })

  await db.message.create({
    data: {
      conversationId: id,
      senderId: session.id,
      content: `${session.name} removed ${targetName}`,
      type: 'system',
      status: 'read',
    },
  })

  await db.conversation.update({ where: { id }, data: { updatedAt: new Date() } })

  return NextResponse.json({ ok: true })
}
