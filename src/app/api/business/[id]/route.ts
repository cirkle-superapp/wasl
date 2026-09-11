import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/business/[id] — single business (owner or member only)
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
      members: {
        include: {
          user: {
            select: { id: true, name: true, avatar: true, avatarColor: true, phone: true, verified: true },
          },
        },
      },
      groups: true,
      owner: {
        select: { id: true, name: true, avatar: true, avatarColor: true, verified: true },
      },
    },
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
  return NextResponse.json({
    business: {
      id: business.id,
      name: business.name,
      ownerId: business.ownerId,
      description: business.description,
      avatarPath: business.avatarPath,
      avatarColor: business.avatarColor,
      category: business.category,
      status: business.status,
      verified: business.verified,
      hidePhone: business.hidePhone,
      hiddenPhone: business.hiddenPhone,
      createdAt: business.createdAt,
      owner: {
        id: business.owner.id,
        name: business.owner.name,
        avatar: business.owner.avatar,
        avatarColor: business.owner.avatarColor,
        verified: business.owner.verified,
      },
      members: business.members.map((m) => ({
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
      groups: business.groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        visibility: g.visibility,
        category: g.category,
        conversationId: g.conversationId,
        createdAt: g.createdAt,
      })),
    },
  })
}

// PATCH /api/business/[id] — update business settings (owner/admin only)
export async function PATCH(
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
    return NextResponse.json({ error: 'Only admins can edit the business' }, { status: 403 })
  }
  const body = await req.json()
  const data: any = {}
  if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (typeof body?.description === 'string') data.description = body.description.slice(0, 500)
  if (typeof body?.category === 'string') data.category = body.category
  if (typeof body?.hidePhone === 'boolean') data.hidePhone = body.hidePhone
  if (typeof body?.hiddenPhone === 'string') data.hiddenPhone = body.hiddenPhone || null
  await db.business.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}
