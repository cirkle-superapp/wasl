import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 })
  }
  // Also return the user's phone numbers
  const phoneNumbers = await db.phoneNumber.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({
    user: {
      ...session,
      phoneNumbers: phoneNumbers.map((p) => ({
        id: p.id,
        number: p.number,
        label: p.label,
        active: p.active,
      })),
    },
  })
}
