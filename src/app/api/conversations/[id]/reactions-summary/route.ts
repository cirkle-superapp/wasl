import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/conversations/[id]/reactions-summary
// Returns a summary of all reactions used in this conversation, grouped by
// emoji. For each emoji, we return the total count and the list of users
// who used it (with their avatar info). The current user can see this
// summary to get a quick overview of the conversation's reactions.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  // Verify membership
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch all reactions in this conversation. The Reaction model doesn't have
  // a direct `user` relation, so we fetch the reactions first, then look up
  // the users separately.
  const reactions = await db.reaction.findMany({
    where: {
      message: { conversationId: id },
    },
    select: {
      id: true,
      emoji: true,
      userId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500, // cap to prevent unbounded queries
  })

  // Look up user info for all users who reacted
  const userIds = Array.from(new Set(reactions.map((r) => r.userId)))
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      avatarColor: true,
    },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  // Group by emoji
  const byEmoji = new Map<
    string,
    {
      emoji: string
      count: number
      users: {
        id: string
        name: string
        username: string
        avatar: string | null
        avatarColor: string | null
        reactedAt: string
      }[]
    }
  >()

  for (const r of reactions) {
    const user = userMap.get(r.userId)
    if (!user) continue // skip if user not found (shouldn't happen)
    const existing = byEmoji.get(r.emoji)
    const userEntry = {
      id: user.id,
      name: user.name,
      username: user.username,
      avatar: user.avatar,
      avatarColor: user.avatarColor,
      reactedAt: r.createdAt,
    }
    if (existing) {
      existing.count++
      existing.users.push(userEntry)
    } else {
      byEmoji.set(r.emoji, {
        emoji: r.emoji,
        count: 1,
        users: [userEntry],
      })
    }
  }

  // Sort by count descending
  const summary = Array.from(byEmoji.values()).sort((a, b) => b.count - a.count)

  return NextResponse.json({
    totalReactions: reactions.length,
    uniqueEmojis: summary.length,
    reactions: summary,
  })
}
