import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { serializeCommit } from '@/lib/commit'

export const runtime = 'nodejs'

// POST /api/commits/[id]/sign — the counterparty (or creator if not yet) signs.
// When both parties have signed, the commit transitions pending -> active.
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
  // Must be a member of the conversation
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

  const now = new Date()
  let data: any = {}

  if (session.id === commit.creatorId && !commit.creatorSigned) {
    data.creatorSigned = true
    data.creatorSignedAt = now
  } else if (
    session.id === commit.counterpartyId &&
    !commit.counterpartySigned
  ) {
    data.counterpartySigned = true
    data.counterpartySignedAt = now
  } else {
    return NextResponse.json(
      {
        error: 'You have already signed, or you are not a party to this commit',
      },
      { status: 400 }
    )
  }

  // If both have now signed, transition to active
  const willBeActive =
    (data.creatorSigned ?? commit.creatorSigned) &&
    (data.counterpartySigned ?? commit.counterpartySigned)
  if (willBeActive && commit.status === 'pending') {
    data.status = 'active'
  }

  await db.commit.update({ where: { id }, data })
  const serialized = await serializeCommit(id)

  return NextResponse.json({ ok: true, commit: serialized })
}
