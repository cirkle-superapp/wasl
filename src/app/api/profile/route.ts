import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// PATCH /api/profile - update current user profile (name, about, avatar, privacy)
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const { name, about, avatar, defaultProtectMessages, privacyAlwaysAllow } = body || {}
  const data: any = {}
  if (typeof name === 'string' && name.trim().length >= 2) {
    data.name = name.trim()
  }
  if (typeof about === 'string') {
    data.about = about.slice(0, 200)
  }
  if (typeof avatar === 'string') {
    data.avatar = avatar.slice(0, 10 * 1024) // max ~10KB data URL or text
  }
  // Privacy / message-protection settings
  if (typeof defaultProtectMessages === 'boolean') {
    data.defaultProtectMessages = defaultProtectMessages
  }
  if (typeof privacyAlwaysAllow === 'boolean') {
    data.privacyAlwaysAllow = privacyAlwaysAllow
  }
  const updated = await db.user.update({
    where: { id: session.id },
    data,
    select: {
      id: true,
      username: true,
      email: true,
      phone: true,
      name: true,
      avatar: true,
      avatarColor: true,
      about: true,
      verified: true,
      defaultProtectMessages: true,
      privacyAlwaysAllow: true,
    },
  })
  return NextResponse.json({ user: updated })
}

// POST /api/profile/presence - mark online/offline
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const { online } = body || {}
  const updated = await db.user.update({
    where: { id: session.id },
    data: {
      online: !!online,
      lastSeen: new Date(),
    },
  })
  return NextResponse.json({ ok: true, online: updated.online })
}
