import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/my-school
// Returns the calling user's full school picture — every school they're
// affiliated with, plus their role + the students they're connected to.
//
// Response shape:
// {
//   schools: [
//     {
//       id, name, code, logoColor, type, status, verifiedAt,
//       role: 'admin'|'teacher'|'staff'|'student'|'parent',
//       membership: { role, joinedAt },
//       // For student role: their own student record (with join code visible)
//       studentRecord: { studentId, fullName, grade, className, joinCode, ... },
//       // For parent role: the students they're connected to (no join codes)
//       children: [{ studentId, fullName, grade, className, relationship, ... }],
//       // For admin role: includes total student count + staff count
//       stats: { studentCount, staffCount },
//     },
//     ...
//   ]
// }
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find all schools the user is a member of, owns, is the student of, or is
  // a parent of a student at. We use OR conditions across the three relations.
  const memberships = await db.schoolMembership.findMany({
    where: { userId: session.id, status: 'active' },
    select: { schoolId: true, role: true, joinedAt: true, studentId: true },
  })

  // Schools the user owns (in case the membership wasn't created — defensive)
  const owned = await db.school.findMany({
    where: { ownerId: session.id },
    select: { id: true },
  })

  // Schools where the user is a connected parent of a student
  const parentConnections = await db.schoolParentConnection.findMany({
    where: { parentId: session.id, status: 'confirmed' },
    include: {
      schoolStudent: {
        select: {
          id: true,
          schoolId: true,
          studentId: true,
          fullName: true,
          grade: true,
          className: true,
          userId: true,
        },
      },
    },
  })

  // Schools where the user is the student themselves
  const studentRecords = await db.schoolStudent.findMany({
    where: { userId: session.id },
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      fullName: true,
      grade: true,
      className: true,
      status: true,
      joinCode: true,
      joinCodeRevoked: true,
      joinCodeExpiresAt: true,
      joinCodeGeneratedAt: true,
    },
  })

  // Collect all school IDs we need to fetch
  const schoolIds = new Set<string>([
    ...memberships.map((m) => m.schoolId),
    ...owned.map((s) => s.id),
    ...parentConnections.map((pc) => pc.schoolStudent.schoolId),
    ...studentRecords.map((sr) => sr.schoolId),
  ])
  if (schoolIds.size === 0) {
    return NextResponse.json({ schools: [] })
  }

  const schools = await db.school.findMany({
    where: { id: { in: Array.from(schoolIds) } },
    orderBy: { name: 'asc' },
  })

  const result = schools.map((school) => {
    const membership = memberships.find((m) => m.schoolId === school.id)
    const studentRecord = studentRecords.find((sr) => sr.schoolId === school.id)
    const children = parentConnections
      .filter((pc) => pc.schoolStudent.schoolId === school.id)
      .map((pc) => ({
        connectionId: pc.id,
        relationship: pc.relationship,
        studentId: pc.schoolStudent.studentId,
        fullName: pc.schoolStudent.fullName,
        grade: pc.schoolStudent.grade,
        className: pc.schoolStudent.className,
        hasAccount: !!pc.schoolStudent.userId,
      }))

    // Determine the user's role at THIS school
    let role: 'admin' | 'teacher' | 'staff' | 'student' | 'parent' | 'none' = 'none'
    if (membership?.role === 'admin' || school.ownerId === session.id) role = 'admin'
    else if (studentRecord) role = 'student'
    else if (children.length > 0) role = 'parent'
    else if (membership) role = (membership.role as any) || 'member'

    return {
      id: school.id,
      name: school.name,
      code: school.code,
      logoColor: school.logoColor,
      logoPath: school.logoPath,
      description: school.description,
      city: school.city,
      country: school.country,
      type: school.type,
      status: school.status,
      verifiedAt: school.verifiedAt,
      role,
      membership: membership
        ? { role: membership.role, joinedAt: membership.joinedAt }
        : null,
      // For student role: include their own student record with their join code visible
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
            joinCodeGeneratedAt: studentRecord.joinCodeGeneratedAt,
          }
        : null,
      // For parent role: list of children at this school
      children,
      // For admin role: include the denormalized counts
      stats:
        role === 'admin'
          ? { studentCount: school.studentCount, staffCount: school.staffCount }
          : null,
    }
  })

  return NextResponse.json({ schools: result })
}
