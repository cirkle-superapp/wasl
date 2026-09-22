import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/schools/[id]
// Get detailed info about a school, including the calling user's role
// within the school (admin/teacher/staff/student/parent/none).
//
// For parents: also returns the students they're connected to (with
// relationship + confirmation status).
// For the school admin: returns the full student roster (with join codes
// hidden unless they're the admin or the student themselves).
//
// Query params:
//   ?includeStudents=true  — include the school's student roster (admin-only)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: schoolId } = await params
  const { searchParams } = new URL(req.url)
  const includeStudents = searchParams.get('includeStudents') === 'true'

  const school = await db.school.findUnique({
    where: { id: schoolId },
    include: {
      members: { where: { status: 'active' } },
    },
  })
  if (!school) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 })
  }

  // Determine the calling user's role in this school.
  const membership = school.members.find((m) => m.userId === session.id)
  const isAdmin = membership?.role === 'admin'
  const isMember = !!membership
  // Is the calling user a parent of any student at this school?
  const parentConnections = await db.schoolParentConnection.findMany({
    where: { parentId: session.id, schoolStudent: { schoolId: school.id }, status: 'confirmed' },
    include: {
      schoolStudent: {
        select: {
          id: true,
          studentId: true,
          fullName: true,
          grade: true,
          className: true,
          userId: true,
          status: true,
        },
      },
    },
  })
  // Is the calling user a student at this school?
  const studentRecord = await db.schoolStudent.findFirst({
    where: { schoolId: school.id, userId: session.id },
    select: {
      id: true,
      studentId: true,
      fullName: true,
      grade: true,
      className: true,
      status: true,
      joinCode: true,
      joinCodeRevoked: true,
      joinCodeExpiresAt: true,
    },
  })

  const role = isAdmin
    ? 'admin'
    : studentRecord
      ? 'student'
      : parentConnections.length > 0
        ? 'parent'
        : isMember
          ? (membership?.role || 'member')
          : 'none'

  const result: any = {
    school: {
      id: school.id,
      name: school.name,
      code: school.code,
      logoColor: school.logoColor,
      logoPath: school.logoPath,
      description: school.description,
      city: school.city,
      country: school.country,
      phone: school.phone,
      email: school.email,
      website: school.website,
      type: school.type,
      status: school.status,
      verifiedAt: school.verifiedAt,
      studentCount: school.studentCount,
      staffCount: school.staffCount,
    },
    role,
    membership: membership
      ? { role: membership.role, joinedAt: membership.joinedAt }
      : null,
    // For students: their own student record (with their join code visible)
    studentRecord: studentRecord
      ? {
          id: studentRecord.id,
          studentId: studentRecord.studentId,
          fullName: studentRecord.fullName,
          grade: studentRecord.grade,
          className: studentRecord.className,
          status: studentRecord.status,
          joinCode: studentRecord.joinCode,
          joinCodeRevoked: studentRecord.joinCodeRevoked,
          joinCodeExpiresAt: studentRecord.joinCodeExpiresAt,
        }
      : null,
    // For parents: the students they're connected to (without join codes —
    // those are only visible to the student and the school admin)
    parentConnections: parentConnections.map((pc) => ({
      id: pc.id,
      relationship: pc.relationship,
      status: pc.status,
      student: pc.schoolStudent,
    })),
  }

  // For admins: include the full student roster (with join codes so they
  // can audit / regenerate them).
  if (includeStudents && isAdmin) {
    const students = await db.schoolStudent.findMany({
      where: { schoolId: school.id },
      orderBy: { studentId: 'asc' },
      select: {
        id: true,
        studentId: true,
        fullName: true,
        grade: true,
        className: true,
        enrollmentYear: true,
        status: true,
        userId: true,
        joinCode: true,
        joinCodeGeneratedAt: true,
        joinCodeRevoked: true,
        joinCodeExpiresAt: true,
        parentConnections: {
          where: { status: 'confirmed' },
          select: {
            id: true,
            relationship: true,
            parent: {
              select: { id: true, name: true, username: true, avatarColor: true, phone: true },
            },
          },
        },
      },
    })
    result.students = students
  }

  return NextResponse.json(result)
}
