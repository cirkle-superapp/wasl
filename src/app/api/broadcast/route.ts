import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'

export const runtime = 'nodejs'

// GET — list broadcast channels
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const channels = await db.broadcastChannel.findMany({
    orderBy: { subscriberCount: 'desc' },
    take: 50,
  })
  const subscribed = await db.broadcastSubscriber.findMany({
    where: { userId: session.id },
    select: { channelId: true },
  })
  const subIds = new Set(subscribed.map(s => s.channelId))
  return NextResponse.json({
    channels: channels.map(c => ({ ...c, subscribed: subIds.has(c.id) })),
  })
}

// POST — create a broadcast channel
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, description } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const ch = await db.broadcastChannel.create({
    data: { name: name.trim(), description: description || '', ownerId: session.id, avatarColor: pickAvatarColor(name) },
  })
  await db.broadcastSubscriber.create({ data: { channelId: ch.id, userId: session.id } })
  await db.broadcastChannel.update({ where: { id: ch.id }, data: { subscriberCount: 1 } })
  return NextResponse.json({ ok: true, channel: ch })
}
