import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// PATCH — open a time capsule (mark as opened)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const cap = await db.timeCapsule.findUnique({ where: { id } })
  if (!cap) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (new Date(cap.unlockAt).getTime() > Date.now()) {
    return NextResponse.json({ error: 'Still locked', unlockAt: cap.unlockAt }, { status: 403 })
  }
  await db.timeCapsule.update({ where: { id }, data: { opened: true } })
  return NextResponse.json({ ok: true, content: cap.content })
}
