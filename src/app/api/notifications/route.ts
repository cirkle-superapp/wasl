import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/notifications
// Aggregates the user's recent notifications from multiple sources into a
// single, time-sorted feed. Sources:
//   1. Unread conversations (1-on-1 + groups) with their last message preview
//   2. Unread service-provider announcements (Government · Banks · Utilities)
//   3. Unread broadcast channel messages
//   4. Scheduled messages due in the next 24h (so the user remembers)
//   5. New School Connect invitations / parent connections pending confirmation
//
// Each notification item has a uniform shape so the client UI can render them
// in a single list.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const items: any[] = []

  // ---- 1. Unread conversations ------------------------------------------
  // Pull all conversations the user participates in, then filter for ones
  // with unreadCount > 0. We avoid the conversation list API to skip the
  // extra HTTP hop — go straight to the DB.
  const myParticipations = await db.participant.findMany({
    where: { userId: session.id, archived: false },
    select: { conversationId: true, lastReadAt: true },
  })
  const convIds = myParticipations.map((p) => p.conversationId)
  if (convIds.length) {
    const conversations = await db.conversation.findMany({
      where: { id: { in: convIds } },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, username: true, avatarColor: true, avatar: true },
            },
          },
        },
        messages: {
          where: {
            senderId: { not: session.id },
            // Only messages after the user's lastReadAt for this conversation
            createdAt: { gt: myParticipations.find((p) => p.conversationId)?.lastReadAt || new Date(0) },
          },
          orderBy: { createdAt: 'asc' },
          take: 1, // just the latest unread
          select: { id: true, content: true, type: true, senderId: true, createdAt: true },
        },
      },
    })
    for (const conv of conversations) {
      // Count unread messages per conversation
      const myPart = myParticipations.find((p) => p.conversationId === conv.id)
      const unreadCount = await db.message.count({
        where: {
          conversationId: conv.id,
          senderId: { not: session.id },
          createdAt: { gt: myPart?.lastReadAt || new Date(0) },
        },
      })
      if (unreadCount === 0) continue
      const lastMsg = conv.messages[0]
      if (!lastMsg) continue
      const sender = conv.participants.find((p) => p.userId === lastMsg.senderId)?.user
      items.push({
        id: `unread-${conv.id}`,
        type: 'unread_message',
        at: lastMsg.createdAt,
        title: conv.isGroup ? conv.name : sender?.name || 'Someone',
        subtitle: conv.isGroup
          ? `${sender?.name || 'Someone'}: ${previewText(lastMsg.content, lastMsg.type)}`
          : previewText(lastMsg.content, lastMsg.type),
        conversationId: conv.id,
        unreadCount,
        avatarColor: conv.avatarColor || sender?.avatarColor || null,
        isGroup: conv.isGroup,
      })
    }
  }

  // ---- 2. Unread service-provider announcements --------------------------
  // Service-provider announcements target the user's country code. We mark
  // them as "read" once the user opens the announcements dialog.
  const myPhone = session.phone || ''
  const countryCode = myPhone.startsWith('+') ? myPhone.slice(0, 3) : '+20'
  const spMessages = await db.serviceProviderMessage.findMany({
    where: { countryCode },
    include: { provider: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  for (const spm of spMessages) {
    const read = await db.serviceProviderMessageRead.findUnique({
      where: { messageId_userId: { messageId: spm.id, userId: session.id } },
    })
    if (read) continue
    items.push({
      id: `sp-${spm.id}`,
      type: 'service_provider_announcement',
      at: spm.createdAt,
      title: spm.provider.name,
      subtitle: spm.title,
      providerType: spm.provider.type,
      priority: spm.priority,
      avatarColor: spm.provider.avatarColor,
    })
  }

  // ---- 3. Scheduled messages due in the next 24h ------------------------
  const upcomingScheduled = await db.scheduledMessage.findMany({
    where: {
      senderId: session.id,
      sent: false,
      scheduledFor: {
        gte: now,
        lte: new Date(now.getTime() + 24 * 60 * 60_000),
      },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 5,
  })
  for (const sm of upcomingScheduled) {
    items.push({
      id: `sched-${sm.id}`,
      type: 'scheduled_due',
      at: sm.scheduledFor,
      title: 'Scheduled message due',
      subtitle: previewText(sm.content, sm.type),
      conversationId: sm.conversationId,
      whenLabel: formatRelative(sm.scheduledFor, now),
    })
  }

  // ---- 4. Pending School Connect parent connections ---------------------
  // (When a parent connected to a student using the join code — these are
  // auto-confirmed in our flow, but we surface them as "new connection"
  // notifications so the school admin sees activity.)
  const ownedSchools = await db.school.findMany({
    where: { ownerId: session.id },
    select: { id: true, name: true, logoColor: true },
  })
  if (ownedSchools.length) {
    const schoolIds = ownedSchools.map((s) => s.id)
    // New connections created in the last 24h
    const recentConnections = await db.schoolParentConnection.findMany({
      where: {
        schoolStudent: { schoolId: { in: schoolIds } },
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
      },
      include: {
        schoolStudent: { select: { fullName: true, studentId: true, school: { select: { name: true, logoColor: true } } } },
        parent: { select: { name: true, username: true, avatarColor: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    for (const pc of recentConnections) {
      items.push({
        id: `school-conn-${pc.id}`,
        type: 'school_connect',
        at: pc.createdAt,
        title: `${pc.parent.name} connected to ${pc.schoolStudent.fullName}`,
        subtitle: `${pc.schoolStudent.school.name} · ${pc.schoolStudent.studentId} · ${pc.relationship}`,
        avatarColor: pc.parent.avatarColor,
      })
    }
  }

  // Sort all items by time descending
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return NextResponse.json({
    items,
    unreadCount: items.filter((i) => i.type === 'unread_message').reduce((sum, i) => sum + (i.unreadCount || 0), 0),
    totalCount: items.length,
  })
}

function previewText(content: string, type: string): string {
  if (type === 'image') return '📷 Photo'
  if (type === 'voice') return '🎙️ Voice message'
  if (type === 'commit') return '📝 Verified agreement'
  if (type === 'poll') return '📊 Poll'
  if (type === 'system') return content
  return content.slice(0, 100)
}

function formatRelative(date: Date, now: Date): string {
  const diffMs = date.getTime() - now.getTime()
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 60) return `in ${diffMin} min`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `in ${diffHr} hr`
  const diffDay = Math.round(diffHr / 24)
  return `in ${diffDay} day${diffDay > 1 ? 's' : ''}`
}
