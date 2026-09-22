import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { parseConnectNumber } from '@/lib/school'
import { rateLimit, getClientIP } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// POST /api/school-connect/join
// Connect the current user to a student at a school. Two flows:
//
//  1. Self-join (the user IS the student):
//     Body: { connectNumber, mode: 'self' }
//     Sets SchoolStudent.userId = session.id, creates a SchoolMembership
//     with role='student'. Requires the student record to have no userId yet.
//
//  2. Parent/guardian join (the user is a PARENT of the student):
//     Body: { connectNumber, mode: 'parent', relationship?: 'mother'|'father'|'guardian'|'grandparent'|'sibling'|'other' }
//     Creates a SchoolParentConnection (status='confirmed' immediately so
//     the parent doesn't need the student to approve — they already proved
//     they had the join code). Also creates a SchoolMembership with role='parent'.
//
// Both flows verify the join code is valid (not revoked, not expired) before
// establishing the connection.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const ip = getClientIP(req)
  const rl = rateLimit(`school-connect-join:${ip}`, 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many connection attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  const body = await req.json().catch(() => ({}))
  const input = (body?.connectNumber || '').toString().trim()
  const mode = (body?.mode || '').toString() // 'self' | 'parent'
  const relationship = (body?.relationship || 'parent').toString()

  if (!input) {
    return NextResponse.json({ error: 'Connect number is required' }, { status: 400 })
  }
  if (mode !== 'self' && mode !== 'parent') {
    return NextResponse.json({ error: 'Mode must be "self" or "parent"' }, { status: 400 })
  }

  const parsed = parseConnectNumber(input)
  if (!parsed.joinCode) {
    return NextResponse.json(
      { error: 'Connect number must include the Join Code (e.g. NIS-25-08421-7K4P-92XM or just 7K4P-92XM)' },
      { status: 400 }
    )
  }

  // Look up the student by join code.
  const student = await db.schoolStudent.findUnique({
    where: { joinCode: parsed.joinCode },
    include: { school: true },
  })
  if (!student) {
    return NextResponse.json({ error: 'Invalid join code. Check the number and try again.' }, { status: 404 })
  }

  // Verify the join code is still valid.
  if (student.joinCodeRevoked) {
    return NextResponse.json({ error: 'This Join Code has been revoked. Ask the student for a new one.' }, { status: 410 })
  }
  if (student.joinCodeExpiresAt && new Date(student.joinCodeExpiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This Join Code has expired. Ask the student for a new one.' }, { status: 410 })
  }
  if (student.status !== 'active') {
    return NextResponse.json({ error: 'This student record is no longer active.' }, { status: 410 })
  }

  // Self-join flow
  if (mode === 'self') {
    if (student.userId) {
      return NextResponse.json(
        { error: 'This student record is already connected to another account.' },
        { status: 409 }
      )
    }
    // Make sure the current user isn't already a student at ANOTHER school
    // (we allow the same user to be a student at multiple schools in v2,
    // but for v1 we keep it simple — one student record per user).
    // Link the user to the student record
    await db.schoolStudent.update({
      where: { id: student.id },
      data: { userId: session.id },
    })
    // Create a school membership with role='student'
    await db.schoolMembership.upsert({
      where: { schoolId_userId: { schoolId: student.schoolId, userId: session.id } },
      update: { role: 'student', status: 'active', studentId: student.id },
      create: { schoolId: student.schoolId, userId: session.id, role: 'student', status: 'active', studentId: student.id },
    })
    return NextResponse.json({
      ok: true,
      mode: 'self',
      school: { id: student.school.id, name: student.school.name, code: student.school.code, logoColor: student.school.logoColor },
      student: { id: student.id, studentId: student.studentId, fullName: student.fullName, grade: student.grade, className: student.className },
    })
  }

  // Parent/guardian flow
  // Check for an existing connection (avoid duplicates — return success if already connected)
  const existing = await db.schoolParentConnection.findUnique({
    where: { schoolStudentId_parentId: { schoolStudentId: student.id, parentId: session.id } },
  })
  if (existing && existing.status === 'confirmed') {
    return NextResponse.json({
      ok: true,
      mode: 'parent',
      alreadyConnected: true,
      school: { id: student.school.id, name: student.school.name, code: student.school.code, logoColor: student.school.logoColor },
      student: { id: student.id, studentId: student.studentId, fullName: student.fullName, grade: student.grade, className: student.className },
      relationship: existing.relationship,
    })
  }
  if (existing && existing.status === 'revoked') {
    // Re-establish a previously-revoked connection
    await db.schoolParentConnection.update({
      where: { id: existing.id },
      data: { status: 'confirmed', relationship, confirmedAt: new Date(), revokedAt: null, joinedViaCode: parsed.joinCode, updatedAt: new Date() },
    })
  } else {
    await db.schoolParentConnection.create({
      data: {
        schoolStudentId: student.id,
        parentId: session.id,
        relationship,
        status: 'confirmed',
        confirmedAt: new Date(),
        joinedViaCode: parsed.joinCode,
      },
    })
  }
  // Ensure the parent has a school membership with role='parent' so they
  // show up in the school's member list.
  await db.schoolMembership.upsert({
    where: { schoolId_userId: { schoolId: student.schoolId, userId: session.id } },
    update: { role: 'parent', status: 'active' },
    create: { schoolId: student.schoolId, userId: session.id, role: 'parent', status: 'active' },
  })

  return NextResponse.json({
    ok: true,
    mode: 'parent',
    school: { id: student.school.id, name: student.school.name, code: student.school.code, logoColor: student.school.logoColor },
    student: { id: student.id, studentId: student.studentId, fullName: student.fullName, grade: student.grade, className: student.className },
    relationship,
  })
}
