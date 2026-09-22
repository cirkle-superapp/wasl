import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// PATCH /api/phone-numbers/[id] — update phone number settings OR switch active.
//
// Body (any subset):
//   { active?: true, portalName?: string|null, hideNumber?: boolean, label?: string|null }
//
// - When `active: true`, deactivates all others + updates User.phone (portal switch)
// - When `portalName` is provided, updates the portal display name (use null to clear)
// - When `hideNumber` is provided, updates the hide flag
// - When `label` is provided, updates the friendly label
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const phone = await db.phoneNumber.findUnique({ where: { id } })
  if (!phone || phone.userId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const patch: any = {}

  if (body?.active === true) {
    // Switch active portal — deactivate all others + update User.phone
    await db.phoneNumber.updateMany({
      where: { userId: session.id, active: true },
      data: { active: false },
    })
    patch.active = true
    // Update the denormalized User.phone field
    await db.user.update({
      where: { id: session.id },
      data: { phone: phone.number },
    })
  }

  if ('portalName' in body) {
    const v = body.portalName
    if (v === null) {
      patch.portalName = null
    } else if (typeof v === 'string') {
      patch.portalName = v.trim().slice(0, 40) || null
    }
  }

  if (typeof body?.hideNumber === 'boolean') {
    patch.hideNumber = body.hideNumber
  }

  if ('label' in body) {
    const v = body.label
    if (v === null) {
      patch.label = null
    } else if (typeof v === 'string') {
      patch.label = v.trim().slice(0, 30) || null
    }
  }

  const updated = await db.phoneNumber.update({
    where: { id },
    data: patch,
  })

  return NextResponse.json({
    id: updated.id,
    number: updated.number,
    label: updated.label,
    portalName: updated.portalName,
    hideNumber: updated.hideNumber,
    active: updated.active,
  })
}

// DELETE /api/phone-numbers/[id] — remove a phone number / portal.
// If it was active, pick another one to be active (or null if none left).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const phone = await db.phoneNumber.findUnique({ where: { id } })
  if (!phone || phone.userId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  await db.phoneNumber.delete({ where: { id } })

  if (phone.active) {
    const next = await db.phoneNumber.findFirst({
      where: { userId: session.id },
      orderBy: { createdAt: 'asc' },
    })
    if (next) {
      await db.phoneNumber.update({
        where: { id: next.id },
        data: { active: true },
      })
      await db.user.update({
        where: { id: session.id },
        data: { phone: next.number },
      })
    } else {
      await db.user.update({
        where: { id: session.id },
        data: { phone: null },
      })
    }
  }
  return NextResponse.json({ ok: true })
}
