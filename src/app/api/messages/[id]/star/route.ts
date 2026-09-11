import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/messages/[id]/star — star (pin) a message for the current user
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const message = await db.message.findUnique({
    where: { id },
    select: { conversationId: true },
  })
  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const isMember = await db.participant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: message.conversationId,
        userId: session.id,
      },
    },
  })
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Toggle
  const existing = await db.starredMessage.findUnique({
    where: { messageId_userId: { messageId: id, userId: session.id } },
  })
  if (existing) {
    await db.starredMessage.delete({ where: { id: existing.id } })
    return NextResponse.json({ ok: true, starred: false })
  }
  await db.starredMessage.create({
    data: { messageId: id, userId: session.id },
  })
  return NextResponse.json({ ok: true, starred: true })
}
