import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// DELETE — cancel a scheduled message
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const msg = await db.scheduledMessage.findUnique({ where: { id } })
  if (!msg || msg.senderId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  await db.scheduledMessage.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
