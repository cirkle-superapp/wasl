import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/conversations/:id/messages?before=<iso>&limit=50
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const participation = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!participation) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const before = searchParams.get('before')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

  const messages = await db.message.findMany({
    where: {
      conversationId: id,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  // Mark as read: update my lastReadAt and any messages sent by others as read
  await db.participant.update({
    where: { id: participation.id },
    data: { lastReadAt: new Date() },
  })
  await db.message.updateMany({
    where: {
      conversationId: id,
      senderId: { not: session.id },
      status: { not: 'read' },
    },
    data: { status: 'read' },
  })

  return NextResponse.json({
    messages: messages
      .reverse()
      .map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        content: m.content,
        type: m.type,
        status: m.status,
        createdAt: m.createdAt,
        replyToId: m.replyToId,
      })),
  })
}

// POST /api/conversations/:id/messages - send a message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const participation = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!participation) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const { content, type = 'text', replyToId } = body || {}
  if (!content || !String(content).trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const message = await db.message.create({
    data: {
      conversationId: id,
      senderId: session.id,
      content: String(content),
      type: String(type),
      status: 'sent',
      replyToId: replyToId ? String(replyToId) : null,
    },
  })
  // Bump conversation updatedAt for sorting
  await db.conversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  })

  return NextResponse.json({
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    type: message.type,
    status: message.status,
    createdAt: message.createdAt,
    replyToId: message.replyToId,
  })
}

// PATCH /api/conversations/:id/messages - mark messages as delivered/read
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const participation = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!participation) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const { status, messageIds } = body || {}
  if (!['delivered', 'read'].includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }
  if (Array.isArray(messageIds) && messageIds.length > 0) {
    await db.message.updateMany({
      where: {
        id: { in: messageIds },
        senderId: { not: session.id },
      },
      data: { status },
    })
  }
  if (status === 'read') {
    await db.participant.update({
      where: { id: participation.id },
      data: { lastReadAt: new Date() },
    })
  }
  return NextResponse.json({ ok: true })
}
