import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

const VALID_REPEATS = ['none', 'daily', 'weekly', 'monthly'] as const
type Repeat = (typeof VALID_REPEATS)[number]

// GET — list my scheduled messages (including recurring)
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const msgs = await db.scheduledMessage.findMany({
    where: { senderId: session.id, sent: false },
    orderBy: { scheduledFor: 'asc' },
  })
  return NextResponse.json({ scheduled: msgs })
}

// POST — schedule a message (supports recurring)
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { conversationId, content, scheduledFor, repeat, repeatUntil } = await req.json()
  if (!conversationId || !content || !scheduledFor) {
    return NextResponse.json({ error: 'conversationId, content, scheduledFor required' }, { status: 400 })
  }
  const when = new Date(scheduledFor)
  if (when.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 })
  }
  // Validate repeat value
  const repeatVal: Repeat = VALID_REPEATS.includes(repeat) ? repeat : 'none'
  // Validate repeatUntil (if provided)
  let repeatUntilDate: Date | null = null
  if (repeatVal !== 'none' && repeatUntil) {
    repeatUntilDate = new Date(repeatUntil)
    if (repeatUntilDate.getTime() <= when.getTime()) {
      return NextResponse.json(
        { error: 'repeatUntil must be after the first scheduled time' },
        { status: 400 }
      )
    }
  }
  const msg = await db.scheduledMessage.create({
    data: {
      conversationId,
      senderId: session.id,
      content,
      scheduledFor: when,
      repeat: repeatVal,
      repeatUntil: repeatUntilDate,
    },
  })
  return NextResponse.json({ ok: true, id: msg.id, scheduledFor: msg.scheduledFor, repeat: msg.repeat })
}
