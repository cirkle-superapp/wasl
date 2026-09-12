import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { targetConversationId } = await req.json()
  if (!targetConversationId) return NextResponse.json({ error: 'targetConversationId required' }, { status: 400 })
  
  const original = await db.message.findUnique({ where: { id } })
  if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  
  const membership = await db.participant.findUnique({
    where: { conversationId_userId: { conversationId: targetConversationId, userId: session.id } },
  })
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  
  const forwarded = await db.message.create({
    data: {
      conversationId: targetConversationId,
      senderId: session.id,
      content: original.content,
      type: original.type,
      status: 'sent',
    },
  })
  return NextResponse.json({ ok: true, forwardedId: forwarded.id })
}
