import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// PATCH /api/phone-numbers/[id] — set a phone number as active (switch).
// Deactivates all others + updates the User.phone field.
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
  // Deactivate all others
  await db.phoneNumber.updateMany({
    where: { userId: session.id, active: true },
    data: { active: false },
  })
  // Activate this one
  await db.phoneNumber.update({
    where: { id },
    data: { active: true },
  })
  // Update the User.phone field
  await db.user.update({
    where: { id: session.id },
    data: { phone: phone.number },
  })
  return NextResponse.json({ ok: true, activeNumber: phone.number })
}

// DELETE /api/phone-numbers/[id] — remove a phone number.
// If it was active, pick another one to be active (or null if none left).
export async function DELETE(
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
  await db.phoneNumber.delete({ where: { id } })

  // If this was the active number, pick the first remaining (or null)
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
