import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { targetConversationId } = await req.json()
  if (!targetConversationId) return NextResponse.json({ error: 'targetConversationId required' }, { status: 400 })

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

  const membership = await db.participant.findUnique({
    where: { conversationId_userId: { conversationId: targetConversationId, userId: session.id } },
  })
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  // When forwarding, the forwarded copy inherits the protection flag of the
  // original (so a protected message stays protected in the new conversation).
  const forwarded = await db.message.create({
    data: {
      conversationId: targetConversationId,
      senderId: session.id,
      content: original.content,
      type: original.type,
      status: 'sent',
      protected: isProtected,
    },
  })
  return NextResponse.json({ ok: true, forwardedId: forwarded.id, protected: isProtected })
}
