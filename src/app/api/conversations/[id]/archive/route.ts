import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/conversations/[id]/archive
// Toggles the archived state for the current user in this conversation.
// Body: { archived: boolean }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const archived = !!body?.archived

  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.participant.update({
    where: { id: membership.id },
    data: { archived },
  })

  return NextResponse.json({ archived })
}
