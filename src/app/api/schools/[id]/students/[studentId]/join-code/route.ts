import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { generateJoinCode } from '@/lib/school'

export const runtime = 'nodejs'

// POST /api/schools/[id]/students/[studentId]/join-code
// Regenerate the student's Join Code. The OLD code is immediately revoked
// (so anyone who screenshots it can no longer use it). Returns the new code.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; studentId: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: schoolId, studentId } = await params

  // Verify admin
  const membership = await db.schoolMembership.findUnique({
    where: { schoolId_userId: { schoolId, userId: session.id } },
  })
  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — school admin only' }, { status: 403 })
  }

  // Find the student record (the [studentId] URL param is the row id, not the
  // human-readable student ID — we accept either for convenience).
  let student = await db.schoolStudent.findUnique({
    where: { id: studentId },
  })
  if (!student) {
    student = await db.schoolStudent.findUnique({
      where: { schoolId_studentId: { schoolId, studentId } },
    })
  }
  if (!student || student.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  // Generate a new unique join code (retry on collision)
  let newCode = generateJoinCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.schoolStudent.findUnique({ where: { joinCode: newCode } })
    if (!existing || existing.id === student.id) break
    newCode = generateJoinCode()
  }

  // Update the student record with the new code, marked as freshly generated.
  // The old code remains in the `joinCode` field (overwritten) — for full
  // audit trail we'd keep a separate code history, but for v1 we just
  // overwrite. Revoking happens implicitly: the old code is no longer in
  // the DB, so /api/school-connect/join will return 404 for it.
  const updated = await db.schoolStudent.update({
    where: { id: student.id },
    data: {
      joinCode: newCode,
      joinCodeGeneratedAt: new Date(),
      joinCodeExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      joinCodeRevoked: false,
    },
  })

  return NextResponse.json({
    student: {
      id: updated.id,
      studentId: updated.studentId,
      fullName: updated.fullName,
      joinCode: updated.joinCode,
      joinCodeGeneratedAt: updated.joinCodeGeneratedAt,
      joinCodeExpiresAt: updated.joinCodeExpiresAt,
      joinCodeRevoked: updated.joinCodeRevoked,
    },
  })
}

// DELETE /api/schools/[id]/students/[studentId]/join-code
// Revoke the student's Join Code without issuing a new one. The student
// won't be able to connect (or have a parent connect) until the admin
// regenerates a code.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; studentId: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: schoolId, studentId } = await params

  const membership = await db.schoolMembership.findUnique({
    where: { schoolId_userId: { schoolId, userId: session.id } },
  })
  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — school admin only' }, { status: 403 })
  }

  let student = await db.schoolStudent.findUnique({
    where: { id: studentId },
  })
  if (!student) {
    student = await db.schoolStudent.findUnique({
      where: { schoolId_studentId: { schoolId, studentId } },
    })
  }
  if (!student || student.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  // Mark the code as revoked but keep the value in the DB (so historical
  // connection attempts that include it are still verifiable as "this was
  // a real code at some point"). Revocation stops future joins via this code.
  const updated = await db.schoolStudent.update({
    where: { id: student.id },
    data: {
      joinCodeRevoked: true,
    },
  })

  return NextResponse.json({
    student: {
      id: updated.id,
      studentId: updated.studentId,
      fullName: updated.fullName,
      joinCode: updated.joinCode,
      joinCodeRevoked: updated.joinCodeRevoked,
    },
  })
}
