import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/conversations/[id]/media?type=image|pdf|document|audio|voice
// Returns all media messages in a conversation, grouped by type.
// If no type is specified, returns all media types.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Verify membership
  const participation = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!participation) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  // Fetch media messages (images, PDFs, documents, audio, voice)
  const mediaTypes = type
    ? [type]
    : ['image', 'pdf', 'document', 'audio', 'voice']

  const messages = await db.message.findMany({
    where: {
      conversationId: id,
      type: { in: mediaTypes },
    },
    orderBy: { createdAt: 'desc' },
    take: 100, // cap at 100 items for performance
    select: {
      id: true,
      content: true,
      type: true,
      senderId: true,
      createdAt: true,
    },
  })

  // Group by type for the gallery
  const grouped: Record<string, Array<{
    id: string
    content: string
    type: string
    senderId: string
    createdAt: string
  }>> = {}

  for (const m of messages) {
    const t = m.type
    if (!grouped[t]) grouped[t] = []
    grouped[t].push({
      id: m.id,
      content: m.content,
      type: m.type,
      senderId: m.senderId,
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
    })
  }

  const totalCount = messages.length

  return NextResponse.json({
    media: grouped,
    totalCount,
    counts: {
      image: grouped['image']?.length || 0,
      pdf: grouped['pdf']?.length || 0,
      document: grouped['document']?.length || 0,
      audio: grouped['audio']?.length || 0,
      voice: grouped['voice']?.length || 0,
    },
  })
}
