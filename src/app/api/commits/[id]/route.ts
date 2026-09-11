import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { serializeCommit } from '@/lib/commit'

export const runtime = 'nodejs'

// GET /api/commits/[id] — get a single commit
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const commit = await db.commit.findUnique({
    where: { id },
    select: { conversationId: true, creatorId: true, counterpartyId: true },
  })
  if (!commit) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  // Must be a member of the conversation OR a party
  const isMember = await db.participant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: commit.conversationId,
        userId: session.id,
      },
    },
  })
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const serialized = await serializeCommit(id)
  if (!serialized) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ commit: serialized })
}
