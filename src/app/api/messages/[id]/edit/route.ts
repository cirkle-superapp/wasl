import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })

  const msg = await db.message.findUnique({ where: { id } })
  if (!msg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (msg.senderId !== session.id) return NextResponse.json({ error: 'Can only edit your own messages' }, { status: 403 })

  const ageMin = (Date.now() - new Date(msg.createdAt).getTime()) / 60000
  if (ageMin > 15) return NextResponse.json({ error: 'Can only edit within 15 minutes' }, { status: 403 })

  // Skip if the content hasn't actually changed
  if (msg.content === content.trim()) {
    return NextResponse.json({ ok: true, unchanged: true })
  }

  // Save the PREVIOUS version to the edit history before updating.
  // This enables the "edited" indicator and "view edit history" feature.
  await db.messageEdit.create({
    data: {
      messageId: id,
      content: msg.content,
    },
  })

  await db.message.update({
    where: { id },
    data: { content: content.trim(), edited: true },
  })
  return NextResponse.json({ ok: true })
}
