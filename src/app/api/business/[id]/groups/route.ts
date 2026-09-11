import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'

export const runtime = 'nodejs'

// GET /api/business/[id]/groups — list groups in a business
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const business = await db.business.findUnique({
    where: { id },
    include: { members: true },
  })
  if (!business) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const isMember =
    business.ownerId === session.id ||
    business.members.some((m) => m.userId === session.id)
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const groups = await db.businessGroup.findMany({
    where: { businessId: id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ groups })
}

// POST /api/business/[id]/groups — create a group (public or private).
// Creates the underlying Conversation + links a BusinessGroup record.
// Owner/admin only. All current business members are auto-added as participants.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const business = await db.business.findUnique({
    where: { id },
    include: { members: true },
  })
  if (!business) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const myMembership = business.members.find((m) => m.userId === session.id)
  const isAdmin = business.ownerId === session.id || myMembership?.role === 'admin'
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Only the owner or admins can create groups' },
      { status: 403 }
    )
  }
  const body = await req.json()
  const {
    name,
    description = '',
    visibility = 'private',
    category,
  } = body || {}
  const safeName = typeof name === 'string' ? name.trim() : ''
  if (!safeName) {
    return NextResponse.json({ error: 'Group name is required' }, { status: 400 })
  }
  if (visibility !== 'public' && visibility !== 'private') {
    return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 })
  }
  // Create the conversation + add all business members as participants
  const memberIds = Array.from(
    new Set([business.ownerId, ...business.members.map((m) => m.userId)])
  )
  const conversation = await db.conversation.create({
    data: {
      name: safeName,
      isGroup: true,
      createdBy: session.id,
      avatarColor: pickAvatarColor(`${business.name}-${safeName}`),
      participants: {
        create: memberIds.map((uid) => ({ userId: uid })),
      },
    },
  })
  // System message
  await db.message.create({
    data: {
      conversationId: conversation.id,
      senderId: session.id,
      content: `${business.name} created the group "${safeName}"`,
      type: 'system',
      status: 'read',
    },
  })
  const group = await db.businessGroup.create({
    data: {
      businessId: id,
      conversationId: conversation.id,
      name: safeName,
      description: String(description || '').slice(0, 300),
      visibility,
      category: typeof category === 'string' ? category : null,
      createdBy: session.id,
    },
  })
  return NextResponse.json(
    {
      ok: true,
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        visibility: group.visibility,
        category: group.category,
        conversationId: group.conversationId,
        createdAt: group.createdAt,
      },
      conversationId: conversation.id,
    },
    { status: 201 }
  )
}
