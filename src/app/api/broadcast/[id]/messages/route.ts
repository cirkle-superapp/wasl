import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET — list messages in a broadcast channel
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const msgs = await db.broadcastMessage.findMany({
    where: { channelId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ messages: msgs.reverse() })
}

// POST — post a message to a broadcast channel (owner only)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const ch = await db.broadcastChannel.findUnique({ where: { id } })
  if (!ch) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ch.ownerId !== session.id) return NextResponse.json({ error: 'Only channel owner can post' }, { status: 403 })
  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })
  const msg = await db.broadcastMessage.create({
    data: { channelId: id, senderId: session.id, content },
  })
  return NextResponse.json({ ok: true, message: msg })
}
