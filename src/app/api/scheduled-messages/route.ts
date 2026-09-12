import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET — list my scheduled messages
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const msgs = await db.scheduledMessage.findMany({
    where: { senderId: session.id, sent: false },
    orderBy: { scheduledFor: 'asc' },
  })
  return NextResponse.json({ scheduled: msgs })
}

// POST — schedule a message
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { conversationId, content, scheduledFor } = await req.json()
  if (!conversationId || !content || !scheduledFor) {
    return NextResponse.json({ error: 'conversationId, content, scheduledFor required' }, { status: 400 })
  }
  const when = new Date(scheduledFor)
  if (when.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 })
  }
  const msg = await db.scheduledMessage.create({
    data: { conversationId, senderId: session.id, content, scheduledFor: when },
  })
  return NextResponse.json({ ok: true, id: msg.id, scheduledFor: msg.scheduledFor })
}
