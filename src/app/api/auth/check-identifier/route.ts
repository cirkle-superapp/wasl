import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, getClientIP } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// Detect what kind of identifier the user typed (same rules as login/signup).
function detectIdentifierType(value: string): 'email' | 'phone' | 'username' {
  const v = value.trim()
  if (v.includes('@')) return 'email'
  if (/^\+?[\d\s-]+$/.test(v) && v.replace(/[\s-]/g, '').length >= 8) return 'phone'
  return 'username'
}

// GET /api/auth/check-identifier?id=...
//
// Adaptive one-tab auth lookup: does an account already exist for this
// email / phone / Cirkle username? The client uses the answer to route
// the user to the login step (exists) or the signup step (new identifier).
//
// Returns: { type, exists, firstName }
//   - type: what the identifier was detected as
//   - exists: whether an account matches it
//   - firstName: the account's first name (powers "Welcome back, X")
export async function GET(req: NextRequest) {
  // Rate limit: 20 lookups per IP per 60s — this endpoint discloses account
  // existence (and a first name), so it needs a tighter leash than pages.
  const ip = getClientIP(req)
  const rl = rateLimit(`checkid:${ip}`, 20, 60_000)
  if (!rl.allowed) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000)
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  const { searchParams } = new URL(req.url)
  const raw = (searchParams.get('id') || '').trim()
  if (!raw) {
    return NextResponse.json(
      { error: 'Enter an email, phone number, or username' },
      { status: 400 }
    )
  }

  const type = detectIdentifierType(raw)

  // Format sanity — don't hit the DB for clearly invalid input.
  if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw)) {
    return NextResponse.json(
      { error: "That email address doesn't look right" },
      { status: 400 }
    )
  }

  let user: { name: string } | null = null
  if (type === 'email') {
    user = await db.user.findUnique({
      where: { email: raw.toLowerCase() },
      select: { name: true },
    })
  } else if (type === 'phone') {
    user = await db.user.findFirst({
      where: { phone: raw },
      select: { name: true },
    })
    if (!user) {
      // Same lenient matching as the login route: compare on digits only,
      // so "+20 100 123 4567" finds an account stored as "+201001234567".
      const digits = raw.replace(/\D/g, '')
      if (digits.length >= 8) {
        user = await db.user.findFirst({
          where: { phone: { contains: digits } },
          select: { name: true },
        })
      }
    }
  } else {
    user = await db.user.findUnique({
      where: { username: raw.toLowerCase() },
      select: { name: true },
    })
  }

  return NextResponse.json({
    type,
    exists: !!user,
    firstName: user ? user.name.split(' ')[0] : null,
  })
}
