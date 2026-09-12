import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export const runtime = 'nodejs'

// GET — check if app lock is enabled
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const lock = await db.appLock.findUnique({ where: { userId: session.id } })
  return NextResponse.json({ enabled: lock?.enabled || false })
}

// POST — set up or verify app lock PIN
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { pin, action } = await req.json()
  
  if (action === 'setup') {
    if (!pin || pin.length < 4) return NextResponse.json({ error: 'PIN must be at least 4 digits' }, { status: 400 })
    const pinHash = await bcrypt.hash(pin, 10)
    await db.appLock.upsert({
      where: { userId: session.id },
      create: { userId: session.id, pinHash, enabled: true },
      update: { pinHash, enabled: true },
    })
    return NextResponse.json({ ok: true, enabled: true })
  }
  
  if (action === 'verify') {
    const lock = await db.appLock.findUnique({ where: { userId: session.id } })
    if (!lock) return NextResponse.json({ error: 'No lock set' }, { status: 404 })
    const valid = await bcrypt.compare(pin, lock.pinHash)
    if (!valid) return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
    return NextResponse.json({ ok: true, verified: true })
  }
  
  if (action === 'disable') {
    await db.appLock.update({
      where: { userId: session.id },
      data: { enabled: false },
    })
    return NextResponse.json({ ok: true, enabled: false })
  }
  
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
