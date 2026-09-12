import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/messages/[id]/screenshot-attempt
// Body: { kind: 'printscreen' | 'copy' | 'save' | 'contextmenu' | 'drag', note?: string }
//
// Records that the current user attempted to screenshot / copy / save a
// message. The server resolves the effective `protected` flag and only
// records the attempt if the message is actually protected (so we don't
// spam the audit log for non-protected messages). Returns whether the
// attempt was allowed or blocked so the client can show the right toast.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const kind =
    typeof body?.kind === 'string' && body.kind.length > 0
      ? body.kind.slice(0, 20)
      : 'printscreen'
  const note =
    typeof body?.note === 'string' ? body.note.slice(0, 280) : null

  const message = await db.message.findUnique({
    where: { id },
    include: {
      sender: {
        select: { defaultProtectMessages: true },
      },
    },
  })
  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // The user recording the attempt must be a participant of the conversation.
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: message.conversationId,
        userId: session.id,
      },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Resolve the effective protection flag.
  const isProtected =
    typeof message.protected === 'boolean'
      ? message.protected
      : message.sender?.defaultProtectMessages ?? false

  // The owner of the message can always screenshot their own messages.
  const isOwner = message.senderId === session.id
  // The recipient can override protection if they have "privacy always allow" set.
  const me = await db.user.findUnique({
    where: { id: session.id },
    select: { privacyAlwaysAllow: true },
  })
  const alwaysAllow = !!me?.privacyAlwaysAllow

  const allowed = !isProtected || isOwner || alwaysAllow

  if (isProtected && !isOwner && !alwaysAllow) {
    // Record the blocked attempt for audit / sender notification.
    try {
      await db.screenshotAttempt.create({
        data: {
          messageId: message.id,
          reporterId: session.id,
          kind,
          note,
        },
      })
    } catch (err) {
      // ignore audit failure — don't fail the request
      console.error('[screenshot-attempt] audit failed:', err)
    }
  }

  return NextResponse.json({
    allowed,
    protected: isProtected,
    isOwner,
    alwaysAllow,
  })
}
