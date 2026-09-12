import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET — list time capsules in a conversation
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  if (!conversationId) return NextResponse.json({ capsules: [] })
  const capsules = await db.timeCapsule.findMany({
    where: { conversationId },
    orderBy: { unlockAt: 'asc' },
  })
  return NextResponse.json({ capsules: capsules.map(c => ({
    ...c,
    locked: new Date(c.unlockAt).getTime() > Date.now(),
    content: new Date(c.unlockAt).getTime() > Date.now() ? '🔒 Locked until ' + new Date(c.unlockAt).toLocaleString() : c.content,
  })) })
}

// POST — create a time capsule
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { conversationId, content, unlockAt } = await req.json()
  if (!conversationId || !content || !unlockAt) {
    return NextResponse.json({ error: 'conversationId, content, unlockAt required' }, { status: 400 })
  }
  const when = new Date(unlockAt)
  if (when.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Unlock time must be in the future' }, { status: 400 })
  }
  const cap = await db.timeCapsule.create({
    data: { conversationId, senderId: session.id, content, unlockAt: when },
  })
  return NextResponse.json({ ok: true, id: cap.id, unlockAt: cap.unlockAt })
}
