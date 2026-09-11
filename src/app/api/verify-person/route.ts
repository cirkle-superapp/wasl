import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/verify-person — submit personal ID for verification.
// In a real system this would queue a manual review; here we auto-approve
// so the flow is testable. The uploaded ID path is stored on the user.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const { idDocPath } = body || {}
  if (!idDocPath || typeof idDocPath !== 'string') {
    return NextResponse.json({ error: 'idDocPath required' }, { status: 400 })
  }
  if (!idDocPath.startsWith('/uploads/')) {
    return NextResponse.json({ error: 'Invalid document path' }, { status: 400 })
  }
  await db.user.update({
    where: { id: session.id },
    data: {
      idDocPath,
      verified: true,
      verifiedAt: new Date(),
    },
  })
  return NextResponse.json({
    ok: true,
    verified: true,
    message: 'Your identity has been verified. You can now register a business.',
  })
}

// GET /api/verify-person — check my verification status
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = await db.user.findUnique({
    where: { id: session.id },
    select: { verified: true, idDocPath: true, verifiedAt: true },
  })
  return NextResponse.json({ user })
}
