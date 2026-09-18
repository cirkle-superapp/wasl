import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/conversations/[id]/export?format=text|json
// Exports the full chat history as a downloadable file.
// - format=text: human-readable transcript with timestamps and sender names
// - format=json: structured JSON array of messages
// The user must be a participant in the conversation.
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
  const format = searchParams.get('format') || 'text'

  // Fetch all messages (up to 10000 for safety)
  const messages = await db.message.findMany({
    where: {
      conversationId: id,
      // Exclude messages the user has "deleted for me"
      deletedForMe: { none: { userId: session.id } },
    },
    orderBy: { createdAt: 'asc' },
    take: 10000,
    select: {
      id: true,
      content: true,
      type: true,
      senderId: true,
      createdAt: true,
      senderLabel: true,
      replyToId: true,
      protected: true,
      edited: true,
    },
  })

  // Fetch conversation info
  const conv = await db.conversation.findUnique({
    where: { id },
    select: {
      name: true,
      isGroup: true,
      participants: {
        include: {
          user: {
            select: { id: true, name: true, username: true },
          },
        },
      },
    },
  })

  // Build a sender name lookup map
  const senderNames = new Map<string, string>()
  for (const p of conv?.participants || []) {
    senderNames.set(p.userId, p.user.name || p.user.username || 'Unknown')
  }

  // Resolve display name (senderLabel > personal name)
  function getSenderName(m: typeof messages[number]): string {
    if (m.senderLabel) return m.senderLabel
    return senderNames.get(m.senderId) || 'Unknown'
  }

  // Format timestamp
  function formatTime(date: Date): string {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Get conversation display name
  let convName = conv?.name || 'Conversation'
  if (!conv?.isGroup) {
    const other = conv?.participants.find((p) => p.userId !== session.id)
    convName = other?.user.name || convName
  }

  if (format === 'json') {
    const json = JSON.stringify(
      {
        conversation: convName,
        isGroup: conv?.isGroup || false,
        exportedAt: new Date().toISOString(),
        messageCount: messages.length,
        messages: messages.map((m) => ({
          id: m.id,
          sender: getSenderName(m),
          content: m.content,
          type: m.type,
          timestamp: m.createdAt,
          senderLabel: m.senderLabel,
          replyToId: m.replyToId,
          protected: m.protected,
          edited: m.edited,
        })),
      },
      null,
      2
    )
    return new NextResponse(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${convName.replace(/[^a-z0-9]/gi, '_')}_export.json"`,
      },
    })
  }

  // Text format — human-readable transcript
  let text = `═══════════════════════════════════════════════════════\n`
  text += `  Wasl Chat Export\n`
  text += `  Conversation: ${convName}\n`
  text += `  Type: ${conv?.isGroup ? 'Group' : '1-on-1'}\n`
  text += `  Messages: ${messages.length}\n`
  text += `  Exported: ${formatTime(new Date())}\n`
  text += `═══════════════════════════════════════════════════════\n\n`

  for (const m of messages) {
    const time = formatTime(m.createdAt)
    const sender = getSenderName(m)

    if (m.type === 'system') {
      text += `─── ${m.content} ─── (${time})\n`
      continue
    }

    let prefix = ''
    if (m.type === 'image') prefix = '[Photo] '
    else if (m.type === 'voice') prefix = '[Voice message] '
    else if (m.type === 'pdf') prefix = '[PDF] '
    else if (m.type === 'document') prefix = '[Document] '
    else if (m.type === 'audio') prefix = '[Audio] '
    else if (m.type === 'commit') prefix = '[Commit] '
    else if (m.type === 'poll') prefix = '[Poll] '

    const editedTag = m.edited ? ' (edited)' : ''
    const protectedTag = m.protected ? ' 🔒' : ''
    const businessTag = m.senderLabel ? ' 🏢' : ''

    text += `${sender}${businessTag}${protectedTag} — ${time}${editedTag}\n`
    text += `${prefix}${m.content}\n\n`
  }

  text += `═══════════════════════════════════════════════════════\n`
  text += `  End of export — ${messages.length} messages\n`
  text += `═══════════════════════════════════════════════════════\n`

  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${convName.replace(/[^a-z0-9]/gi, '_')}_export.txt"`,
    },
  })
}
