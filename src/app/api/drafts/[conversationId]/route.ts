import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/drafts/{conversationId}
// Returns the draft for the given conversation + current user, or
// { content: null } if no draft exists. Used by the message-input on
// conversation switch / mount to restore the saved draft text.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { conversationId } = await params

  const draft = await db.draft.findUnique({
    where: {
      userId_conversationId: { userId: session.id, conversationId },
    },
    select: { content: true, replyToId: true },
  })

  if (!draft) {
    return NextResponse.json({ content: null })
  }
  return NextResponse.json({
    content: draft.content,
    replyToId: draft.replyToId,
  })
}

// DELETE /api/drafts/{conversationId}
// Removes the draft for the given conversation + current user. Called by the
// message-input after a successful send (the message has the text now, so the
// draft is no longer needed). Idempotent — deleting a non-existent draft
// returns ok.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { conversationId } = await params

  try {
    await db.draft.delete({
      where: {
        userId_conversationId: { userId: session.id, conversationId },
      },
    })
  } catch {
    // P2025 = record not found — already gone, treat as success.
  }
  return NextResponse.json({ ok: true })
}
