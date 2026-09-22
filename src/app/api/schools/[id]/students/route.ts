import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { generateStudentId, generateJoinCode } from '@/lib/school'

export const runtime = 'nodejs'

// GET /api/schools/[id]/students
// Admin-only: list all students at a school with their join codes.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: schoolId } = await params

  // Verify the calling user is an admin of this school.
  const membership = await db.schoolMembership.findUnique({
    where: { schoolId_userId: { schoolId, userId: session.id } },
  })
  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — school admin only' }, { status: 403 })
  }

  const students = await db.schoolStudent.findMany({
    where: { schoolId },
    orderBy: { studentId: 'asc' },
    include: {
      parentConnections: {
        where: { status: 'confirmed' },
        select: {
          id: true,
          relationship: true,
          parent: { select: { id: true, name: true, username: true, avatarColor: true, phone: true } },
        },
      },
    },
  })

  return NextResponse.json({
    students: students.map((s) => ({
      id: s.id,
      studentId: s.studentId,
      fullName: s.fullName,
      grade: s.grade,
      className: s.className,
      enrollmentYear: s.enrollmentYear,
      status: s.status,
      userId: s.userId,
      joinCode: s.joinCode,
      joinCodeGeneratedAt: s.joinCodeGeneratedAt,
      joinCodeRevoked: s.joinCodeRevoked,
      joinCodeExpiresAt: s.joinCodeExpiresAt,
      parents: s.parentConnections.map((pc) => ({
        id: pc.id,
        relationship: pc.relationship,
        parentId: pc.parent.id,
        name: pc.parent.name,
        username: pc.parent.username,
        avatarColor: pc.parent.avatarColor,
        phone: pc.parent.phone,
      })),
    })),
  })
}

// POST /api/schools/[id]/students
// Admin-only: register a new student at the school. Generates a permanent
// Student ID + a temporary Join Code that the student (or their parent) can
// use to connect their Wasl account.
//
// Body: { fullName, grade?, className?, enrollmentYear?, studentId?, autoGenerateJoinCode? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: schoolId } = await params

  const membership = await db.schoolMembership.findUnique({
    where: { schoolId_userId: { schoolId, userId: session.id } },
  })
  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — school admin only' }, { status: 403 })
  }

  const school = await db.school.findUnique({ where: { id: schoolId } })
  if (!school) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const fullName = (body?.fullName || '').toString().trim()
  if (fullName.length < 3) {
    return NextResponse.json({ error: 'Student full name must be at least 3 characters' }, { status: 400 })
  }
  const grade = (body?.grade || '').toString().trim() || null
  const className = (body?.className || '').toString().trim() || null
  const enrollmentYear = Number(body?.enrollmentYear) || new Date().getFullYear()
  // Optional: admin can supply a specific student ID (must be unique within the school)
  let studentId = (body?.studentId || '').toString().trim().toUpperCase() || generateStudentId(school.code, enrollmentYear)
  // Ensure uniqueness within the school
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.schoolStudent.findUnique({
      where: { schoolId_studentId: { schoolId, studentId } },
    })
    if (!existing) break
    studentId = generateStudentId(school.code, enrollmentYear)
  }

  // Generate a unique join code (4 attempts to avoid collisions)
  let joinCode = generateJoinCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.schoolStudent.findUnique({ where: { joinCode } })
    if (!existing) break
    joinCode = generateJoinCode()
  }

  const autoGenerateJoinCode = body?.autoGenerateJoinCode !== false
  const student = await db.schoolStudent.create({
    data: {
      schoolId,
      studentId,
      fullName,
      grade,
      className,
      enrollmentYear,
      joinCode: autoGenerateJoinCode ? joinCode : generateJoinCode(),
      joinCodeGeneratedAt: autoGenerateJoinCode ? new Date() : null,
      // Default join code expiry: 30 days from now
      joinCodeExpiresAt: autoGenerateJoinCode ? new Date(Date.now() + 30 * 24 * 60 * 60_000) : null,
      status: 'active',
    },
  })

  // Bump the school's studentCount
  await db.school.update({
    where: { id: schoolId },
    data: { studentCount: { increment: 1 } },
  })

  return NextResponse.json({
    student: {
      id: student.id,
      studentId: student.studentId,
      fullName: student.fullName,
      grade: student.grade,
      className: student.className,
      enrollmentYear: student.enrollmentYear,
      status: student.status,
      joinCode: student.joinCode,
      joinCodeGeneratedAt: student.joinCodeGeneratedAt,
      joinCodeExpiresAt: student.joinCodeExpiresAt,
    },
  })
}
