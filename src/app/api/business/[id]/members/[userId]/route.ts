import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// PATCH /api/business/[id]/members/[userId] — change a member's role
// (promote to admin / demote to member). Owner/admin only.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, userId } = await params
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
    return NextResponse.json({ error: 'Only admins can change roles' }, { status: 403 })
  }
  const body = await req.json()
  const role = body?.role === 'admin' ? 'admin' : 'member'
  await db.businessMember.updateMany({
    where: { businessId: id, userId },
    data: { role },
  })
  return NextResponse.json({ ok: true, role })
}

// DELETE /api/business/[id]/members/[userId] — remove a member.
// Owner/admin only. The owner cannot be removed.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, userId } = await params
  const business = await db.business.findUnique({
    where: { id },
    include: { members: true },
  })
  if (!business) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (business.ownerId === userId) {
    return NextResponse.json({ error: 'Cannot remove the owner' }, { status: 400 })
  }
  const myMembership = business.members.find((m) => m.userId === session.id)
  const isAdmin = business.ownerId === session.id || myMembership?.role === 'admin'
  if (!isAdmin) {
    return NextResponse.json({ error: 'Only admins can remove members' }, { status: 403 })
  }
  await db.businessMember.deleteMany({
    where: { businessId: id, userId },
  })
  return NextResponse.json({ ok: true })
}
