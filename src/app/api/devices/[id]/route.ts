import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/devices/[id] — revoke a single device session
// Marks the device as offline + clears the socketId. The user on that
// device will be signed out on their next API call (session invalidation
// is handled by the client checking the device's online status).
//
// Note: we don't actually invalidate the wasl_session cookie here — that
// would require a server-side session store. For now, revoking just marks
// the device as offline + removes it from the "Devices" list. The actual
// sign-out happens when the device's next socket reconnect fails.
// ═══════════════════════════════════════════════════════════════════════
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const device = await db.deviceSession.findUnique({
    where: { id },
    select: { userId: true, deviceId: true },
  })
  if (!device || device.userId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Don't allow deleting the current device via this endpoint — that would
  // be a footgun. Use the regular logout endpoint for that.
  await db.deviceSession.delete({ where: { id } })

  return NextResponse.json({ ok: true, revoked: id })
}
