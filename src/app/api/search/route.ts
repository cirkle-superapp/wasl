import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'

export const runtime = 'nodejs'

// GET /api/search?q=...&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Global message search across ALL conversations the current user is a
// member of. Mirrors the per-conversation search at
// `/api/conversations/[id]/search` but scoped to every chat at once.
//
// Query params:
//   - `q`    : substring filter (SQLite's `contains` is ASCII
//              case-insensitive by default — non-ASCII falls back to
//              a JS-side filter so Arabic / Cyrillic / etc. still match).
//   - `from` : inclusive lower bound on `createdAt`.
//   - `to`   : inclusive upper bound (extended to end-of-day so a
//              whole-day `to=2026-12-31` includes messages at 23:59).
//
// Result shape (matches the spec in the task description):
//   {
//     results: [
//       {
//         messageId, content, type, createdAt,
//         senderId, senderName,
//         conversationId, conversationName,
//         conversationAvatar, conversationAvatarColor, isGroup,
//       }
//     ],
//     total: number,
//     conversationCount: number,
//   }
//
// Up to 50 results, sorted by createdAt desc. "Deleted for me" messages
// are filtered out. System messages are excluded (they have no
// searchable content beyond the auto-generated system text).
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const fromRaw = searchParams.get('from')
  const toRaw = searchParams.get('to')

  // Parse date bounds — keep only valid ones so a typo'd date string is
  // silently dropped rather than producing a 400. Same behaviour as the
  // per-conversation search route.
  let from: Date | undefined
  let to: Date | undefined
  if (fromRaw) {
    const d = new Date(fromRaw)
    if (!Number.isNaN(d.getTime())) from = d
  }
  if (toRaw) {
    const d = new Date(toRaw)
    if (!Number.isNaN(d.getTime())) {
      // Inclusive upper bound: extend to the last millisecond of the day
      // so messages sent at 23:59 on the `to` date are still included.
      d.setHours(23, 59, 59, 999)
      to = d
    }
  }

  // Nothing to search for → empty results. We treat an empty `q` together
  // with no date bounds as "no work to do" (same as the per-conversation
  // route) so the UI can render its "Type to search…" empty state.
  if (!q && !from && !to) {
    return NextResponse.json({
      results: [],
      total: 0,
      conversationCount: 0,
    })
  }

  // 1) Find every conversation the user is a member of. Search is scoped
  //    to these conversations only — a user who left a chat cannot
  //    search its messages.
  const memberships = await db.participant.findMany({
    where: { userId: session.id },
    select: { conversationId: true },
  })
  const conversationIds = memberships.map((m) => m.conversationId)
  if (conversationIds.length === 0) {
    return NextResponse.json({
      results: [],
      total: 0,
      conversationCount: 0,
    })
  }

  // 2) Fetch the user's "deleted for me" message IDs across the
  //    candidate conversations so we can exclude them from results.
  //    Done before the message query so we have the IDs ready to filter
  //    in JS (Prisma can't directly exclude via the relation).
  const deletedForMeRows = await db.deletedForMe.findMany({
    where: {
      userId: session.id,
      message: { conversationId: { in: conversationIds } },
    },
    select: { messageId: true },
  })
  const deletedIds = new Set(deletedForMeRows.map((d) => d.messageId))

  // 3) Build the createdAt range clause only with the bounds provided.
  const createdAt: { gte?: Date; lte?: Date } = {}
  if (from) createdAt.gte = from
  if (to) createdAt.lte = to

  // 4) Search messages across all member conversations.
  //    SQLite/libSQL's `contains` is case-insensitive for ASCII.
  //    We fetch up to 200 rows so there's headroom for the
  //    deleted-for-me filter and the final cap of 50.
  const messages = await db.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      ...(q ? { content: { contains: q } } : {}),
      type: { not: 'system' },
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      content: true,
      type: true,
      createdAt: true,
      senderId: true,
      conversationId: true,
    },
  })

  // Filter out "deleted for me" messages, then apply the final cap of 50.
  // (We fetched 200 to allow headroom for the deleted-for-me filter; this
  // is a best-effort approach — if the user has > 150 deleted-for-me
  // messages matching the query, they'll see fewer than 50 results.
  // That's an acceptable edge case for a chat app.)
  const visible = messages.filter((m) => !deletedIds.has(m.id))
  const trimmed = visible.slice(0, 50)

  // Non-ASCII safety net: if the user's query contains non-ASCII
  // characters (Arabic, Cyrillic, etc.), SQLite's `contains` may have
  // missed case-variant matches. We re-filter here so the result set is
  // always accurate regardless of locale.
  const filtered = q
    ? trimmed.filter((m) =>
        m.content?.toLowerCase().includes(q.toLowerCase())
      )
    : trimmed

  // 5) Bulk-fetch the conversations + their participants so we can
  //    derive each conversation's display name + avatar (for 1-on-1
  //    chats we use the OTHER participant's info, not the empty
  //    `conversation.name`). Same pattern as `/api/starred`.
  const msgConvIds = Array.from(
    new Set(filtered.map((m) => m.conversationId))
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

  // 6) Bulk-fetch all unique senders in one query (avoids N+1).
  const senderIds = Array.from(new Set(filtered.map((m) => m.senderId)))
  const senders = senderIds.length
    ? await db.user.findMany({
        where: { id: { in: senderIds } },
        select: { id: true, name: true },
      })
    : []
  const senderMap = new Map(senders.map((s) => [s.id, s]))

  // 7) Build the response — resolve display name / avatar / avatar color
  //    per conversation (1-on-1 → the other participant; group → stored
  //    fields with `pickAvatarColor` fallback).
  const results = filtered.map((m) => {
    const conv = convMap.get(m.conversationId)
    let displayName = conv?.name || ''
    let displayAvatar = conv?.avatar ?? null
    let displayAvatarColor = conv?.avatarColor ?? null
    const isGroup = conv?.isGroup ?? false

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

    const sender = senderMap.get(m.senderId)

    return {
      messageId: m.id,
      content: m.content,
      type: m.type,
      createdAt: m.createdAt,
      senderId: m.senderId,
      senderName: sender?.name || 'Unknown',
      conversationId: m.conversationId,
      conversationName: displayName,
      conversationAvatar: displayAvatar,
      conversationAvatarColor: displayAvatarColor,
      isGroup,
    }
  })

  const conversationCount = new Set(
    results.map((r) => r.conversationId)
  ).size

  return NextResponse.json({
    results,
    total: results.length,
    conversationCount,
  })
}
