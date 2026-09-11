import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/messages/[id]/reactions — toggle a reaction (add or remove)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json()
  const emoji = typeof body?.emoji === 'string' ? body.emoji.trim() : ''
  if (!emoji || emoji.length > 10) {
    return NextResponse.json({ error: 'Invalid emoji' }, { status: 400 })
  }
  const message = await db.message.findUnique({
    where: { id },
    select: { conversationId: true },
  })
  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  // Must be a member of the conversation
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
  // Toggle: if the user already reacted with the same emoji, remove it;
  // if they reacted with a different emoji, replace it; otherwise create.
  const existing = await db.reaction.findUnique({
    where: { messageId_userId: { messageId: id, userId: session.id } },
  })
  if (existing) {
    if (existing.emoji === emoji) {
      await db.reaction.delete({ where: { id: existing.id } })
      return NextResponse.json({ ok: true, action: 'removed' })
    }
    await db.reaction.update({
      where: { id: existing.id },
      data: { emoji },
    })
    return NextResponse.json({ ok: true, action: 'updated', emoji })
  }
  await db.reaction.create({
    data: { messageId: id, userId: session.id, emoji },
  })
  return NextResponse.json({ ok: true, action: 'added', emoji })
}
