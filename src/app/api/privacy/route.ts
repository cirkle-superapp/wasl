import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/privacy — return the current user's privacy / message-protection
// settings.
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = await db.user.findUnique({
    where: { id: session.id },
    select: {
      defaultProtectMessages: true,
      privacyAlwaysAllow: true,
    },
  })
  if (!user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({
    defaultProtectMessages: user.defaultProtectMessages,
    privacyAlwaysAllow: user.privacyAlwaysAllow,
  })
}

// PATCH /api/privacy — update the current user's privacy settings.
// Body: { defaultProtectMessages?, privacyAlwaysAllow?, ghostMode?, hideLastSeen? }
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const data: any = {}
  if (typeof body?.defaultProtectMessages === 'boolean') {
    data.defaultProtectMessages = body.defaultProtectMessages
  }
  if (typeof body?.privacyAlwaysAllow === 'boolean') {
    data.privacyAlwaysAllow = body.privacyAlwaysAllow
  }
  if (typeof body?.ghostMode === 'boolean') {
    data.ghostMode = body.ghostMode
  }
  if (typeof body?.hideLastSeen === 'boolean') {
    data.hideLastSeen = body.hideLastSeen
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }
  const updated = await db.user.update({
    where: { id: session.id },
    data,
    select: {
      id: true,
      defaultProtectMessages: true,
      privacyAlwaysAllow: true,
      ghostMode: true,
      hideLastSeen: true,
    },
  })
  return NextResponse.json({
    defaultProtectMessages: updated.defaultProtectMessages,
    privacyAlwaysAllow: updated.privacyAlwaysAllow,
    ghostMode: updated.ghostMode,
    hideLastSeen: updated.hideLastSeen,
  })
}
