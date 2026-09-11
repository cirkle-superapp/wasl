import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/business/search/[id] — public business profile + public groups.
// Anyone (any logged-in user) can view a verified business + its public groups
// and join them. Private groups only appear to members. The hidden phone
// surfaces here (only via this business-search path).
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
    include: {
      owner: {
        select: { id: true, name: true, avatar: true, avatarColor: true, verified: true },
      },
      groups: true,
      members: true,
    },
  })
  if (!business || !business.verified || business.status !== 'approved') {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }
  const isMember =
    business.ownerId === session.id ||
    business.members.some((m) => m.userId === session.id)
  // Public groups are visible to everyone. Private groups only to members.
  const visibleGroups = business.groups.filter(
    (g) => g.visibility === 'public' || isMember
  )
  return NextResponse.json({
    business: {
      id: business.id,
      name: business.name,
      description: business.description,
      avatarPath: business.avatarPath,
      avatarColor: business.avatarColor,
      category: business.category,
      verified: business.verified,
      // Hidden phone surfaces only here, via business search
      phone: business.hidePhone ? business.hiddenPhone : null,
      memberCount: business.members.length,
      createdAt: business.createdAt,
      owner: {
        id: business.owner.id,
        name: business.owner.name,
        verified: business.owner.verified,
      },
      groups: visibleGroups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        visibility: g.visibility,
        category: g.category,
        conversationId: g.conversationId,
      })),
      isMember,
    },
  })
}

// POST /api/business/search/[id] — join a public group of a verified business.
// Body: { groupId } — must be a public group. Adds the current user as a
// participant to the underlying conversation.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json()
  const { groupId } = body || {}
  if (!groupId) {
    return NextResponse.json({ error: 'groupId required' }, { status: 400 })
  }
  const group = await db.businessGroup.findUnique({
    where: { id: groupId },
    include: { business: true },
  })
  if (!group || group.businessId !== id) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }
  if (group.visibility !== 'public') {
    return NextResponse.json(
      { error: 'This group is private. Ask a business admin to invite you.' },
      { status: 403 }
    )
  }
  // Add the user as a participant of the conversation (idempotent)
  const existing = await db.participant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: group.conversationId,
        userId: session.id,
      },
    },
  })
  if (existing) {
    return NextResponse.json({ ok: true, existed: true, conversationId: group.conversationId })
  }
  await db.participant.create({
    data: { conversationId: group.conversationId, userId: session.id },
  })
  await db.message.create({
    data: {
      conversationId: group.conversationId,
      senderId: session.id,
      content: 'A new member joined the group',
      type: 'system',
      status: 'read',
    },
  })
  return NextResponse.json({ ok: true, conversationId: group.conversationId })
}
