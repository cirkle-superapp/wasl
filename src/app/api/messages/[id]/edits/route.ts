import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/messages/[id]/edits
// Returns the edit history for a message — all previous versions ordered
// from most-recent edit to oldest. Any participant in the conversation can
// view the edit history.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const message = await db.message.findUnique({
    where: { id },
    select: { id: true, content: true, conversationId: true, createdAt: true, senderId: true, edited: true },
  })
  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Verify membership so non-participants can't view edit history
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

  const edits = await db.messageEdit.findMany({
    where: { messageId: id },
    orderBy: { editedAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({
    edited: message.edited,
    currentContent: message.content,
    // The edits are previous versions. The "current" version is the message
    // itself (not in this list). We return them newest-edit-first.
    edits: edits.map((e) => ({
      id: e.id,
      content: e.content,
      editedAt: e.editedAt,
    })),
  })
}
