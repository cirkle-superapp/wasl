import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { generateSchoolCode } from '@/lib/school'
import { rateLimit, getClientIP } from '@/lib/rate-limit'
import { pickAvatarColor } from '@/lib/avatar'

export const runtime = 'nodejs'

// GET /api/schools
// List schools. Supports `?mine=true` (only schools the user is a member of
// or owns) and `?q=<query>` (search by name or code).
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const mine = searchParams.get('mine') === 'true'
  const q = (searchParams.get('q') || '').trim().toLowerCase()

  let where: any = {}
  if (mine) {
    // Schools where the user is owner OR a member OR a parent of a student OR the student themselves
    where.OR = [
      { ownerId: session.id },
      { members: { some: { userId: session.id, status: 'active' } } },
      { students: { some: { userId: session.id } } },
      { students: { some: { parentConnections: { some: { parentId: session.id, status: 'confirmed' } } } } },
    ]
  }
  if (q) {
    const qPred = {
      OR: [{ name: { contains: q } }, { code: { contains: q } }, { city: { contains: q } }],
    }
    where = mine ? { AND: [where, qPred] } : qPred
  }

  const schools = await db.school.findMany({
    where,
    orderBy: { studentCount: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      code: true,
      logoColor: true,
      description: true,
      city: true,
      country: true,
      type: true,
      status: true,
      studentCount: true,
      staffCount: true,
      verifiedAt: true,
    },
  })
  return NextResponse.json({ schools })
}

// POST /api/schools
// Register a new school. The registering user becomes the school admin.
// For demo/dev-trial: auto-verify unless explicitly disabled.
//
// Body: { name, code?, description?, type?, city?, country?, phone?, email?, website?, autoVerify? }
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const ip = getClientIP(req)
  const rl = rateLimit(`school-register:${ip}`, 5, 10 * 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many school registrations. Try again later.' },
      { status: 429, headers: { 'Retry-After': '600' } }
    )
  }

  const body = await req.json().catch(() => ({}))
  const name = (body?.name || '').toString().trim()
  if (name.length < 3) {
    return NextResponse.json({ error: 'School name must be at least 3 characters' }, { status: 400 })
  }
  const defaultPrefix = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'SCH'

  let code = (body?.code || '').toString().trim().toUpperCase() || generateSchoolCode(defaultPrefix)
  for (let attempt = 0; attempt < 5; attempt++) {
    const exists = await db.school.findUnique({ where: { code } })
    if (!exists) break
    code = generateSchoolCode(defaultPrefix)
  }

  const description = (body?.description || '').toString().trim()
  const type = (body?.type || 'international').toString()
  const city = (body?.city || '').toString().trim() || null
  const country = (body?.country || '').toString().trim() || null
  const phone = (body?.phone || '').toString().trim() || null
  const email = (body?.email || '').toString().trim() || null
  const website = (body?.website || '').toString().trim() || null
  const autoVerify = body?.autoVerify !== false

  const school = await db.school.create({
    data: {
      name,
      code,
      description,
      logoColor: pickAvatarColor(code),
      city,
      country,
      phone,
      email,
      website,
      ownerId: session.id,
      type,
      status: autoVerify ? 'verified' : 'pending',
      verifiedAt: autoVerify ? new Date() : null,
      verifiedBy: autoVerify ? session.id : null,
    },
  })

  await db.schoolMembership.create({
    data: {
      schoolId: school.id,
      userId: session.id,
      role: 'admin',
      status: 'active',
    },
  })

  return NextResponse.json({
    school: {
      id: school.id,
      name: school.name,
      code: school.code,
      logoColor: school.logoColor,
      status: school.status,
      verifiedAt: school.verifiedAt,
      type: school.type,
      description: school.description,
      city: school.city,
      country: school.country,
    },
  })
}
