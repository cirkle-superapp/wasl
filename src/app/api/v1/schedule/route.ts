import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  verifyApiToken,
  hasScopes,
  getScopedConversationIds,
  auditLog,
  type Scope,
} from '@/lib/api-auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// POST /api/v1/schedule — schedule a multi-message multi-recipient batch
//   via API token
//
// Auth: Authorization: Bearer wasl_xxx
// Required scopes: "schedule" + at least one category scope
//
// Body (same shape as /api/scheduled-batches POST, but token's scopes
// constrain the recipient list):
//   {
//     name?: string,
//     scheduledFor: ISO string,
//     repeat?: 'none' | 'daily' | 'weekly' | 'monthly',
//     repeatUntil?: ISO string,
//     messages: [{ content, type?, delaySeconds?, attachmentUrl? }],
//     recipients: [{ recipientType, conversationId? | scope? | folderId? }]
//   }
// Returns: { batchId, scheduledFor, messageCount, recipientCount }
// ═══════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const verified = await verifyApiToken(req, 'POST /api/v1/schedule')
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status })
  }
  const token = verified.token

  if (!hasScopes(token, ['schedule'])) {
    return fail(req, token, 403, 'Token missing "schedule" scope', startedAt)
  }

  const categoryScopes: Scope[] = token.scopes.filter((s) =>
    ['business', 'school', 'work', 'personal'].includes(s)
  ) as Scope[]
  if (categoryScopes.length === 0) {
    return fail(req, token, 403, 'Token missing a category scope', startedAt)
  }

  // Resolve the conversation ids the token can access
  const { allowed, byCategory } = await getScopedConversationIds(token.userId, categoryScopes)

  // Parse + validate body
  const body = await req.json().catch(() => ({}))
  const { name, scheduledFor, repeat, repeatUntil, messages, recipients } = body || {}

  if (!scheduledFor || isNaN(new Date(scheduledFor).getTime())) {
    return fail(req, token, 400, 'scheduledFor is required (ISO date)', startedAt)
  }
  if (new Date(scheduledFor).getTime() < Date.now()) {
    return fail(req, token, 400, 'scheduledFor must be in the future', startedAt)
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
    return fail(req, token, 400, 'messages must be 1-50 items', startedAt)
  }
  if (!Array.isArray(recipients) || recipients.length === 0 || recipients.length > 200) {
    return fail(req, token, 400, 'recipients must be 1-200 items', startedAt)
  }

  const validRepeats = ['none', 'daily', 'weekly', 'monthly']
  const repeatValue = validRepeats.includes(repeat) ? repeat : 'none'

  // Validate recipient authorization:
  // - conversation recipients must be in the token's allowed set
  // - scope recipients must match one of the token's category scopes
  // - folder recipients: each folder's conversations must all be in the
  //   allowed set (otherwise reject — we don't silently filter)
  for (const r of recipients) {
    if (r?.recipientType === 'conversation') {
      if (!r.conversationId || !allowed.has(r.conversationId)) {
        return fail(req, token, 403, `Conversation ${r.conversationId} out of token scope`, startedAt)
      }
    } else if (['business', 'school', 'work', 'personal'].includes(r?.recipientType)) {
      if (!categoryScopes.includes(r.recipientType as Scope)) {
        return fail(req, token, 403, `Token lacks "${r.recipientType}" scope`, startedAt)
      }
    } else if (r?.recipientType === 'folder') {
      // Resolve the folder's conversations and check they're all allowed
      const folderConvs = await db.folderConversation.findMany({
        where: { folderId: r.folderId },
        select: { conversationId: true },
      })
      for (const fc of folderConvs) {
        if (!allowed.has(fc.conversationId)) {
          return fail(req, token, 403, `Folder contains a conversation outside token scope`, startedAt)
        }
      }
    } else {
      return fail(req, token, 400, `Invalid recipientType`, startedAt)
    }
  }

  let repeatUntilDate: Date | null = null
  if (repeatValue !== 'none' && repeatUntil) {
    repeatUntilDate = new Date(repeatUntil)
    if (isNaN(repeatUntilDate.getTime())) {
      return fail(req, token, 400, 'Invalid repeatUntil', startedAt)
    }
  }

  const batch = await db.scheduledBatch.create({
    data: {
      userId: token.userId,
      name: typeof name === 'string' ? name.slice(0, 200) : null,
      scheduledFor: new Date(scheduledFor),
      repeat: repeatValue,
      repeatUntil: repeatUntilDate,
      status: 'pending',
      createdByTokenId: token.tokenId,
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

  auditLog({
    tokenId: token.tokenId,
    userId: token.userId,
    endpoint: 'POST /api/v1/schedule',
    method: 'POST',
    ip: req.headers.get('x-forwarded-for') || null,
    userAgent: req.headers.get('user-agent') || null,
    statusCode: 200,
    durationMs: Date.now() - startedAt,
    context: `batchId=${batch.id} messages=${batch._count.messages} recipients=${batch._count.recipients}`,
  })

  return NextResponse.json({
    batchId: batch.id,
    scheduledFor: batch.scheduledFor,
    messageCount: batch._count.messages,
    recipientCount: batch._count.recipients,
    status: batch.status,
  })
}

function fail(req: NextRequest, token: any, status: number, error: string, startedAt: number) {
  auditLog({
    tokenId: token.tokenId,
    userId: token.userId,
    endpoint: 'POST /api/v1/schedule',
    method: 'POST',
    ip: req.headers.get('x-forwarded-for') || null,
    userAgent: req.headers.get('user-agent') || null,
    statusCode: status,
    durationMs: Date.now() - startedAt,
    context: error,
  })
  return NextResponse.json({ error }, { status })
}
