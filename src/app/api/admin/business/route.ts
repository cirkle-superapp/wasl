import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/admin/business — list pending businesses (for admin review)
// In a real system this would require an admin role; here any verified user can review.
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const pending = await db.business.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
    include: {
      owner: {
        select: { id: true, name: true, username: true, email: true, phone: true, verified: true },
      },
    },
  })
  return NextResponse.json({ businesses: pending })
}
