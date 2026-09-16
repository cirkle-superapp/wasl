import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/admin/service-providers
// List all pending service provider applications (admin only)
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user is admin (for demo, the 'demo' user is admin)
  const me = await db.user.findUnique({
    where: { id: session.id },
    select: { username: true },
  })
  if (me?.username !== 'demo') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pending'

  const providers = await db.serviceProvider.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    include: {
      owner: {
        select: { id: true, name: true, username: true, phone: true, verified: true },
      },
    },
  })

  return NextResponse.json({ providers })
}

// PATCH /api/admin/service-providers
// Approve or reject a service provider application (admin only)
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const me = await db.user.findUnique({
    where: { id: session.id },
    select: { username: true },
  })
  if (me?.username !== 'demo') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json()
  const { providerId, action, rejectionReason } = body || {}

  if (!providerId || !action) {
    return NextResponse.json({ error: 'providerId and action required' }, { status: 400 })
  }

  const provider = await db.serviceProvider.findUnique({ where: { id: providerId } })
  if (!provider) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (action === 'approve') {
    await db.serviceProvider.update({
      where: { id: providerId },
      data: {
        status: 'approved',
        verified: true,
        verifiedAt: new Date(),
        verifiedBy: session.id,
        canBroadcast: true,
      },
    })
    return NextResponse.json({ ok: true, status: 'approved' })
  } else if (action === 'reject') {
    await db.serviceProvider.update({
      where: { id: providerId },
      data: {
        status: 'rejected',
        rejectionReason: rejectionReason || 'Application rejected',
        canBroadcast: false,
      },
    })
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  return NextResponse.json({ error: 'Invalid action. Use "approve" or "reject".' }, { status: 400 })
}
