import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// DELETE /api/messages/[id]/for-me
// Hides a message from the current user's view only ("delete for me").
// Other participants continue to see the message. Idempotent: if a
// DeletedForMe record already exists for this (messageId, userId) pair,
// the unique constraint (P2002) is swallowed and we still return ok.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  // Verify the message exists.
  const message = await db.message.findUnique({
    where: { id },
    select: { conversationId: true },
  })
  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Verify the caller is a participant of the conversation (so a random
  // user can't create DeletedForMe rows for messages they can't see).
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: message.conversationId,
        userId: session.id,
      },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await db.deletedForMe.upsert({
      where: { messageId_userId: { messageId: id, userId: session.id } },
      update: {}, // no-op if already exists — keeps original deletedAt
      create: { messageId: id, userId: session.id },
    })
  } catch (e) {
    // Gracefully handle the unique constraint violation (P2002) — the row
    // already exists, so the message is already "deleted for me" for this
    // user. Treat it as success.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ ok: true, alreadyHidden: true })
    }
    throw e
  }

  return NextResponse.json({ ok: true })
}
