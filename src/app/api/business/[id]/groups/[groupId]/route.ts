import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// PATCH /api/business/[id]/groups/[groupId] — update group visibility/category
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, groupId } = await params
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
    return NextResponse.json({ error: 'Only admins can edit groups' }, { status: 403 })
  }
  const body = await req.json()
  const data: any = {}
  if (body?.visibility === 'public' || body?.visibility === 'private') {
    data.visibility = body.visibility
  }
  if (typeof body?.category === 'string') data.category = body.category
  if (typeof body?.description === 'string') data.description = body.description.slice(0, 300)
  await db.businessGroup.update({ where: { id: groupId }, data })
  return NextResponse.json({ ok: true })
}

// DELETE /api/business/[id]/groups/[groupId] — delete a group
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, groupId } = await params
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
    return NextResponse.json({ error: 'Only admins can delete groups' }, { status: 403 })
  }
  const group = await db.businessGroup.findUnique({ where: { id: groupId } })
  if (group?.conversationId) {
    await db.conversation.delete({ where: { id: group.conversationId } }).catch(() => {})
  }
  await db.businessGroup.delete({ where: { id: groupId } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
