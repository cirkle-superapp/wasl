import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

const WHISPER_TTL_HOURS = 24

// GET — list active whisper messages in a conversation
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  if (!conversationId) return NextResponse.json({ whispers: [] })
  const whispers = await db.whisperMessage.findMany({
    where: { conversationId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ whispers: whispers.map(w => ({
    ...w,
    content: w.senderId === session.id || w.read ? w.content : '🔒 Whisper — tap to reveal',
  })) })
}

// POST — send a whisper message
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { conversationId, content } = await req.json()
  if (!conversationId || !content?.trim()) return NextResponse.json({ error: 'conversationId and content required' }, { status: 400 })
  const now = new Date()
  const expiresAt = new Date(now.getTime() + WHISPER_TTL_HOURS * 60 * 60 * 1000)
  const whisper = await db.whisperMessage.create({
    data: { conversationId, senderId: session.id, content, expiresAt },
  })
  return NextResponse.json({ ok: true, whisper })
}
