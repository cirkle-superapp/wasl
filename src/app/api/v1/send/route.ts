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
// POST /api/v1/send — send a message via API token
// Auth: Authorization: Bearer wasl_xxx
// Required scopes: "write" + at least one category scope that covers the
// target conversation (business/school/work/personal).
//
// Body:
//   {
//     conversationId: string,
//     content: string,
//     type?: 'text' | 'image',
//     attachmentUrl?: string,
//     protected?: boolean   // mark as protected (no screenshots/forwarding)
//   }
// Returns: { messageId, conversationId, createdAt }
// ═══════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const verified = await verifyApiToken(req, 'POST /api/v1/send')
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status })
  }
  const token = verified.token

  // Required scopes: "write" + at least one category scope
  const categoryScopes: Scope[] = token.scopes.filter((s) =>
    ['business', 'school', 'work', 'personal'].includes(s)
  ) as Scope[]
  if (!hasScopes(token, ['write'])) {
    return writeAuditAndFail(req, token, 403, 'Token missing "write" scope', startedAt)
  }
  if (categoryScopes.length === 0) {
    return writeAuditAndFail(req, token, 403, 'Token missing a category scope (business/school/work/personal)', startedAt)
  }

  const body = await req.json().catch(() => ({}))
  const { conversationId, content } = body
  if (!conversationId || typeof content !== 'string' || !content.trim()) {
    return writeAuditAndFail(req, token, 400, 'conversationId + content required', startedAt)
  }
  if (content.length > 5000) {
    return writeAuditAndFail(req, token, 400, 'content too long (max 5000 chars)', startedAt)
  }

  // Resolve allowed conversations for the token's category scopes
  const { allowed } = await getScopedConversationIds(token.userId, categoryScopes)
  if (!allowed.has(conversationId)) {
    return writeAuditAndFail(req, token, 403, `Conversation not in token's scope`, startedAt)
  }

  // Verify the user is still a participant (defensive)
  const participation = await db.participant.findUnique({
    where: {
      conversationId_userId: { userId: token.userId, conversationId },
    },
    select: { archived: true },
  })
  if (!participation || participation.archived) {
    return writeAuditAndFail(req, token, 404, 'Conversation not found or archived', startedAt)
  }

  // Create the message
  const message = await db.message.create({
    data: {
      conversationId,
      senderId: token.userId,
      content,
      type: body.type === 'image' ? 'image' : 'text',
      status: 'sent',
      protected: body.protected === true ? true : (body.protected === false ? false : null),
    },
  })
  await db.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  })

  auditLog({
    tokenId: token.tokenId,
    userId: token.userId,
    endpoint: 'POST /api/v1/send',
    method: 'POST',
    ip: req.headers.get('x-forwarded-for') || null,
    userAgent: req.headers.get('user-agent') || null,
    statusCode: 200,
    durationMs: Date.now() - startedAt,
    context: `conversationId=${conversationId} messageId=${message.id}`,
  })

  return NextResponse.json({
    messageId: message.id,
    conversationId,
    createdAt: message.createdAt,
  })
}

function writeAuditAndFail(req: NextRequest, token: any, status: number, error: string, startedAt: number) {
  auditLog({
    tokenId: token.tokenId,
    userId: token.userId,
    endpoint: 'POST /api/v1/send',
    method: 'POST',
    ip: req.headers.get('x-forwarded-for') || null,
    userAgent: req.headers.get('user-agent') || null,
    statusCode: status,
    durationMs: Date.now() - startedAt,
    context: error,
  })
  return NextResponse.json({ error }, { status })
}
