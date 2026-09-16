import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/service-providers/announcements
// Returns official announcements for the current user based on their
// phone country code. Only shows messages from approved providers.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's phone to determine country code
  const user = await db.user.findUnique({
    where: { id: session.id },
    select: { phone: true },
  })
  if (!user?.phone) {
    return NextResponse.json({ announcements: [] })
  }

  // Extract country code (e.g. "+20" from "+201001234567")
  const countryCode = user.phone.slice(0, 3) // +20, +97, etc.

  // Fetch announcements from approved providers matching this country code
  const announcements = await db.serviceProviderMessage.findMany({
    where: {
      countryCode,
      provider: {
        verified: true,
        canBroadcast: true,
      },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 50,
    include: {
      provider: {
        select: {
          id: true,
          name: true,
          type: true,
          avatarPath: true,
          avatarColor: true,
          verified: true,
        },
      },
    },
  })

  // Mark which ones the user has read
  const readRecords = await db.serviceProviderMessageRead.findMany({
    where: { userId: session.id, messageId: { in: announcements.map(a => a.id) } },
    select: { messageId: true },
  })
  const readIds = new Set(readRecords.map(r => r.messageId))

  // Mark which ones the user has dismissed
  const dismissedRecords = await db.serviceProviderMessageDismissed.findMany({
    where: { userId: session.id, messageId: { in: announcements.map(a => a.id) } },
    select: { messageId: true },
  })
  const dismissedIds = new Set(dismissedRecords.map(r => r.messageId))

  return NextResponse.json({
    announcements: announcements.map(a => ({
      id: a.id,
      title: a.title,
      content: a.content,
      type: a.type,
      imagePath: a.imagePath,
      priority: a.priority,
      createdAt: a.createdAt,
      read: readIds.has(a.id),
      dismissed: dismissedIds.has(a.id),
      provider: {
        id: a.provider.id,
        name: a.provider.name,
        type: a.provider.type,
        avatarPath: a.provider.avatarPath,
        avatarColor: a.provider.avatarColor,
        verified: a.provider.verified,
      },
    })),
  })
}
