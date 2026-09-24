import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { rateLimit, getClientIP } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// GET /api/blocks — list users the current user has blocked.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const blocks = await db.block.findMany({
    where: { blockerId: session.id },
    orderBy: { createdAt: 'desc' },
    include: {
      blocked: {
        select: {
          id: true,
          username: true,
          name: true,
          avatar: true,
          avatarColor: true,
          phone: true,
          about: true,
          online: true,
          lastSeen: true,
          verified: true,
        },
      },
    },
  })

  return NextResponse.json({
    blocks: blocks.map((b) => ({
      id: b.id,
      reason: b.reason,
      createdAt: b.createdAt,
      user: b.blocked,
    })),
  })
}

// POST /api/blocks — block a user.
// Body: { userId, reason? }
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 30 block actions per IP per 60s (anti-spam / bulk-blocking protection)
  const ip = getClientIP(req)
  const rl = rateLimit(`blocks:${ip}`, 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many block actions. Try again later.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  const body = await req.json().catch(() => ({}))
  const targetUserId = (body?.userId || '').toString().trim()
  const reason = (body?.reason || '').toString().trim() || null

  if (!targetUserId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }
  if (targetUserId === session.id) {
    return NextResponse.json({ error: 'You cannot block yourself' }, { status: 400 })
  }

  // Verify the target user exists
  const target = await db.user.findUnique({ where: { id: targetUserId } })
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Idempotent — if already blocked, just update the reason
  const existing = await db.block.findUnique({
    where: { blockerId_blockedId: { blockerId: session.id, blockedId: targetUserId } },
  })
  if (existing) {
    if (reason !== existing.reason) {
      await db.block.update({ where: { id: existing.id }, data: { reason } })
    }
    return NextResponse.json({ ok: true, alreadyBlocked: true })
  }

  await db.block.create({
    data: {
      blockerId: session.id,
      blockedId: targetUserId,
      reason,
    },
  })

  return NextResponse.json({ ok: true, blockedUserId: targetUserId })
}
