import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/conversations/:id/messages?before=<iso>&limit=50
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const participation = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!participation) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const before = searchParams.get('before')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

  const messages = await db.message.findMany({
    where: {
      conversationId: id,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      reactions: {
        select: { id: true, userId: true, emoji: true },
      },
    },
  })

  // Mark as read: update my lastReadAt and any messages sent by others as read
  await db.participant.update({
    where: { id: participation.id },
    data: { lastReadAt: new Date() },
  })
  await db.message.updateMany({
    where: {
      conversationId: id,
      senderId: { not: session.id },
      status: { not: 'read' },
    },
    data: { status: 'read' },
  })

  // Fetch the user's starred message IDs in this conversation
  const starredRows = await db.starredMessage.findMany({
    where: { userId: session.id, message: { conversationId: id } },
    select: { messageId: true },
  })
  const starredIds = new Set(starredRows.map((s) => s.messageId))

  // Exclude messages the current user has "deleted for me" — these are
  // locally hidden but still visible to other participants.
  const deletedForMeRows = await db.deletedForMe.findMany({
    where: { userId: session.id, message: { conversationId: id } },
    select: { messageId: true },
  })
  const deletedSet = new Set(deletedForMeRows.map((d) => d.messageId))

  // ---- Per-recipient read state for outgoing messages -----------------------
  // For each message the current user sent, we compute whether EVERY other
  // participant has read it (readByEveryone) and how many have read it out
  // of the total (readCount / totalRecipients). This drives the
  // "read by all" indicator on the message bubble.
  //
  // Bucketing rule (mirrors /api/messages/[id]/read-receipts):
  //   - READ → participant.lastReadAt >= message.createdAt
  //
  // We fetch every other participant once (single query) and reuse the list
  // for every outgoing message — O(participants × messages) but both are
  // small for a single page (PAGE_SIZE messages, small groups).
  const otherParticipants = await db.participant.findMany({
    where: {
      conversationId: id,
      userId: { not: session.id },
    },
    select: { lastReadAt: true },
  })
  const totalRecipients = otherParticipants.length
  // Pre-compute the lastReadAt timestamps once (as epoch ms) so we don't pay
  // the Date.getTime() overhead inside the per-message loop.
  const otherLastReadAtMs = otherParticipants.map((p) => p.lastReadAt.getTime())

  return NextResponse.json({
    messages: messages
      .filter((m) => !deletedSet.has(m.id))
      .reverse()
      .map((m) => {
        // Only compute read-receipt summary for messages sent by the current
        // user. Incoming messages don't need these fields (the bubble only
        // shows read ticks for outgoing messages).
        let readByEveryone: boolean | undefined
        let readCount: number | undefined
        if (m.senderId === session.id && totalRecipients > 0) {
          const createdAtMs = m.createdAt.getTime()
          let read = 0
          for (const ts of otherLastReadAtMs) {
            if (ts >= createdAtMs) read++
          }
          readCount = read
          readByEveryone = read >= totalRecipients
        }
        return {
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderId,
          content: m.content,
          type: m.type,
          status: m.status,
          createdAt: m.createdAt,
          replyToId: m.replyToId,
          commitId: m.commitId,
          protected: m.protected,
          edited: m.edited,
          pinned: m.pinned,
          transcription: m.transcription,
          senderLabel: m.senderLabel,
          senderLabelColor: m.senderLabelColor,
          senderAvatarPath: m.senderAvatarPath,
          starred: starredIds.has(m.id),
          reactions: m.reactions.map((r) => ({
            id: r.id,
            userId: r.userId,
            emoji: r.emoji,
          })),
          // ---- Read-receipt summary (sender-only) -------------------------
          // Undefined for incoming messages; the bubble only uses these on
          // outgoing messages where they're meaningful.
          readByEveryone,
          readCount,
          totalRecipients: m.senderId === session.id ? totalRecipients : undefined,
        }
      }),
  })
}

// POST /api/conversations/:id/messages - send a message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const participation = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!participation) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const { content, type = 'text', replyToId, protected: protectedOverride, businessId } = body || {}
  if (!content || !String(content).trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  // ---- Business messaging support --------------------------------------
  // When `businessId` is provided, the message is sent "as a business" —
  // the sender's display name is overridden with the business name, and
  // a business-colored avatar is shown instead of the user's personal one.
  // The user must be the owner (or a member with 'admin' role) of the business.
  let senderLabel: string | null = null
  let senderLabelColor: string | null = null
  let senderAvatarPath: string | null = null
  if (businessId && typeof businessId === 'string') {
    const biz = await db.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        avatarColor: true,
        avatarPath: true,
        ownerId: true,
        status: true,
        verified: true,
      },
    })
    if (biz && biz.ownerId === session.id && biz.status === 'approved') {
      senderLabel = biz.name
      senderLabelColor = biz.avatarColor
      senderAvatarPath = biz.avatarPath
    } else {
      // Check if the user is a business member with admin role
      const membership = await db.businessMember.findUnique({
        where: {
          businessId_userId: { businessId, userId: session.id },
        },
      })
      if (membership && membership.role === 'admin' && biz?.status === 'approved') {
        senderLabel = biz.name
        senderLabelColor = biz.avatarColor
        senderAvatarPath = biz.avatarPath
      }
    }
  }

  // Resolve the effective `protected` flag:
  //   - explicit boolean override (from the message-input lock toggle) wins
  //   - otherwise use the sender's `defaultProtectMessages` setting
  const sender = await db.user.findUnique({
    where: { id: session.id },
    select: { defaultProtectMessages: true, username: true, name: true, phone: true },
  })
  const effectiveProtected =
    typeof protectedOverride === 'boolean'
      ? protectedOverride
      : sender?.defaultProtectMessages ?? false

  // ---- Block check (Task 67) ---------------------------------------------
  // For 1-on-1 conversations, if EITHER party has blocked the other, the
  // message is silently dropped. We return 200 OK to the sender (so they
  // don't know they've been blocked) but the message is never persisted.
  // For group conversations, we skip the block check (group context can
  // override individual blocks) — but we DO exclude blocked recipients from
  // the delivered/read count.
  const conversation = await db.conversation.findUnique({
    where: { id },
    select: { isGroup: true, participants: { select: { userId: true } } },
  })
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }
  if (!conversation.isGroup) {
    const otherParticipant = conversation.participants.find(
      (p) => p.userId !== session.id
    )
    if (otherParticipant) {
      const [iBlockedThem, theyBlockedMe] = await Promise.all([
        db.block.findUnique({
          where: { blockerId_blockedId: { blockerId: session.id, blockedId: otherParticipant.userId } },
        }),
        db.block.findUnique({
          where: { blockerId_blockedId: { blockerId: otherParticipant.userId, blockedId: session.id } },
        }),
      ])
      if (iBlockedThem) {
        return NextResponse.json({ error: 'You blocked this user. Unblock to send.' }, { status: 403 })
      }
      if (theyBlockedMe) {
        // Don't tell the sender they're blocked — silently pretend the message
        // was delivered (so they don't try to circumvent the block by signing up
        // a new account etc.). The message is NOT persisted.
        return NextResponse.json({
          id: 'blocked-' + Date.now(),
          conversationId: id,
          senderId: session.id,
          content: String(content),
          type: String(type),
          status: 'sent',
          createdAt: new Date().toISOString(),
          __silentlyDropped: true,
        })
      }
    }
  }

  // ---- Portal stamping (Task 67) -----------------------------------------
  // Find the sender's currently-active phone number so we can stamp the
  // `fromPhone`, `portalName`, and `hideNumber` on the message. This lets
  // the recipient UI show "@username · Real Name (Portal)" beside the
  // message bubble.
  const activePhone = await db.phoneNumber.findFirst({
    where: { userId: session.id, active: true },
    select: { number: true, portalName: true, hideNumber: true },
  })

  const message = await db.message.create({
    data: {
      conversationId: id,
      senderId: session.id,
      content: String(content),
      type: String(type),
      status: 'sent',
      replyToId: replyToId ? String(replyToId) : null,
      protected: effectiveProtected,
      senderLabel,
      senderLabelColor,
      senderAvatarPath,
      fromPhone: activePhone?.number || null,
    },
  })
  // Bump conversation updatedAt for sorting
  await db.conversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  })

  return NextResponse.json({
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    type: message.type,
    status: message.status,
    createdAt: message.createdAt,
    replyToId: message.replyToId,
    commitId: message.commitId,
    protected: message.protected,
    edited: message.edited,
    pinned: message.pinned,
    senderLabel: message.senderLabel,
    senderLabelColor: message.senderLabelColor,
    senderAvatarPath: message.senderAvatarPath,
  })
}

// PATCH /api/conversations/:id/messages - mark messages as delivered/read
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const participation = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!participation) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const { status, messageIds } = body || {}
  if (!['delivered', 'read'].includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }
  if (Array.isArray(messageIds) && messageIds.length > 0) {
    await db.message.updateMany({
      where: {
        id: { in: messageIds },
        senderId: { not: session.id },
      },
      data: { status },
    })
  }
  if (status === 'read') {
    await db.participant.update({
      where: { id: participation.id },
      data: { lastReadAt: new Date() },
    })
  }
  return NextResponse.json({ ok: true })
}
