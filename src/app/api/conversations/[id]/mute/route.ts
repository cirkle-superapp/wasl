import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/conversations/[id]/mute
// Toggles the mute state for the current user in this conversation.
// Body: { muted: boolean } — true to mute, false to unmute.
// Returns the new mute state.
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
  const muted = !!body?.muted

  // Verify membership
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Update the mute state
  await db.participant.update({
    where: { id: membership.id },
    data: { muted },
  })

  return NextResponse.json({ muted })
}

// GET /api/conversations/[id]/mute
// Returns the current mute state for the current user in this conversation.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
    select: { muted: true },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ muted: membership.muted })
}
