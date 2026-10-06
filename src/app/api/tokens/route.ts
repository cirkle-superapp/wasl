import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import {
  generateRawToken,
  hashToken,
  getTokenPrefix,
  ALL_SCOPES,
  type Scope,
} from '@/lib/api-auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// GET /api/tokens — list the current user's API tokens
// ═══════════════════════════════════════════════════════════════════════
// Never returns the raw token. Returns only the safe prefix + metadata.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tokens = await db.apiToken.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      rateLimitPerMin: true,
      expiresAt: true,
      lastUsedAt: true,
      lastUsedIp: true,
      totalCalls: true,
      revokedAt: true,
      createdAt: true,
    },
  })

  const parsed = tokens.map((t) => ({
    ...t,
    scopes: safeParseScopes(t.scopes),
    isRevoked: !!t.revokedAt,
    isExpired: !!(t.expiresAt && new Date(t.expiresAt) < new Date()),
  }))

  return NextResponse.json({ tokens: parsed })
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/tokens — create a new API token
// Body: { name, scopes: Scope[], expiresAt?, rateLimitPerMin? }
// Returns: { id, name, prefix, scopes, token } — the raw token is shown ONCE.
// ═══════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  if (!name || name.length > 100) {
    return NextResponse.json({ error: 'name is required (max 100 chars)' }, { status: 400 })
  }
  const requestedScopes = Array.isArray(body.scopes) ? body.scopes : []
  // Validate scopes
  const scopes: Scope[] = []
  for (const s of requestedScopes) {
    if (ALL_SCOPES.includes(s as Scope) && !scopes.includes(s as Scope)) {
      scopes.push(s as Scope)
    }
  }
  if (scopes.length === 0) {
    return NextResponse.json({ error: 'At least one scope is required' }, { status: 400 })
  }

  // Validate expiresAt
  let expiresAt: Date | null = null
  if (body.expiresAt) {
    const d = new Date(body.expiresAt)
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Invalid expiresAt' }, { status: 400 })
    }
    if (d.getTime() < Date.now()) {
      return NextResponse.json({ error: 'expiresAt must be in the future' }, { status: 400 })
    }
    expiresAt = d
  }

  // Validate rate limit
  const rateLimit = Math.max(1, Math.min(1000, Number(body.rateLimitPerMin) || 60))

  // Generate + hash
  const rawToken = generateRawToken()
  const tokenHash = hashToken(rawToken)!
  const prefix = getTokenPrefix(rawToken)

  const token = await db.apiToken.create({
    data: {
      userId: session.id,
      name,
      tokenHash,
      prefix,
      scopes: JSON.stringify(scopes),
      rateLimitPerMin: rateLimit,
      expiresAt,
    },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      rateLimitPerMin: true,
      expiresAt: true,
      createdAt: true,
    },
  })

  // Return the RAW TOKEN ONLY ONCE — the user is responsible for saving it
  // securely. We will not show it again.
  return NextResponse.json({
    id: token.id,
    name: token.name,
    prefix: token.prefix,
    scopes,
    rateLimitPerMin: token.rateLimitPerMin,
    expiresAt: token.expiresAt,
    createdAt: token.createdAt,
    token: rawToken, // ← ONLY returned at creation time
    warning: 'Save this token now — you will not be able to see it again.',
  })
}

function safeParseScopes(s: string): Scope[] {
  try {
    const arr = JSON.parse(s || '[]')
    if (!Array.isArray(arr)) return []
    return arr.filter((x) => ALL_SCOPES.includes(x))
  } catch {
    return []
  }
}
