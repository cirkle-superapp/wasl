import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST — create a thread on a message
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { conversationId, parentMessageId } = await req.json()
  if (!conversationId || !parentMessageId) {
    return NextResponse.json({ error: 'conversationId and parentMessageId required' }, { status: 400 })
  }
  const thread = await db.thread.create({
    data: { conversationId, parentMessageId },
  })
  return NextResponse.json({ ok: true, threadId: thread.id })
}
