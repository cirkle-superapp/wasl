import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/conversations/:id - get a single conversation with details
export async function GET(
  req: NextRequest,
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
              name: true,
              phone: true,
              avatar: true,
              avatarColor: true,
              about: true,
              online: true,
              lastSeen: true,
            },
          },
        },
      },
    },
  })
  if (!conversation) {
    return NextResponse.json(
      { error: 'Conversation not found' },
      { status: 404 }
    )
  }
  const isMember = conversation.participants.some(
    (p) => p.userId === session.id
  )
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let displayName = conversation.name || ''
  let displayAvatar = conversation.avatar
  let displayAvatarColor = conversation.avatarColor
  let otherUser: any = null
  if (!conversation.isGroup) {
    otherUser = conversation.participants.find(
      (p) => p.userId !== session.id
    )?.user
    displayName = otherUser?.name || 'Unknown'
    displayAvatar = otherUser?.avatar ?? null
    displayAvatarColor = otherUser?.avatarColor ?? displayAvatarColor
  }

  return NextResponse.json({
    id: conversation.id,
    name: displayName,
    avatar: displayAvatar,
    avatarColor: displayAvatarColor,
    isGroup: conversation.isGroup,
    participants: conversation.participants.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      phone: p.user.phone,
      avatar: p.user.avatar,
      avatarColor: p.user.avatarColor,
      online: p.user.online,
      lastSeen: p.user.lastSeen,
      about: p.user.about,
    })),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  })
}

// PATCH /api/conversations/:id - update conversation (rename group)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json()
  const { name } = body || {}
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: { participants: true },
  })
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!conversation.isGroup) {
    return NextResponse.json(
      { error: 'Only group conversations can be renamed' },
      { status: 400 }
    )
  }
  const isMember = conversation.participants.some(
    (p) => p.userId === session.id
  )
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const updated = await db.conversation.update({
    where: { id },
    data: { name: name ? String(name).trim() : conversation.name },
  })
  return NextResponse.json({ ok: true, conversation: updated })
}

// DELETE /api/conversations/:id - leave/delete a conversation
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const participation = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!participation) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  }
  await db.participant.delete({
    where: { id: participation.id },
  })
  // If no participants left, delete conversation and messages
  const remaining = await db.participant.count({
    where: { conversationId: id },
  })
  if (remaining === 0) {
    await db.conversation.delete({ where: { id } })
  } else {
    // System message: user left
    if ((await db.conversation.findUnique({ where: { id } }))?.isGroup) {
      await db.message.create({
        data: {
          conversationId: id,
          senderId: session.id,
          content: `${session.name} left`,
          type: 'system',
          status: 'read',
        },
      })
    }
  }
  return NextResponse.json({ ok: true })
}
