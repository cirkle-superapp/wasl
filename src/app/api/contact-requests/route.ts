import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/contact-requests — list pending contact requests for the current user
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pendingRequests = await db.contact.findMany({
    where: {
      userId: session.id,
      notes: { startsWith: 'pending-confirmation:' },
    },
    include: {
      owner: {
        select: {
          id: true, name: true, username: true, avatar: true,
          avatarColor: true, phone: true, about: true, verified: true,
        },
      },
    },
    orderBy: { addedAt: 'desc' },
  })

  return NextResponse.json({
    requests: pendingRequests.map((r) => ({
      id: r.id, requester: r.owner, nickname: r.nickname, addedAt: r.addedAt,
    })),
  })
}

// POST /api/contact-requests — accept or reject a contact request
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { action, requestId } = body

  if (!action || !requestId) {
    return NextResponse.json({ error: 'action and requestId required' }, { status: 400 })
  }

  if (action !== 'accept' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "accept" or "reject"' }, { status: 400 })
  }

  const contact = await db.contact.findUnique({ where: { id: requestId } })
  if (!contact || contact.userId !== session.id) {
    return NextResponse.json({ error: 'Contact request not found' }, { status: 404 })
  }

  if (!contact.notes?.startsWith('pending-confirmation:')) {
    return NextResponse.json({ error: 'This contact is not pending' }, { status: 400 })
  }

  if (action === 'accept') {
    await db.contact.update({ where: { id: requestId }, data: { notes: null } })
    const existingReverse = await db.contact.findFirst({
      where: { ownerId: session.id, userId: contact.ownerId },
    })
    if (!existingReverse) {
      await db.contact.create({
        data: { ownerId: session.id, userId: contact.ownerId, nickname: null, phone: null, notes: null },
      })
    }
    return NextResponse.json({ ok: true, action: 'accepted' })
  } else {
    await db.contact.delete({ where: { id: requestId } })
    return NextResponse.json({ ok: true, action: 'rejected' })
  }
}
