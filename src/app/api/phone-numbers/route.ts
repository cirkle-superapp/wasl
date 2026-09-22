import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { rateLimit, getClientIP } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// GET /api/phone-numbers — list my phone numbers (with portal + hide settings)
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const phoneNumbers = await db.phoneNumber.findMany({
    where: { userId: session.id },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json({
    phoneNumbers: phoneNumbers.map((p) => ({
      id: p.id,
      number: p.number,
      label: p.label,
      // Portal display name — when set, this number acts as a separate
      // identity within the user's account. Shown beside the username
      // (e.g. "@sara · Sara Adel (Work)") so the recipient knows which
      // portal the message came from.
      portalName: p.portalName,
      // When true, this number is hidden from other users — they see the
      // username + portal name but not the actual digits.
      hideNumber: p.hideNumber,
      active: p.active,
      createdAt: p.createdAt,
    })),
  })
}

// POST /api/phone-numbers — add a phone number (portal) to my account.
//
// Body: {
//   number, label?, portalName?, hideNumber?, setActive?
// }
//
// The portalName turns this number into a "portal" — a sub-identity within
// the same account. E.g. portalName="Work" makes this the Work portal:
// outgoing messages show "@username · Real Name (Work)" to recipients.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Rate limit: 10 phone-number adds per IP per 60s (anti-spam)
  const ip = getClientIP(req)
  const rl = rateLimit(`phone-numbers:${ip}`, 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many phone-number adds. Try again later.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  const body = await req.json()
  const { number, label, portalName, hideNumber, setActive } = body || {}
  const safeNumber = typeof number === 'string' ? number.trim() : ''
  if (!safeNumber) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
  }
  // Global phone uniqueness across all users
  const existing = await db.user.findFirst({ where: { phone: safeNumber } })
  if (existing && existing.id !== session.id) {
    return NextResponse.json(
      { error: 'This phone number is already registered to another account' },
      { status: 409 }
    )
  }
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
      portalName: typeof portalName === 'string' && portalName.trim()
        ? portalName.trim().slice(0, 40)
        : null,
      hideNumber: hideNumber === true,
      active: makeActive,
    },
  })
  return NextResponse.json({
    id: phoneRecord.id,
    number: phoneRecord.number,
    label: phoneRecord.label,
    portalName: phoneRecord.portalName,
    hideNumber: phoneRecord.hideNumber,
    active: phoneRecord.active,
  })
}
