import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'

export const runtime = 'nodejs'

// GET /api/conversations - list current user's conversations with last message preview
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()

  const participations = await db.participant.findMany({
    where: { userId: session.id, archived: false },
    select: { conversationId: true },
  })
  const conversationIds = participations.map((p) => p.conversationId)

  const conversations = await db.conversation.findMany({
    where: {
      id: { in: conversationIds },
      ...(q
        ? { name: { contains: q } }
        : {}),
    },
    include: {
      participants: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              phone: true,
              avatar: true,
              avatarColor: true,
              about: true,
              online: true,
              lastSeen: true,
              verified: true,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  if (conversations.length === 0) {
    return NextResponse.json({ conversations: [] })
  }

  // --- Batched queries to avoid the N+1 problem ---
  // Previously this looped over each conversation and ran 2 queries per
  // conversation (findFirst last message + count unread) — causing 2N+1
  // round-trips to Turso. With high-latency DB connections that meant 6-7s
  // for just a handful of chats. Now we run 3 queries total.

  // 1) All latest messages for every conversation in one query.
  const allMessages = await db.message.findMany({
    where: { conversationId: { in: conversationIds } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      content: true,
      type: true,
      senderId: true,
      status: true,
      createdAt: true,
      conversationId: true,
    },
  })
  const lastMessageByConv = new Map<
    string,
    (typeof allMessages)[number]
  >()
  for (const m of allMessages) {
    // results are ordered desc, so the first one we see per conv is the latest
    if (!lastMessageByConv.has(m.conversationId)) {
      lastMessageByConv.set(m.conversationId, m)
    }
  }

  // 2) Build a lastReadAt map per conversation from the already-fetched participants.
  const lastReadMap = new Map<string, Date>()
  for (const c of conversations) {
    const mp = c.participants.find((p) => p.userId === session.id)
    lastReadMap.set(c.id, mp?.lastReadAt ?? new Date(0))
  }

  // 3) All candidate unread messages (others' messages) in one query,
  //    then count per conversation in JS respecting lastReadAt.
  const unreadCandidates = await db.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      senderId: { not: session.id },
    },
    select: { conversationId: true, createdAt: true },
  })
  const unreadCountMap = new Map<string, number>()
  for (const c of conversations) unreadCountMap.set(c.id, 0)
  for (const m of unreadCandidates) {
    const lr = lastReadMap.get(m.conversationId) ?? new Date(0)
    if (new Date(m.createdAt) > lr) {
      unreadCountMap.set(
        m.conversationId,
        (unreadCountMap.get(m.conversationId) ?? 0) + 1,
      )
    }
  }

  const enriched = conversations.map((c) => {
    const lastMessage = lastMessageByConv.get(c.id) ?? null

    // For 1-on-1, derive display name + avatar from the other participant
    let displayName = c.name || ''
    let displayAvatar = c.avatar
    let displayAvatarColor = c.avatarColor
    let otherUser: any = null
    if (!c.isGroup) {
      otherUser = c.participants.find((p) => p.userId !== session.id)?.user
      displayName = otherUser?.name || c.name || 'Unknown'
      displayAvatar = otherUser?.avatar ?? null
      displayAvatarColor =
        otherUser?.avatarColor ?? pickAvatarColor(otherUser?.id || displayName)
    }

    return {
      id: c.id,
      name: displayName,
      avatar: displayAvatar,
      avatarColor: displayAvatarColor,
      isGroup: c.isGroup,
      participants: c.participants.map((p) => ({
        userId: p.userId,
        username: p.user.username,
        name: p.user.name,
        phone: p.user.phone,
        avatar: p.user.avatar,
        avatarColor: p.user.avatarColor,
        online: p.user.online,
        lastSeen: p.user.lastSeen,
        about: p.user.about,
        verified: p.user.verified,
      })),
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            type: lastMessage.type,
            senderId: lastMessage.senderId,
            status: lastMessage.status,
            createdAt: lastMessage.createdAt,
          }
        : null,
      unreadCount: unreadCountMap.get(c.id) ?? 0,
      updatedAt: c.updatedAt,
    }
  })

  // Sort by last message time if available
  enriched.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt
      ? new Date(a.lastMessage.createdAt).getTime()
      : new Date(a.updatedAt).getTime()
    const bTime = b.lastMessage?.createdAt
      ? new Date(b.lastMessage.createdAt).getTime()
      : new Date(b.updatedAt).getTime()
    return bTime - aTime
  })

  return NextResponse.json({ conversations: enriched })
}

// POST /api/conversations - create a new 1-on-1 or group conversation
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { participantIds, name, isGroup } = body || {}
    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json(
        { error: 'participantIds is required' },
        { status: 400 }
      )
    }

    const allParticipantIds = Array.from(
      new Set([session.id, ...participantIds.map(String)])
    )

    // For 1-on-1, check if a conversation already exists
    if (allParticipantIds.length === 2 && !isGroup) {
      const existing = await db.conversation.findFirst({
        where: {
          isGroup: false,
          participants: {
            every: {
              userId: { in: allParticipantIds },
            },
          },
        },
        include: {
          participants: true,
        },
      })
      if (existing && existing.participants.length === 2) {
        // Make sure both participants match exactly
        const existingIds = existing.participants
          .map((p) => p.userId)
          .sort()
        const wantedIds = [...allParticipantIds].sort()
        if (
          existingIds[0] === wantedIds[0] &&
          existingIds[1] === wantedIds[1]
        ) {
          return NextResponse.json({ id: existing.id, existed: true })
        }
      }
    }

    const group = !!isGroup && allParticipantIds.length > 2
    const conversation = await db.conversation.create({
      data: {
        name: group ? (name || 'New Group') : null,
        isGroup: group,
        createdBy: session.id,
        avatarColor: pickAvatarColor(`group-${Date.now()}`),
        participants: {
          create: allParticipantIds.map((uid) => ({
            userId: uid,
          })),
        },
      },
    })

    // Create a system message
    if (group) {
      await db.message.create({
        data: {
          conversationId: conversation.id,
          senderId: session.id,
          content: `${session.name} created the group "${conversation.name}"`,
          type: 'system',
          status: 'read',
        },
      })
    }

    return NextResponse.json({ id: conversation.id, existed: false })
  } catch (err) {
    console.error('[conversations/POST] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
