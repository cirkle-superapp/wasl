import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// POST /api/devices/revoke-all — sign out EVERY device except the current one
//
// The current device is identified by the X-Device-Id header (sent by the
// client from localStorage). All other devices are marked offline + their
// device session rows are deleted. This effectively signs the user out
// everywhere except this browser/tab.
//
// Use case: user lost their phone → opens Wasl on web → clicks "Sign out
// everywhere" → all other device sessions are revoked.
// ═══════════════════════════════════════════════════════════════════════
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get the current device's ID from the custom header (so we don't revoke it)
  const currentDeviceId = req.headers.get('x-device-id') || null

  // Find all the user's devices
  const allDevices = await db.deviceSession.findMany({
    where: { userId: session.id },
    select: { id: true, deviceId: true },
  })

  // Revoke everything except the current device (if specified)
  const toRevoke = allDevices.filter((d) => d.deviceId !== currentDeviceId)
  if (toRevoke.length === 0) {
    return NextResponse.json({ ok: true, revokedCount: 0, message: 'No other devices to revoke' })
  }

  // Delete the other device sessions
  await db.deviceSession.deleteMany({
    where: {
      userId: session.id,
      id: { in: toRevoke.map((d) => d.id) },
    },
  })

  return NextResponse.json({
    ok: true,
    revokedCount: toRevoke.length,
    remainingCount: allDevices.length - toRevoke.length,
  })
}
