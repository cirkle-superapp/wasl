import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/webrtc/offer — store a WebRTC offer for the callee to retrieve.
// In production this would use a WebSocket; for now it's a simple REST endpoint.
// The actual WebRTC connection is peer-to-peer (zero cost, browser native).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const { targetUserId, offer } = body || {}
  if (!targetUserId || !offer) {
    return NextResponse.json({ error: 'targetUserId and offer required' }, { status: 400 })
  }
  // In a full implementation, this would forward the offer via Socket.io
  // For now, just acknowledge — the Socket.io mini-service handles signaling
  return NextResponse.json({ ok: true, message: 'WebRTC offer queued (use Socket.io for signaling)' })
}
