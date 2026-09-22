import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { generateJoinCode } from '@/lib/school'

export const runtime = 'nodejs'

// POST /api/seed-schools
// Seeds the School Connect demo data — a verified Nile International School
// (NIS-2048) with 3 students + a parent connection to the demo user.
//
// This is a SEPARATE endpoint from /api/seed-demo because Vercel's 10s
// serverless timeout can't fit the entire seed-demo + school seeding in a
// single call on Turso (each Turso write is 50-200ms over the network).
// The auth-screen "Try the rich demo" button calls both endpoints in
// sequence after login.
//
// Idempotent: if the school already exists for this user, it's not
// re-created. The 3 students + parent connection are also idempotent.
export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // ── School: Nile International School (verified) ────────────────────
    // The demo user is the school admin (owns it). Three students are
    // pre-registered. The user's own Wasl account is also connected as a PARENT
    // to one of the students (so they can see both admin + parent views).
    const schoolName = 'Nile International School'
    let school = await db.school.findFirst({
      where: { name: schoolName, ownerId: session.id },
    })
    if (!school) {
      const code = 'NIS-2048'
      school = await db.school.create({
        data: {
          name: schoolName,
          code,
          description:
            'Verified international school in Nasr City, Cairo. IB curriculum, KG through Grade 12.',
          logoColor: '#1A4A5A',
          city: 'Cairo',
          country: 'Egypt',
          phone: '+20 2 1234 5678',
          email: 'admin@nile-international.edu',
          website: 'https://nile-international.edu',
          ownerId: session.id,
          type: 'international',
          status: 'verified',
          verifiedAt: new Date(),
          verifiedBy: session.id,
          studentCount: 3,
          staffCount: 2,
        },
      })
      // Make the demo user the school admin (membership).
      await db.schoolMembership.create({
        data: {
          schoolId: school.id,
          userId: session.id,
          role: 'admin',
          status: 'active',
        },
      })
    }

    let studentsCreated = 0
    let parentConnectionsCreated = 0

    // ── Student 1: Ahmed Mohamed — the demo user is the parent ──────
    {
      const fullName = 'Ahmed Mohamed'
      const studentIdVal = 'NIS-25-08421'
      let student = await db.schoolStudent.findUnique({
        where: { schoolId_studentId: { schoolId: school.id, studentId: studentIdVal } },
      })
      if (!student) {
        let jc = '7K4P-92XM'
        for (let i = 0; i < 5; i++) {
          const e = await db.schoolStudent.findUnique({ where: { joinCode: jc } })
          if (!e) break
          jc = generateJoinCode()
        }
        student = await db.schoolStudent.create({
          data: {
            schoolId: school.id,
            studentId: studentIdVal,
            fullName,
            grade: 'Grade 8',
            className: 'Class B',
            enrollmentYear: 2025,
            joinCode: jc,
            joinCodeGeneratedAt: new Date(),
            joinCodeExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
            status: 'active',
          },
        })
        studentsCreated++
      }
      // Connect the demo user as Ahmed's parent (relationship: parent)
      const existing = await db.schoolParentConnection.findUnique({
        where: { schoolStudentId_parentId: { schoolStudentId: student.id, parentId: session.id } },
      })
      if (!existing) {
        await db.schoolParentConnection.create({
          data: {
            schoolStudentId: student.id,
            parentId: session.id,
            relationship: 'parent',
            status: 'confirmed',
            confirmedAt: new Date(),
            joinedViaCode: student.joinCode,
          },
        })
        parentConnectionsCreated++
      }
      // Also make sure the demo user has a 'parent' membership at this school
      await db.schoolMembership.upsert({
        where: { schoolId_userId: { schoolId: school.id, userId: session.id } },
        update: {},
        create: {
          schoolId: school.id,
          userId: session.id,
          role: 'parent',
          status: 'active',
        },
      })
    }

    // ── Student 2: Omar Mohamed (no parent connected — demoable join flow) ──
    {
      const fullName = 'Omar Mohamed'
      const studentIdVal = 'NIS-25-08422'
      let student = await db.schoolStudent.findUnique({
        where: { schoolId_studentId: { schoolId: school.id, studentId: studentIdVal } },
      })
      if (!student) {
        let jc = 'B3F8-21K9'
        for (let i = 0; i < 5; i++) {
          const e = await db.schoolStudent.findUnique({ where: { joinCode: jc } })
          if (!e) break
          jc = generateJoinCode()
        }
        student = await db.schoolStudent.create({
          data: {
            schoolId: school.id,
            studentId: studentIdVal,
            fullName,
            grade: 'Grade 9',
            className: 'Class A',
            enrollmentYear: 2025,
            joinCode: jc,
            joinCodeGeneratedAt: new Date(),
            joinCodeExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
            status: 'active',
          },
        })
        studentsCreated++
      }
    }

    // ── Student 3: Sara Adel (also no parent — demoable join flow) ──
    {
      const fullName = 'Sara Adel'
      const studentIdVal = 'NIS-25-08423'
      let student = await db.schoolStudent.findUnique({
        where: { schoolId_studentId: { schoolId: school.id, studentId: studentIdVal } },
      })
      if (!student) {
        let jc = 'M9X2-4P7R'
        for (let i = 0; i < 5; i++) {
          const e = await db.schoolStudent.findUnique({ where: { joinCode: jc } })
          if (!e) break
          jc = generateJoinCode()
        }
        student = await db.schoolStudent.create({
          data: {
            schoolId: school.id,
            studentId: studentIdVal,
            fullName,
            grade: 'Grade 7',
            className: 'Class C',
            enrollmentYear: 2025,
            joinCode: jc,
            joinCodeGeneratedAt: new Date(),
            joinCodeExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
            status: 'active',
          },
        })
        studentsCreated++
      }
    }

    return NextResponse.json({
      ok: true,
      school: { id: school.id, name: school.name, code: school.code },
      studentsCreated,
      parentConnectionsCreated,
    })
  } catch (err) {
    console.error('[seed-schools] error', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
