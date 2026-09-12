import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// PATCH — read a whisper message (reveal content)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const whisper = await db.whisperMessage.findUnique({ where: { id } })
  if (!whisper) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (new Date(whisper.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Expired' }, { status: 410 })
  }
  await db.whisperMessage.update({ where: { id }, data: { read: true } })
  return NextResponse.json({ content: whisper.content })
}
