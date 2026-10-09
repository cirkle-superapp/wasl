import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// GET /api/devices — list the current user's device sessions
// Returns both online (currently connected) + offline (recent history)
// ═══════════════════════════════════════════════════════════════════════
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const devices = await db.deviceSession.findMany({
    where: { userId: session.id },
    orderBy: { lastSeenAt: 'desc' },
    take: 50,
    select: {
      id: true,
      deviceId: true,
      deviceName: true,
      userAgent: true,
      ip: true,
      online: true,
      lastSeenAt: true,
      createdAt: true,
      isPWA: true,
    },
  })

  // Mark the current device (by checking the deviceId cookie/header)
  // The current device's deviceId is sent via the X-Device-Id header by
  // the client (set from localStorage on app boot).
  return NextResponse.json({ devices })
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/devices — register or update a device session
// Called when the app boots up (web OR mobile PWA) to register the device
// for multi-device sync + cross-device visibility.
//
// Body: { deviceId, deviceName, userAgent?, isPWA? }
// Returns: { id, online }
// ═══════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { deviceId, deviceName, isPWA } = body

  if (typeof deviceId !== 'string' || deviceId.length < 4 || deviceId.length > 200) {
    return NextResponse.json({ error: 'deviceId is required (4-200 chars)' }, { status: 400 })
  }
  if (typeof deviceName !== 'string' || !deviceName.trim()) {
    return NextResponse.json({ error: 'deviceName is required' }, { status: 400 })
  }

  const userAgent = req.headers.get('user-agent') || null
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null

  // Upsert by (userId, deviceId) — if this device already exists, update its
  // metadata + lastSeenAt + mark online. Otherwise, create a new row.
  const device = await db.deviceSession.upsert({
    where: {
      userId_deviceId: {
        userId: session.id,
        deviceId: deviceId.slice(0, 200),
      },
    },
    update: {
      deviceName: String(deviceName).slice(0, 200),
      userAgent: userAgent ? userAgent.slice(0, 500) : null,
      ip,
      online: true,
      lastSeenAt: new Date(),
      isPWA: isPWA === true,
    },
    create: {
      userId: session.id,
      deviceId: deviceId.slice(0, 200),
      deviceName: String(deviceName).slice(0, 200),
      userAgent: userAgent ? userAgent.slice(0, 500) : null,
      ip,
      online: true,
      isPWA: isPWA === true,
    },
    select: {
      id: true,
      deviceId: true,
      deviceName: true,
      online: true,
      lastSeenAt: true,
      createdAt: true,
      isPWA: true,
    },
  })

  return NextResponse.json({ device })
}
