import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ALL_SCOPES, type Scope } from '@/lib/api-auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// PATCH /api/tokens/[id] — update a token's name/scopes/expiration
// (Cannot change the raw token value itself.)
// ═══════════════════════════════════════════════════════════════════════
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const token = await db.apiToken.findUnique({
    where: { id },
    select: { userId: true, revokedAt: true },
  })
  if (!token || token.userId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (token.revokedAt) {
    return NextResponse.json({ error: 'Token already revoked' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const data: { name?: string; scopes?: string; expiresAt?: Date | null } = {}

  if (typeof body.name === 'string' && body.name.trim()) {
    data.name = body.name.trim().slice(0, 100)
  }
  if (Array.isArray(body.scopes)) {
    const scopes: Scope[] = []
    for (const s of body.scopes) {
      if (ALL_SCOPES.includes(s as Scope) && !scopes.includes(s as Scope)) {
        scopes.push(s as Scope)
      }
    }
    if (scopes.length === 0) {
      return NextResponse.json({ error: 'At least one scope is required' }, { status: 400 })
    }
    data.scopes = JSON.stringify(scopes)
  }
  if (body.expiresAt === null) {
    data.expiresAt = null
  } else if (body.expiresAt) {
    const d = new Date(body.expiresAt)
    if (!isNaN(d.getTime()) && d.getTime() > Date.now()) {
      data.expiresAt = d
    }
  }

  const updated = await db.apiToken.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      rateLimitPerMin: true,
      expiresAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ token: updated })
}

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/tokens/[id] — soft-revoke a token (keeps audit history).
// ═══════════════════════════════════════════════════════════════════════
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const token = await db.apiToken.findUnique({
    where: { id },
    select: { userId: true, revokedAt: true },
  })
  if (!token || token.userId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (token.revokedAt) {
    return NextResponse.json({ error: 'Token already revoked' }, { status: 400 })
  }

  await db.apiToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ ok: true, revokedAt: new Date().toISOString() })
}
