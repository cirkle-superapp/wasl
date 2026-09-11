import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/polls/[id]/vote — toggle a vote on a poll option
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json()
  const optionId = typeof body?.optionId === 'string' ? body.optionId : ''
  if (!optionId) {
    return NextResponse.json({ error: 'optionId required' }, { status: 400 })
  }
  const poll = await db.poll.findUnique({
    where: { id },
    select: { conversationId: true, multiChoice: true, options: true },
  })
  if (!poll) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: poll.conversationId,
        userId: session.id,
      },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Validate option exists
  let opts: { id: string; text: string }[] = []
  try {
    opts = JSON.parse(poll.options)
  } catch {
    opts = []
  }
  if (!opts.some((o) => o.id === optionId)) {
    return NextResponse.json({ error: 'Invalid option' }, { status: 400 })
  }

  // Toggle: if the user already voted this option, remove it.
  const existing = await db.pollVote.findUnique({
    where: {
      pollId_userId_optionId: { pollId: id, userId: session.id, optionId },
    },
  })
  if (existing) {
    await db.pollVote.delete({ where: { id: existing.id } })
    return NextResponse.json({ ok: true, action: 'removed', optionId })
  }
  // If not multi-choice, remove previous votes by this user.
  if (!poll.multiChoice) {
    await db.pollVote.deleteMany({
      where: { pollId: id, userId: session.id },
    })
  }
  await db.pollVote.create({
    data: { pollId: id, userId: session.id, optionId },
  })
  return NextResponse.json({ ok: true, action: 'added', optionId })
}
