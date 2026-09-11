import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import {
  commitTypeMeta,
  fairnessCheck,
  genHash,
  serializeCommit,
} from '@/lib/commit'

export const runtime = 'nodejs'

// GET /api/commits?conversationId=...
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  if (!conversationId) {
    return NextResponse.json(
      { error: 'conversationId is required' },
      { status: 400 }
    )
  }
  // Make sure the user is a member of this conversation
  const participation = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId, userId: session.id },
    },
  })
  if (!participation) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const commits = await db.commit.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          avatar: true,
          avatarColor: true,
          phone: true,
        },
      },
      counterparty: {
        select: {
          id: true,
          name: true,
          avatar: true,
          avatarColor: true,
          phone: true,
        },
      },
    },
  })
  const serialized = await Promise.all(
    commits.map((c) => serializeCommit(c.id))
  )
  return NextResponse.json({ commits: serialized.filter(Boolean) })
}

// POST /api/commits — create a commit, post a "commit" message in the chat.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const {
      conversationId,
      counterpartyId,
      type = 'price',
      title,
      description = '',
      amount = 0,
      currency = 'SAR',
      deadline,
      conditions = [],
    } = body || {}

    if (!conversationId || !counterpartyId) {
      return NextResponse.json(
        { error: 'conversationId and counterpartyId are required' },
        { status: 400 }
      )
    }
    const safeTitle = typeof title === 'string' ? title.trim() : ''
    if (!safeTitle) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      )
    }
    if (counterpartyId === session.id) {
      return NextResponse.json(
        { error: 'You cannot make a commit with yourself' },
        { status: 400 }
      )
    }

    // Verify both are participants of the conversation
    const myPart = await db.participant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: session.id },
      },
    })
    const cpPart = await db.participant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: counterpartyId },
      },
    })
    if (!myPart || !cpPart) {
      return NextResponse.json(
        { error: 'Both parties must be members of the conversation' },
        { status: 403 }
      )
    }

    const safeType = (typeof type === 'string' ? type : 'price') as string
    const safeAmount =
      typeof amount === 'number' && amount >= 0 ? amount : 0
    const safeCurrency = typeof currency === 'string' ? currency : 'SAR'
    const safeDeadline = typeof deadline === 'string' ? deadline : null
    const safeConditions = Array.isArray(conditions)
      ? conditions.filter((c: unknown): c is string => typeof c === 'string').slice(0, 12)
      : []

    const fairness = fairnessCheck(safeAmount, safeCurrency, safeType)

    // Create the commit
    const commit = await db.commit.create({
      data: {
        conversationId,
        creatorId: session.id,
        counterpartyId,
        type: safeType,
        title: safeTitle,
        description: typeof description === 'string' ? description : '',
        amount: safeAmount,
        currency: safeCurrency,
        deadline: safeDeadline,
        conditions: JSON.stringify(safeConditions),
        status: 'pending',
        fairnessScore: fairness.score,
        fairnessNote: fairness.note,
        hash: genHash(),
        creatorSigned: true,
        creatorSignedAt: new Date(),
      },
    })

    // Post a "commit" message in the conversation (a card the UI renders specially)
    const meta = commitTypeMeta(safeType)
    const msgContent = `${meta.emoji} ${safeTitle}${safeAmount ? ` · ${safeAmount} ${safeCurrency}` : ''}`
    const message = await db.message.create({
      data: {
        conversationId,
        senderId: session.id,
        content: msgContent,
        type: 'commit',
        status: 'sent',
        commitId: commit.id,
      },
    })
    await db.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    const serialized = await serializeCommit(commit.id)
    return NextResponse.json(
      {
        ok: true,
        commit: serialized,
        message: {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          content: message.content,
          type: message.type,
          status: message.status,
          createdAt: message.createdAt,
          commitId: message.commitId,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[commits/POST] error', err)
    return NextResponse.json(
      { error: 'Failed to create commit', details: String(err) },
      { status: 500 }
    )
  }
}
