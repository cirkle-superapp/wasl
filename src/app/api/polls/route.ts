import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/polls — create a poll and post it as a 'poll'-type message
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const {
      conversationId,
      question,
      options = [],
      multiChoice = false,
      anonymous = false,
    } = body || {}
    if (!conversationId || !question || !Array.isArray(options) || options.length < 2) {
      return NextResponse.json(
        { error: 'conversationId, question, and at least 2 options are required' },
        { status: 400 }
      )
    }
    const safeQuestion = String(question).trim()
    if (safeQuestion.length < 3) {
      return NextResponse.json(
        { error: 'Question must be at least 3 characters' },
        { status: 400 }
      )
    }
    const safeOptions = options
      .filter((o: any) => typeof o === 'string' && o.trim())
      .slice(0, 10)
      .map((text: string, i: number) => ({
        id: `opt_${i}_${Math.random().toString(36).slice(2, 6)}`,
        text: String(text).trim().slice(0, 120),
      }))
    if (safeOptions.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 valid options are required' },
        { status: 400 }
      )
    }

    // Verify membership
    const membership = await db.participant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: session.id },
      },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const poll = await db.poll.create({
      data: {
        conversationId,
        question: safeQuestion,
        options: JSON.stringify(safeOptions),
        multiChoice: !!multiChoice,
        anonymous: !!anonymous,
        createdBy: session.id,
      },
    })

    // Post a poll-type message
    const message = await db.message.create({
      data: {
        conversationId,
        senderId: session.id,
        content: `📊 ${safeQuestion}`,
        type: 'poll',
        status: 'sent',
      },
    })
    // Link the poll to the message via a convention: store pollId on message
    await db.message.update({
      where: { id: message.id },
      data: { commitId: poll.id }, // reuse commitId column to link poll
    })
    await db.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    return NextResponse.json(
      {
        ok: true,
        poll: {
          id: poll.id,
          conversationId: poll.conversationId,
          question: poll.question,
          options: safeOptions,
          multiChoice: poll.multiChoice,
          anonymous: poll.anonymous,
          createdBy: poll.createdBy,
          createdAt: poll.createdAt,
        },
        message: {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          content: message.content,
          type: message.type,
          status: message.status,
          createdAt: message.createdAt,
          commitId: poll.id,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[polls/POST] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// GET /api/polls?conversationId=... — list polls in a conversation
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  }
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId, userId: session.id },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const polls = await db.poll.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    include: { votes: true },
  })
  const serialized = polls.map((p) => {
    let opts: { id: string; text: string }[] = []
    try {
      opts = JSON.parse(p.options)
    } catch {
      opts = []
    }
    const voteCounts: Record<string, number> = {}
    for (const v of p.votes) {
      voteCounts[v.optionId] = (voteCounts[v.optionId] || 0) + 1
    }
    const myVotes = p.votes
      .filter((v) => v.userId === session.id)
      .map((v) => v.optionId)
    return {
      id: p.id,
      conversationId: p.conversationId,
      question: p.question,
      options: opts.map((o) => ({
        ...o,
        votes: voteCounts[o.id] || 0,
      })),
      totalVotes: p.votes.length,
      multiChoice: p.multiChoice,
      anonymous: p.anonymous,
      createdBy: p.createdBy,
      myVotes,
      createdAt: p.createdAt,
    }
  })
  return NextResponse.json({ polls: serialized })
}
