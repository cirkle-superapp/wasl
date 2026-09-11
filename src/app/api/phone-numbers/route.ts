import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/phone-numbers — list my phone numbers
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const phoneNumbers = await db.phoneNumber.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({
    phoneNumbers: phoneNumbers.map((p) => ({
      id: p.id,
      number: p.number,
      label: p.label,
      active: p.active,
      createdAt: p.createdAt,
    })),
  })
}

// POST /api/phone-numbers — add a phone number to my account
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const { number, label, setActive } = body || {}
  const safeNumber = typeof number === 'string' ? number.trim() : ''
  if (!safeNumber) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
  }
  // Check uniqueness across all users (global phone uniqueness)
  const existing = await db.user.findFirst({ where: { phone: safeNumber } })
  if (existing && existing.id !== session.id) {
    return NextResponse.json(
      { error: 'This phone number is already registered to another account' },
      { status: 409 }
    )
  }
  // Also check within my own phone numbers
  const myExisting = await db.phoneNumber.findUnique({
    where: { userId_number: { userId: session.id, number: safeNumber } },
  })
  if (myExisting) {
    return NextResponse.json(
      { error: 'You already have this phone number added' },
      { status: 409 }
    )
  }

  const makeActive = setActive !== false // default true
  // If making active, deactivate all others + update User.phone
  if (makeActive) {
    await db.phoneNumber.updateMany({
      where: { userId: session.id, active: true },
      data: { active: false },
    })
    await db.user.update({
      where: { id: session.id },
      data: { phone: safeNumber },
    })
  }

  const phoneRecord = await db.phoneNumber.create({
    data: {
      userId: session.id,
      number: safeNumber,
      label: typeof label === 'string' ? label.trim().slice(0, 30) : null,
      active: makeActive,
    },
  })
  return NextResponse.json({
    id: phoneRecord.id,
    number: phoneRecord.number,
    label: phoneRecord.label,
    active: phoneRecord.active,
  })
}
