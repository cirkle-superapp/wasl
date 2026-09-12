import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET — list messages in a thread
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const msgs = await db.threadMessage.findMany({
    where: { threadId: id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ messages: msgs })
}

// POST — post a message to a thread
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })
  const msg = await db.threadMessage.create({
    data: { threadId: id, senderId: session.id, content },
  })
  return NextResponse.json({ ok: true, message: msg })
}
