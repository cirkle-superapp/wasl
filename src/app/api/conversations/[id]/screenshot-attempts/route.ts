import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/conversations/[id]/screenshot-attempts
// Returns ALL screenshot / forwarding attempts recorded against the current
// user's PROTECTED messages within this conversation. The viewer MUST be the
// sender of each message (sender-side audit log only — recipients cannot see
// who tried to capture their own outgoing messages).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  // Verify membership so we don't leak attempts to non-participants.
  const membership = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find all messages in this conversation that:
  //   - were sent by the current user (senderId === session.id)
  //   - are protected (either explicitly OR via the sender's default setting)
  // For each, load its screenshot attempts (with reporter info).
  const myProtectedMessages = await db.message.findMany({
    where: {
      conversationId: id,
      senderId: session.id,
      OR: [
        { protected: true },
        {
          protected: null,
          sender: { defaultProtectMessages: true },
        },
      ],
    },
    select: {
      id: true,
      content: true,
      type: true,
      createdAt: true,
      protected: true,
      screenshotAttempts: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          reporter: {
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
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  // Build a flat list of attempts grouped under each message.
  const messages = myProtectedMessages
    .filter((m) => m.screenshotAttempts.length > 0)
    .map((m) => ({
      id: m.id,
      content: m.content,
      type: m.type,
      createdAt: m.createdAt,
      attempts: m.screenshotAttempts.map((a) => ({
        id: a.id,
        kind: a.kind,
        note: a.note,
        createdAt: a.createdAt,
        reporter: a.reporter
          ? {
              id: a.reporter.id,
              name: a.reporter.name,
              username: a.reporter.username,
              avatar: a.reporter.avatar,
              avatarColor: a.reporter.avatarColor,
            }
          : null,
      })),
    }))

  // Summary counts
  const totalAttempts = messages.reduce((sum, m) => sum + m.attempts.length, 0)
  const byKind: Record<string, number> = {}
  for (const m of messages) {
    for (const a of m.attempts) {
      byKind[a.kind] = (byKind[a.kind] || 0) + 1
    }
  }

  return NextResponse.json({
    messages,
    totalAttempts,
    byKind,
    protectedMessageCount: myProtectedMessages.length,
  })
}
