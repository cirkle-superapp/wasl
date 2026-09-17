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

  const me = conversation.participants.find((p) => p.userId === session.id)

  return NextResponse.json({
    id: conversation.id,
    name: displayName,
    avatar: displayAvatar,
    avatarColor: displayAvatarColor,
    isGroup: conversation.isGroup,
    description: conversation.isGroup ? conversation.description : null,
    isAdmin: me?.role === 'admin',
    participants: conversation.participants.map((p) => ({
      userId: p.userId,
      role: p.role,
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

// PATCH /api/conversations/:id - update conversation (rename group / set description, admin only)
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
  const { name, description } = body || {}
  const hasName = typeof name === 'string'
  const hasDescription = typeof description === 'string'
  if (!hasName && !hasDescription) {
    return NextResponse.json(
      { error: 'Provide a name or description to update' },
      { status: 400 }
    )
  }
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: { participants: true },
  })
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!conversation.isGroup) {
    return NextResponse.json(
      { error: 'Only group conversations can be updated' },
      { status: 400 }
    )
  }
  const me = conversation.participants.find((p) => p.userId === session.id)
  if (!me) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (me.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only group admins can update the group' },
      { status: 403 }
    )
  }

  // Build the update payload and validation errors incrementally so name
  // and description can be updated together or independently.
  const data: { name?: string; description?: string | null } = {}
  const systemMessages: string[] = []

  if (hasName) {
    const trimmed = name.trim()
    if (!trimmed) {
      return NextResponse.json(
        { error: 'Group name must not be empty' },
        { status: 400 }
      )
    }
    if (trimmed.length > 100) {
      return NextResponse.json(
        { error: 'Group name must be 100 characters or fewer' },
        { status: 400 }
      )
    }
    if (trimmed !== conversation.name) {
      data.name = trimmed
      systemMessages.push(
        `${session.name} changed the group name to "${trimmed}"`
      )
    }
  }

  if (hasDescription) {
    // Allow clearing the description by sending an empty string. Cap length at
    // 500 characters (matches WhatsApp group description limits).
    if (description.length > 500) {
      return NextResponse.json(
        { error: 'Group description must be 500 characters or fewer' },
        { status: 400 }
      )
    }
    const trimmed = description.trim()
    const previous = conversation.description ?? ''
    if (trimmed !== previous) {
      // Store null instead of an empty string so the column stays "unset".
      data.description = trimmed.length > 0 ? trimmed : null
      systemMessages.push(
        trimmed.length > 0
          ? `${session.name} changed the group description`
          : `${session.name} deleted the group description`
      )
    }
  }

  if (Object.keys(data).length === 0) {
    // Nothing actually changed — short-circuit with a no-op success.
    return NextResponse.json({ ok: true, conversation, unchanged: true })
  }

  const updated = await db.conversation.update({
    where: { id },
    data,
  })

  // Emit a system message for each change (name and/or description).
  for (const content of systemMessages) {
    await db.message.create({
      data: {
        conversationId: id,
        senderId: session.id,
        content,
        type: 'system',
        status: 'read',
      },
    })
  }

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
