import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/folders/[id]/conversations — add a conversation to a folder
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const folder = await db.chatFolder.findUnique({ where: { id } })
  if (!folder || folder.userId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const body = await req.json()
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : ''
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  }
  // Verify the conversation exists and the user is a member
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId, userId: session.id },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }
  try {
    await db.folderConversation.create({
      data: { folderId: id, conversationId },
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      // Already in folder — that's fine
      return NextResponse.json({ ok: true, existed: true })
    }
    throw err
  }
  return NextResponse.json({ ok: true })
}

// DELETE /api/folders/[id]/conversations?conversationId=... — remove from folder
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const folder = await db.chatFolder.findUnique({ where: { id } })
  if (!folder || folder.userId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  }
  await db.folderConversation.deleteMany({
    where: { folderId: id, conversationId },
  })
  return NextResponse.json({ ok: true })
}
