import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// PATCH /api/admin/business/[id] — approve or reject a business
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
  const { action, rejectionReason } = body || {}

  if (action === 'approve') {
    const biz = await db.business.update({
      where: { id },
      data: { status: 'approved', verified: true, verifiedAt: new Date(), rejectionReason: null },
    })
    return NextResponse.json({ ok: true, status: 'approved', business: { id: biz.id, name: biz.name } })
  }

  if (action === 'reject') {
    const biz = await db.business.update({
      where: { id },
      data: { status: 'rejected', verified: false, rejectionReason: rejectionReason || 'Documents not sufficient' },
    })
    return NextResponse.json({ ok: true, status: 'rejected', business: { id: biz.id, name: biz.name } })
  }

  return NextResponse.json({ error: 'Invalid action. Use "approve" or "reject".' }, { status: 400 })
}
