import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'

export const runtime = 'nodejs'

// GET /api/users/search?q=...
// Search by name or phone. Excludes current user.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  if (!q) {
    return NextResponse.json({ users: [] })
  }
  // SQLite doesn't support full-text; use contains
  const users = await db.user.findMany({
    where: {
      AND: [
        { id: { not: session.id } },
        {
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      avatar: true,
      avatarColor: true,
      about: true,
      online: true,
      lastSeen: true,
    },
    take: 50,
  })
  const safeUsers = users.map((u) => ({
    ...u,
    avatarColor: u.avatarColor ?? pickAvatarColor(u.id),
  }))
  return NextResponse.json({ users: safeUsers })
}
