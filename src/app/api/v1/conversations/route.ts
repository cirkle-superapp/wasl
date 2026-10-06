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
// GET /api/v1/conversations — list conversations the token can access
// Auth: Authorization: Bearer wasl_xxx
// Required scopes: "read" + at least one category scope
// Returns: { conversations: [{ id, name, isGroup, lastMessageAt }] }
// ═══════════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  const verified = await verifyApiToken(req, 'GET /api/v1/conversations')
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status })
  }
  const token = verified.token

  if (!hasScopes(token, ['read'])) {
    auditLog({
      tokenId: token.tokenId,
      userId: token.userId,
      endpoint: 'GET /api/v1/conversations',
      method: 'GET',
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      statusCode: 403,
      durationMs: Date.now() - startedAt,
      context: 'Missing read scope',
    })
    return NextResponse.json({ error: 'Token missing "read" scope' }, { status: 403 })
  }

  const categoryScopes: Scope[] = token.scopes.filter((s) =>
    ['business', 'school', 'work', 'personal'].includes(s)
  ) as Scope[]
  if (categoryScopes.length === 0) {
    return NextResponse.json({ error: 'Token missing a category scope' }, { status: 403 })
  }

  const { allowed, byCategory } = await getScopedConversationIds(token.userId, categoryScopes)
  const allowedIds = Array.from(allowed)
  if (allowedIds.length === 0) {
    auditLog({
      tokenId: token.tokenId,
      userId: token.userId,
      endpoint: 'GET /api/v1/conversations',
      method: 'GET',
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      statusCode: 200,
      durationMs: Date.now() - startedAt,
      context: 'No conversations in scope',
    })
    return NextResponse.json({ conversations: [] })
  }

  const conversations = await db.conversation.findMany({
    where: { id: { in: allowedIds } },
    select: {
      id: true,
      name: true,
      isGroup: true,
      updatedAt: true,
      participants: {
        select: {
          userId: true,
          user: { select: { id: true, name: true, username: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })

  const result = conversations.map((c) => {
    // Compute which category scopes cover this conversation
    const categories: string[] = []
    for (const cat of categoryScopes) {
      if (byCategory[cat]?.has(c.id)) categories.push(cat)
    }
    return {
      id: c.id,
      name: c.isGroup ? (c.name || 'Group') : (c.participants.find((p) => p.userId !== token.userId)?.user.name || c.name || 'Unknown'),
      isGroup: c.isGroup,
      updatedAt: c.updatedAt,
      categories,
    }
  })

  auditLog({
    tokenId: token.tokenId,
    userId: token.userId,
    endpoint: 'GET /api/v1/conversations',
    method: 'GET',
    ip: req.headers.get('x-forwarded-for') || null,
    userAgent: req.headers.get('user-agent') || null,
    statusCode: 200,
    durationMs: Date.now() - startedAt,
    context: `returned ${result.length} conversations`,
  })

  return NextResponse.json({ conversations: result })
}
