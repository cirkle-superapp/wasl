import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'

export const runtime = 'nodejs'

// GET /api/starred
// Returns ALL messages starred by the current user across ALL conversations
// they are a member of. Each entry includes:
//   - message content + sender info
//   - conversation info (derived display name + avatar for 1-on-1 chats)
//   - the starredAt timestamp (when the user starred it)
// Sorted by starredAt desc (most recently starred first).
//
// Optional query: ?q=search  — filters by message content (case-insensitive
// substring match). Filtering is done in JS so it works for non-ASCII text
// as well (SQLite's default LIKE is ASCII-only case-insensitive).
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim().toLowerCase()

  // Only return starred messages whose conversation the user is currently a
  // member of. (If they left a conversation, we don't show those stars.)
  const memberships = await db.participant.findMany({
    where: { userId: session.id },
    select: { conversationId: true },
  })
  const conversationIds = memberships.map((m) => m.conversationId)
  if (conversationIds.length === 0) {
    return NextResponse.json({ starred: [], count: 0 })
  }

  const starred = await db.starredMessage.findMany({
    where: {
      userId: session.id,
      message: { conversationId: { in: conversationIds } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      message: {
        select: {
          id: true,
          content: true,
          type: true,
          createdAt: true,
          senderId: true,
          replyToId: true,
          protected: true,
          conversationId: true,
        },
      },
    },
  })

  // Bulk-fetch the conversations + their participants so we can derive each
  // conversation's display name + avatar (for 1-on-1 chats we use the OTHER
  // participant's info, not the empty `conversation.name`).
  const msgConvIds = Array.from(
    new Set(starred.map((s) => s.message.conversationId))
  )
  const conversations = msgConvIds.length
    ? await db.conversation.findMany({
        where: { id: { in: msgConvIds } },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  avatar: true,
                  avatarColor: true,
                },
              },
            },
          },
        },
      })
    : []
  const convMap = new Map(conversations.map((c) => [c.id, c]))

  // Bulk-fetch all unique senders in one query (avoids N+1).
  const senderIds = Array.from(
    new Set(starred.map((s) => s.message.senderId))
  )
  const senders = senderIds.length
    ? await db.user.findMany({
        where: { id: { in: senderIds } },
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          avatarColor: true,
        },
      })
    : []
  const senderMap = new Map(senders.map((s) => [s.id, s]))

  const enriched = starred.map((s) => {
    const conv = convMap.get(s.message.conversationId)
    let displayName = conv?.name || ''
    let displayAvatar = conv?.avatar ?? null
    let displayAvatarColor = conv?.avatarColor ?? null

    if (conv && !conv.isGroup) {
      // 1-on-1: derive display info from the OTHER participant
      const otherUser = conv.participants.find(
        (p) => p.userId !== session.id
      )?.user
      displayName = otherUser?.name || conv.name || 'Unknown'
      displayAvatar = otherUser?.avatar ?? null
      displayAvatarColor =
        otherUser?.avatarColor ?? pickAvatarColor(otherUser?.id || displayName)
    } else if (conv?.isGroup && !displayAvatarColor) {
      displayAvatarColor = pickAvatarColor(conv.id)
    }

    const sender = senderMap.get(s.message.senderId)
    return {
      id: s.id,
      starredAt: s.createdAt,
      message: {
        id: s.message.id,
        content: s.message.content,
        type: s.message.type,
        createdAt: s.message.createdAt,
        senderId: s.message.senderId,
        replyToId: s.message.replyToId,
        protected: s.message.protected,
        sender: sender
          ? {
              id: sender.id,
              name: sender.name,
              username: sender.username,
              avatar: sender.avatar,
              avatarColor: sender.avatarColor,
            }
          : null,
      },
      conversation: conv
        ? {
            id: conv.id,
            name: displayName,
            avatar: displayAvatar,
            avatarColor: displayAvatarColor,
            isGroup: conv.isGroup,
          }
        : null,
    }
  })

  // Apply the content search filter in JS so it works for non-ASCII text.
  const filtered = q
    ? enriched.filter((e) =>
        e.message.content?.toLowerCase().includes(q)
      )
    : enriched

  return NextResponse.json({ starred: filtered, count: filtered.length })
}
