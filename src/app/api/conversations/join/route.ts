import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/conversations/join — join a conversation via an invite token.
// Body: { token: string }
//
// Resolves the conversation by its `inviteToken`. If no conversation matches
// (or the token was revoked), returns 404. If the user is already a member,
// returns `{ ok: true, alreadyMember: true }` (no-op). Otherwise creates a
// Participant row with role "member" and emits a system message.
//
// Note: 1-on-1 conversations never have an invite token, so this route
// effectively only ever joins groups.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { token?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const token =
    typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token) {
    return NextResponse.json(
      { error: 'token is required' },
      { status: 400 }
    )
  }

  const conversation = await db.conversation.findFirst({
    where: { inviteToken: token },
    include: { participants: { select: { userId: true } } },
  })

  if (!conversation || !conversation.inviteToken) {
    return NextResponse.json(
      { error: 'Invalid or expired invite link' },
      { status: 404 }
    )
  }

  // Already a member? Short-circuit with a success so the client can simply
  // route to the conversation without creating a duplicate Participant row.
  const isMember = conversation.participants.some(
    (p) => p.userId === session.id
  )
  if (isMember) {
    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      alreadyMember: true,
    })
  }

  await db.participant.create({
    data: {
      conversationId: conversation.id,
      userId: session.id,
      role: 'member',
    },
  })

  await db.message.create({
    data: {
      conversationId: conversation.id,
      senderId: session.id,
      content: `${session.name} joined via invite link`,
      type: 'system',
      status: 'read',
    },
  })

  // touch updatedAt so the conversation floats to the top of the sidebar
  await db.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  })

  return NextResponse.json({
    ok: true,
    conversationId: conversation.id,
    alreadyMember: false,
  })
}
