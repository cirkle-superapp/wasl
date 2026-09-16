import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// Normalise the incoming body into an array of conversation IDs.
// Backward-compatibility: callers may pass a single `targetConversationId`
// (string), or `conversationId` (string), OR the new `conversationIds`
// (string[]). Duplicates are removed so the same chat isn't double-posted.
function resolveTargetIds(body: {
  targetConversationId?: string
  conversationId?: string
  conversationIds?: string[]
}): string[] {
  const ids: string[] = []
  if (typeof body.targetConversationId === 'string' && body.targetConversationId) {
    ids.push(body.targetConversationId)
  }
  if (typeof body.conversationId === 'string' && body.conversationId) {
    ids.push(body.conversationId)
  }
  if (Array.isArray(body.conversationIds)) {
    for (const id of body.conversationIds) {
      if (typeof id === 'string' && id) ids.push(id)
    }
  }
  return Array.from(new Set(ids))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const targetIds = resolveTargetIds(body)
  if (targetIds.length === 0) {
    return NextResponse.json(
      { error: 'conversationIds (array) or targetConversationId (string) required' },
      { status: 400 }
    )
  }

  const original = await db.message.findUnique({
    where: { id },
    include: {
      sender: {
        select: { defaultProtectMessages: true, privacyAlwaysAllow: true },
      },
    },
  })
  if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ---- Forwarding protection ---------------------------------------------
  // Resolve the effective `protected` flag on the original message:
  //   - explicit boolean on the message wins
  //   - otherwise use the sender's `defaultProtectMessages` setting
  const isProtected =
    typeof original.protected === 'boolean'
      ? original.protected
      : original.sender?.defaultProtectMessages ?? false

  if (isProtected) {
    // The OWNER of the message can always forward their own message —
    // protection only restricts recipients, not the original sender.
    const isOwner = original.senderId === session.id
    if (!isOwner) {
      // The recipient is allowed ONLY if they have chosen "privacy always
      // allow" — opting out of receiving protection.
      const me = await db.user.findUnique({
        where: { id: session.id },
        select: { privacyAlwaysAllow: true },
      })
      if (!me?.privacyAlwaysAllow) {
        // Record the blocked forwarding attempt so the sender can be notified.
        try {
          await db.screenshotAttempt.create({
            data: {
              messageId: original.id,
              reporterId: session.id,
              kind: 'forward',
              note: 'Blocked: message is protected and recipient has not enabled privacy-always-allow.',
            },
          })
        } catch {
          // ignore audit failure
        }
        return NextResponse.json(
          {
            error: 'This message is protected by the sender. You cannot forward it.',
            protected: true,
          },
          { status: 403 }
        )
      }
    }
  }

  // ---- Multi-target forwarding ------------------------------------------
  // Verify membership in every target conversation in a single round-trip,
  // then create a forwarded copy in each. We don't wrap this in a tx because
  // partial success is acceptable (and even desirable: if one target fails,
  // the others should still receive the message).
  const memberships = await db.participant.findMany({
    where: {
      userId: session.id,
      conversationId: { in: targetIds },
    },
    select: { conversationId: true },
  })
  const memberOf = new Set(memberships.map((m) => m.conversationId))

  const forwardedIds: { conversationId: string; messageId: string }[] = []
  const notMember: string[] = []
  const failed: { conversationId: string; error: string }[] = []

  for (const convId of targetIds) {
    if (!memberOf.has(convId)) {
      notMember.push(convId)
      continue
    }
    try {
      const created = await db.message.create({
        data: {
          conversationId: convId,
          senderId: session.id,
          content: original.content,
          type: original.type,
          status: 'sent',
          protected: isProtected,
        },
      })
      forwardedIds.push({ conversationId: convId, messageId: created.id })
    } catch (err) {
      failed.push({
        conversationId: convId,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  // Backward-compatible single-target response shape: if exactly one target
  // was requested AND it succeeded, return the original `{ ok, forwardedId,
  // protected }` payload. Otherwise return the multi-target summary.
  if (targetIds.length === 1 && forwardedIds.length === 1) {
    return NextResponse.json({
      ok: true,
      forwardedId: forwardedIds[0].messageId,
      protected: isProtected,
    })
  }

  return NextResponse.json({
    ok: forwardedIds.length > 0,
    forwarded: forwardedIds.length,
    conversationIds: forwardedIds.map((f) => f.conversationId),
    forwardedIds: forwardedIds.map((f) => f.messageId),
    protected: isProtected,
    notMember,
    failed,
  })
}
