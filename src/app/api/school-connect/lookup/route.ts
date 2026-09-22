import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { parseConnectNumber } from '@/lib/school'
import { rateLimit, getClientIP } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// POST /api/school-connect/lookup
// Look up a School Connect Number (or a Join Code alone) and return the
// matching school + student info WITHOUT revealing the join code itself.
//
// Body: { connectNumber }  — accepts:
//   - "NIS-25-08421-7K4P-92XM"  (full School Connect Number)
//   - "NIS-25-08421"            (Student ID alone — caller must also supply joinCode)
//   - "7K4P-92XM"               (Join Code alone — server finds the student)
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const ip = getClientIP(req)
  const rl = rateLimit(`school-connect-lookup:${ip}`, 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many lookups. Try again later.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  const body = await req.json().catch(() => ({}))
  const input = (body?.connectNumber || '').toString().trim()
  if (!input) {
    return NextResponse.json({ error: 'Connect number is required' }, { status: 400 })
  }

  const parsed = parseConnectNumber(input)

  let student: any = null
  let school: any = null

  if (parsed.joinCode) {
    student = await db.schoolStudent.findUnique({
      where: { joinCode: parsed.joinCode },
      include: { school: true },
    })
    if (student) school = student.school
  } else if (parsed.studentId && parsed.schoolCode) {
    const prefix = parsed.schoolCode
    const possibleSchools = await db.school.findMany({
      where: { code: { startsWith: prefix + '-' } },
    })
    for (const sch of possibleSchools) {
      const found = await db.schoolStudent.findUnique({
        where: { schoolId_studentId: { schoolId: sch.id, studentId: parsed.studentId } },
        include: { school: true },
      })
      if (found) {
        student = found
        school = found.school
        break
      }
    }
  }

  if (!student || !school) {
    return NextResponse.json(
      { error: 'No student found for this Connect Number. Check the number and try again.' },
      { status: 404 }
    )
  }

  let joinCodeStatus: 'valid' | 'revoked' | 'expired' | 'not_yet_generated' = 'valid'
  if (!student.joinCode) joinCodeStatus = 'not_yet_generated'
  else if (student.joinCodeRevoked) joinCodeStatus = 'revoked'
  else if (student.joinCodeExpiresAt && new Date(student.joinCodeExpiresAt).getTime() < Date.now())
    joinCodeStatus = 'expired'

  return NextResponse.json({
    school: {
      id: school.id,
      name: school.name,
      code: school.code,
      logoColor: school.logoColor,
      city: school.city,
      country: school.country,
      type: school.type,
      status: school.status,
      verifiedAt: school.verifiedAt,
    },
    student: {
      id: student.id,
      studentId: student.studentId,
      fullName: student.fullName,
      grade: student.grade,
      className: student.className,
      status: student.status,
    },
    joinCodeStatus,
    canSelfJoin: !student.userId,
  })
}
