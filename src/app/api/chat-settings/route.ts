import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  
  const conv = await db.conversation.findUnique({ where: { id: conversationId } })
  return NextResponse.json({ description: conv?.name || '' })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { conversationId, description } = await req.json()
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  
  const membership = await db.participant.findUnique({
    where: { conversationId_userId: { conversationId, userId: session.id } },
  })
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  
  if (description !== undefined) {
    await db.conversation.update({ where: { id: conversationId }, data: { name: description } })
  }
  return NextResponse.json({ ok: true })
}
