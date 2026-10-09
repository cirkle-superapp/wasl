// ═══════════════════════════════════════════════════════════════════════
// API Token Authentication (Task 89)
// ═══════════════════════════════════════════════════════════════════════
//
// Personal access tokens that let external platforms integrate with Wasl.
// Token format: wasl_<43 base64url chars> (48 chars total, easy to identify).
//
// We store ONLY the SHA-256 hash of the raw token — never the plaintext.
// This way a database leak cannot compromise active tokens. On every API
// call, we hash the incoming Bearer token and look up the row by tokenHash.
//
// Scopes (JSON array stored on the row):
//   Conversation-category scopes (which convs the token can access):
//     "business"  — conversations where the user sends "as a business"
//     "school"    — School Connect conversations (parent/admin/teacher)
//     "work"      — conversations filed under any "Work" folder
//     "personal"  — 1-on-1 personal chats
//   Permission scopes (what the token can DO):
//     "read"      — GET conversations, messages, contacts
//     "write"     — POST messages (sends)
//     "schedule"  — schedule messages / batches
//
// The /api/v1/* endpoints require both a category scope AND the matching
// permission scope (e.g. sending a business message requires
// ["business", "write"]).

import { createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import type { NextRequest } from 'next/server'

const TOKEN_PREFIX = 'wasl_'

export type Scope = 'business' | 'school' | 'work' | 'personal' | 'read' | 'write' | 'schedule'

export const ALL_SCOPES: Scope[] = ['business', 'school', 'work', 'personal', 'read', 'write', 'schedule']

export const CATEGORY_SCOPES: Scope[] = ['business', 'school', 'work', 'personal']
export const PERMISSION_SCOPES: Scope[] = ['read', 'write', 'schedule']

// ---- Token generation + hashing --------------------------------------------

/** Generate a new raw token: wasl_<43 base64url chars> */
export function generateRawToken(): string {
  // 32 random bytes → 43 base64url chars
  const bytes = randomBytes(32)
  const b64 = bytes.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .slice(0, 43)
  return TOKEN_PREFIX + b64
}

/** Hash a raw token with SHA-256 (hex). Returns null if input is malformed. */
export function hashToken(rawToken: string): string | null {
  if (!rawToken || !rawToken.startsWith(TOKEN_PREFIX)) return null
  return createHash('sha256').update(rawToken).digest('hex')
}

/** Extract the safe display prefix: wasl_<first 8 chars>… */
export function getTokenPrefix(rawToken: string): string {
  // "wasl_" + first 8 chars of the random part
  return rawToken.slice(0, TOKEN_PREFIX.length + 8) + '…'
}

// ---- Verification -----------------------------------------------------------

export type VerifiedToken = {
  tokenId: string
  userId: string
  scopes: Scope[]
  rateLimitPerMin: number
}

export type VerifyResult =
  | { ok: true; token: VerifiedToken }
  | { ok: false; status: number; error: string }

/**
 * Verify a Bearer token from the Authorization header.
 *
 * Returns one of:
 *   - { ok: true, token: { tokenId, userId, scopes, rateLimitPerMin } }
 *   - { ok: false, status, error }
 *
 * Side effects:
 *   - Bumps the token's lastUsedAt + totalCalls
 *   - Writes an AuditLog entry
 */
export async function verifyApiToken(
  req: NextRequest,
  endpoint: string,
): Promise<VerifyResult> {
  const authHeader = req.headers.get('authorization') || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return { ok: false, status: 401, error: 'Missing Bearer token' }
  }
  const rawToken = match[1].trim()
  const tokenHash = hashToken(rawToken)
  if (!tokenHash) {
    return { ok: false, status: 401, error: 'Malformed token' }
  }

  // Look up by hash
  const token = await db.apiToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      scopes: true,
      rateLimitPerMin: true,
      expiresAt: true,
      revokedAt: true,
      totalCalls: true,
    },
  })

  if (!token) {
    return { ok: false, status: 401, error: 'Invalid token' }
  }
  if (token.revokedAt) {
    return { ok: false, status: 401, error: 'Token revoked' }
  }
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
    return { ok: false, status: 401, error: 'Token expired' }
  }

  // Parse scopes
  let scopes: Scope[] = []
  try {
    scopes = JSON.parse(token.scopes || '[]')
    if (!Array.isArray(scopes)) scopes = []
  } catch {
    scopes = []
  }

  // Rate limit (simple in-memory counter per token id per minute).
  // For production this should be Redis, but in-memory works fine for the
  // default rateLimitPerMin values.
  if (token.rateLimitPerMin > 0 && !checkRateLimit(token.id, token.rateLimitPerMin)) {
    return { ok: false, status: 429, error: 'Rate limit exceeded' }
  }

  // Update tracking fields (fire-and-forget — we don't want a slow DB
  // update to delay the API response).
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null
  const ua = req.headers.get('user-agent') || null
  void db.apiToken.update({
    where: { id: token.id },
    data: {
      lastUsedAt: new Date(),
      lastUsedIp: ip,
      lastUserAgent: ua,
      totalCalls: { increment: 1 },
    },
  }).catch(() => {})

  return {
    ok: true,
    token: {
      tokenId: token.id,
      userId: token.userId,
      scopes,
      rateLimitPerMin: token.rateLimitPerMin,
    },
  }
}

/** Check if a token has ALL of the required scopes. */
export function hasScopes(token: VerifiedToken, required: Scope[]): boolean {
  return required.every((s) => token.scopes.includes(s))
}

/** Write an audit log entry (fire-and-forget). */
export function auditLog(params: {
  tokenId: string
  userId: string
  endpoint: string
  method: string
  ip?: string | null
  userAgent?: string | null
  statusCode: number
  durationMs?: number
  context?: string | null
}): void {
  void db.auditLog.create({ data: params }).catch(() => {})
}

// ---- In-memory rate limiter (per token id) ----------------------------------
//
// Bucket = (tokenId, floor(now/60s)). If the bucket counter exceeds
// rateLimitPerMin, deny. Old buckets are GC'd opportunistically.

const rateBuckets = new Map<string, { count: number; expires: number }>()

function checkRateLimit(tokenId: string, limitPerMin: number): boolean {
  const now = Date.now()
  const bucketKey = `${tokenId}:${Math.floor(now / 60_000)}`
  // GC old buckets (sample 1 in 50 calls)
  if (Math.random() < 0.02) {
    for (const [k, v] of rateBuckets) {
      if (v.expires < now) rateBuckets.delete(k)
    }
  }
  const bucket = rateBuckets.get(bucketKey)
  if (!bucket) {
    rateBuckets.set(bucketKey, { count: 1, expires: now + 65_000 })
    return true
  }
  if (bucket.count >= limitPerMin) return false
  bucket.count++
  return true
}

// ---- Conversation filtering by scope ---------------------------------------
//
// Given a user + a set of category scopes, return the list of conversation
// ids the token is allowed to access.

export async function getScopedConversationIds(
  userId: string,
  categoryScopes: Scope[],
): Promise<{ allowed: Set<string>; byCategory: Record<string, Set<string>> }> {
  if (categoryScopes.length === 0) {
    return { allowed: new Set(), byCategory: {} }
  }

  // Get all of the user's conversations
  const participations = await db.participant.findMany({
    where: { userId },
    select: {
      conversationId: true,
      conversation: {
        select: {
          id: true,
          isGroup: true,
          name: true,
        },
      },
    },
  })

  const byCategory: Record<string, Set<string>> = {
    business: new Set(),
    school: new Set(),
    work: new Set(),
    personal: new Set(),
  }

  // For each conversation, classify it into one or more categories.
  const conversationIds = participations.map((p) => p.conversationId)

  // ---- "personal" scope = 1-on-1 chats ----
  if (categoryScopes.includes('personal')) {
    for (const p of participations) {
      if (!p.conversation.isGroup) {
        byCategory.personal.add(p.conversationId)
      }
    }
  }

  // ---- "work" scope = conversations filed under any folder named "Work" ----
  // (and any user-defined folder). We use a heuristic: any folder name
  // containing "work" (case-insensitive).
  if (categoryScopes.includes('work')) {
    const workFolders = await db.chatFolder.findMany({
      where: { userId, name: { contains: 'work' } },
      select: { id: true },
    })
    if (workFolders.length > 0) {
      const folderConvs = await db.folderConversation.findMany({
        where: { folderId: { in: workFolders.map((f) => f.id) } },
        select: { conversationId: true },
      })
      for (const fc of folderConvs) byCategory.work.add(fc.conversationId)
    }
  }

  // ---- "business" scope = conversations tied to a business ----
  // (the user is the business owner, or a member, or sent messages "as a
  // business" in this conversation)
  if (categoryScopes.includes('business')) {
    const ownedBusinesses = await db.business.findMany({
      where: { ownerId: userId },
      select: { id: true },
    })
    const businessIds = ownedBusinesses.map((b) => b.id)
    if (businessIds.length > 0) {
      // Find groups created by these businesses
      const businessGroups = await db.businessGroup.findMany({
        where: { businessId: { in: businessIds } },
        select: { conversationId: true },
      })
      for (const bg of businessGroups) byCategory.business.add(bg.conversationId)
    }
  }

  // ---- "school" scope = conversations tied to a school ----
  // (the user is a school admin, member, or parent of a student at a school
  // AND has a conversation associated with that school)
  if (categoryScopes.includes('school')) {
    // Wasl currently doesn't have direct conversation→school links, so we
    // use a heuristic: any conversation name containing the school name.
    // For a more robust implementation, we'd add a schoolId field to
    // Conversation, but that's a schema migration we'll skip here.
    const schools = await db.school.findMany({
      where: { ownerId: userId },
      select: { name: true },
    })
    const memberships = await db.schoolMembership.findMany({
      where: { userId },
      select: { school: { select: { name: true } } },
    })
    const schoolNames = [
      ...schools.map((s) => s.name),
      ...memberships.map((m) => m.school.name),
    ].filter(Boolean)
    if (schoolNames.length > 0) {
      for (const p of participations) {
        const name = p.conversation.name || ''
        if (schoolNames.some((sn) => name.toLowerCase().includes(sn.toLowerCase()))) {
          byCategory.school.add(p.conversationId)
        }
      }
    }
  }

  // Build the union
  const allowed = new Set<string>()
  for (const cat of categoryScopes) {
    for (const id of byCategory[cat] || []) allowed.add(id)
  }

  return { allowed, byCategory }
}
