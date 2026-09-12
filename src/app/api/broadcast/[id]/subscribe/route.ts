import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST — subscribe/unsubscribe
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { action } = await req.json()
  
  if (action === 'unsubscribe') {
    await db.broadcastSubscriber.deleteMany({ where: { channelId: id, userId: session.id } })
    await db.broadcastChannel.update({ where: { id }, data: { subscriberCount: { decrement: 1 } } })
    return NextResponse.json({ ok: true, subscribed: false })
  }
  
  try {
    await db.broadcastSubscriber.create({ data: { channelId: id, userId: session.id } })
    await db.broadcastChannel.update({ where: { id }, data: { subscriberCount: { increment: 1 } } })
    return NextResponse.json({ ok: true, subscribed: true })
  } catch {
    return NextResponse.json({ ok: true, subscribed: true, existed: true })
  }
}
