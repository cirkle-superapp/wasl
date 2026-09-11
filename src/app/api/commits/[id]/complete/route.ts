import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { serializeCommit } from '@/lib/commit'

export const runtime = 'nodejs'

// POST /api/commits/[id]/complete — mark an active commit as completed.
// Allowed by either party once the commit is active.
export async function POST(
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
    select: {
      conversationId: true,
      creatorId: true,
      counterpartyId: true,
      status: true,
      creatorSigned: true,
      counterpartySigned: true,
    },
  })
  if (!commit) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (commit.status !== 'active') {
    return NextResponse.json(
      { error: `Cannot complete a ${commit.status} commit` },
      { status: 400 }
    )
  }
  // Must be a party to the commit
  if (session.id !== commit.creatorId && session.id !== commit.counterpartyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.commit.update({
    where: { id },
    data: { status: 'completed', completedAt: new Date() },
  })
  const serialized = await serializeCommit(id)

  return NextResponse.json({ ok: true, commit: serialized })
}
