import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/business/search?q=...
// Public search for verified businesses by name. Only approved/verified
// businesses appear. The hidden phone only surfaces in the detail view.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  if (!q) {
    return NextResponse.json({ businesses: [] })
  }
  const businesses = await db.business.findMany({
    where: {
      AND: [
        { verified: true, status: 'approved' },
        {
          OR: [
            { name: { contains: q } },
            { description: { contains: q } },
            { category: { contains: q } },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      description: true,
      avatarPath: true,
      avatarColor: true,
      category: true,
      verified: true,
      hidePhone: true,
    },
    take: 30,
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ businesses })
}
