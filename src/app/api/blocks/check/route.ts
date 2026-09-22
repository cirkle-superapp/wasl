import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/blocks/check?userId=...
// Returns whether the calling user has blocked the target user, AND whether
// the target user has blocked the calling user (for showing "you can't reply
// to this conversation" indicators).
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const targetUserId = (searchParams.get('userId') || '').trim()
  if (!targetUserId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const [iBlocked, theyBlockedMe] = await Promise.all([
    db.block.findUnique({
      where: { blockerId_blockedId: { blockerId: session.id, blockedId: targetUserId } },
      select: { id: true, reason: true, createdAt: true },
    }),
    db.block.findUnique({
      where: { blockerId_blockedId: { blockerId: targetUserId, blockedId: session.id } },
      select: { id: true, createdAt: true },
    }),
  ])

  return NextResponse.json({
    iBlockedThem: iBlocked
      ? { id: iBlocked.id, reason: iBlocked.reason, createdAt: iBlocked.createdAt }
      : null,
    theyBlockedMe: theyBlockedMe
      ? { id: theyBlockedMe.id, createdAt: theyBlockedMe.createdAt }
      : null,
    conversationBlocked: !!iBlocked || !!theyBlockedMe,
  })
}
