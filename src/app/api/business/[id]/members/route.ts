import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/business/[id]/members — list members (owner or member only)
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
  const members = await db.businessMember.findMany({
    where: { businessId: id },
    include: {
      user: {
        select: { id: true, name: true, avatar: true, avatarColor: true, phone: true, verified: true },
      },
    },
  })
  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      userId: m.userId,
      name: m.user?.name,
      avatar: m.user?.avatar,
      avatarColor: m.user?.avatarColor,
      phone: m.user?.phone,
      verified: m.user?.verified,
      joinedAt: m.joinedAt,
    })),
  })
}

// POST /api/business/[id]/members — invite a member (owner or admin only).
// Only admins/owner can invite people into the business.
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
      { error: 'Only the owner or admins can invite people to the business' },
      { status: 403 }
    )
  }
  const body = await req.json()
  const { userId, role = 'member' } = body || {}
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }
  // The invited user must exist
  const target = await db.user.findUnique({ where: { id: userId } })
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  try {
    await db.businessMember.create({
      data: {
        businessId: id,
        userId,
        role: role === 'admin' ? 'admin' : 'member',
        invitedBy: session.id,
      },
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: 'User is already a member' },
        { status: 409 }
      )
    }
    throw err
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}
