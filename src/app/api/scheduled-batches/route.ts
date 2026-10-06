import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// GET /api/scheduled-batches — list the user's scheduled batches
// Supports ?status=pending|completed|failed for filtering.
// ═══════════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status')

  const batches = await db.scheduledBatch.findMany({
    where: {
      userId: session.id,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: { scheduledFor: 'desc' },
    take: 100,
    include: {
      _count: { select: { messages: true, recipients: true } },
    },
  })

  return NextResponse.json({
    batches: batches.map((b) => ({
      id: b.id,
      name: b.name,
      scheduledFor: b.scheduledFor,
      repeat: b.repeat,
      repeatUntil: b.repeatUntil,
      status: b.status,
      progress: b.progress,
      processedAt: b.processedAt,
      totalSent: b.totalSent,
      totalFailed: b.totalFailed,
      messageCount: b._count.messages,
      recipientCount: b._count.recipients,
      createdAt: b.createdAt,
    })),
  })
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/scheduled-batches — create a new multi-message multi-recipient batch
//
// Body:
//   {
//     name?: string,
//     scheduledFor: ISO string,
//     repeat?: 'none' | 'daily' | 'weekly' | 'monthly',
//     repeatUntil?: ISO string,
//     messages: [
//       { content: string, type?: 'text'|'image', delaySeconds?: number, attachmentUrl?: string }
//     ],
//     recipients: [
//       { recipientType: 'conversation', conversationId: string }
//       OR { recipientType: 'business'|'school'|'work'|'personal' }
//       OR { recipientType: 'folder', folderId: string }
//     ]
//   }
// Returns: { id, scheduledFor, messageCount, recipientCount }
// ═══════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { name, scheduledFor, repeat, repeatUntil, messages, recipients } = body || {}

  // ---- Validate ----
  if (!scheduledFor || isNaN(new Date(scheduledFor).getTime())) {
    return NextResponse.json({ error: 'scheduledFor is required (ISO date)' }, { status: 400 })
  }
  const scheduledDate = new Date(scheduledFor)
  if (scheduledDate.getTime() < Date.now()) {
    return NextResponse.json({ error: 'scheduledFor must be in the future' }, { status: 400 })
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'At least 1 message is required' }, { status: 400 })
  }
  if (messages.length > 50) {
    return NextResponse.json({ error: 'Max 50 messages per batch' }, { status: 400 })
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: 'At least 1 recipient is required' }, { status: 400 })
  }
  if (recipients.length > 200) {
    return NextResponse.json({ error: 'Max 200 recipients per batch' }, { status: 400 })
  }

  const validRepeats = ['none', 'daily', 'weekly', 'monthly']
  const repeatValue = validRepeats.includes(repeat) ? repeat : 'none'

  // Validate messages
  for (const m of messages) {
    if (typeof m?.content !== 'string' || !m.content.trim()) {
      return NextResponse.json({ error: 'Each message needs content' }, { status: 400 })
    }
    if (m.content.length > 5000) {
      return NextResponse.json({ error: 'Message content max 5000 chars' }, { status: 400 })
    }
  }

  // Validate recipients — conversation recipients must belong to the user
  const validRecipientTypes = ['conversation', 'business', 'school', 'work', 'personal', 'folder']
  const conversationRecipients = recipients.filter((r: any) => r?.recipientType === 'conversation')
  if (conversationRecipients.length > 0) {
    const convIds = conversationRecipients.map((r: any) => r.conversationId).filter(Boolean)
    if (convIds.length > 0) {
      const userParticipations = await db.participant.findMany({
        where: { userId: session.id, conversationId: { in: convIds } },
        select: { conversationId: true },
      })
      const validConvIds = new Set(userParticipations.map((p) => p.conversationId))
      for (const r of conversationRecipients) {
        if (!r.conversationId || !validConvIds.has(r.conversationId)) {
          return NextResponse.json({ error: `Conversation ${r.conversationId} not found or not authorized` }, { status: 403 })
        }
      }
    }
  }

  // Validate folder recipients — folders must belong to the user
  const folderRecipients = recipients.filter((r: any) => r?.recipientType === 'folder')
  if (folderRecipients.length > 0) {
    const folderIds = folderRecipients.map((r: any) => r.folderId).filter(Boolean)
    if (folderIds.length > 0) {
      const userFolders = await db.chatFolder.findMany({
        where: { userId: session.id, id: { in: folderIds } },
        select: { id: true },
      })
      const validFolderIds = new Set(userFolders.map((f) => f.id))
      for (const r of folderRecipients) {
        if (!r.folderId || !validFolderIds.has(r.folderId)) {
          return NextResponse.json({ error: `Folder ${r.folderId} not found or not authorized` }, { status: 403 })
        }
      }
    }
  }

  // Validate recipient types
  for (const r of recipients) {
    if (!validRecipientTypes.includes(r?.recipientType)) {
      return NextResponse.json({ error: `Invalid recipientType: ${r?.recipientType}` }, { status: 400 })
    }
  }

  let repeatUntilDate: Date | null = null
  if (repeatValue !== 'none' && repeatUntil) {
    repeatUntilDate = new Date(repeatUntil)
    if (isNaN(repeatUntilDate.getTime())) {
      return NextResponse.json({ error: 'Invalid repeatUntil' }, { status: 400 })
    }
  }

  // ---- Create the batch in a transaction ----
  const batch = await db.scheduledBatch.create({
    data: {
      userId: session.id,
      name: typeof name === 'string' ? name.slice(0, 200) : null,
      scheduledFor: scheduledDate,
      repeat: repeatValue,
      repeatUntil: repeatUntilDate,
      status: 'pending',
      messages: {
        create: messages.map((m: any, i: number) => ({
          order: i,
          delaySeconds: Math.max(0, Math.min(86400, Number(m.delaySeconds) || 0)),
          content: String(m.content).slice(0, 5000),
          type: m.type === 'image' ? 'image' : 'text',
          attachmentUrl: typeof m.attachmentUrl === 'string' ? m.attachmentUrl.slice(0, 500) : null,
        })),
      },
      recipients: {
        create: recipients.map((r: any) => ({
          recipientType: r.recipientType,
          conversationId: r.conversationId || null,
          scope: r.recipientType === 'conversation' ? null : (r.recipientType === 'folder' ? null : r.recipientType),
          folderId: r.folderId || null,
        })),
      },
    },
    include: {
      _count: { select: { messages: true, recipients: true } },
    },
  })

  return NextResponse.json({
    id: batch.id,
    name: batch.name,
    scheduledFor: batch.scheduledFor,
    repeat: batch.repeat,
    messageCount: batch._count.messages,
    recipientCount: batch._count.recipients,
    status: batch.status,
  })
}
