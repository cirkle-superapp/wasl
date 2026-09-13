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
  
  const setting = await db.disappearingSetting.findUnique({ where: { conversationId } })
  return NextResponse.json({ setting: setting || { enabled: false, duration: 86400 } })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { conversationId, enabled, duration } = await req.json()
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  
  const setting = await db.disappearingSetting.upsert({
    where: { conversationId },
    create: { conversationId, enabled: !!enabled, duration: duration || 86400 },
    update: { enabled: !!enabled, duration: duration || 86400 },
  })
  return NextResponse.json({ ok: true, setting })
}
