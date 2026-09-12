import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/messages/[id]/screenshot-attempts
// Returns the list of screenshot/copy/forward attempts recorded for this
// message. Only the SENDER of the message may read this audit trail.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const message = await db.message.findUnique({
    where: { id },
    select: { senderId: true },
  })
  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (message.senderId !== session.id) {
    return NextResponse.json(
      { error: 'Only the sender can view screenshot attempts' },
      { status: 403 }
    )
  }
  const attempts = await db.screenshotAttempt.findMany({
    where: { messageId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      reporter: {
        select: { id: true, name: true, username: true, avatar: true, avatarColor: true },
      },
    },
  })
  return NextResponse.json({
    attempts: attempts.map((a) => ({
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
  })
}
