import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export const runtime = 'nodejs'

// Detect what kind of identifier the user typed.
function detectIdentifierType(value: string): 'email' | 'phone' | 'username' {
  const v = value.trim()
  if (v.includes('@')) return 'email'
  if (/^\+?[\d\s-]+$/.test(v) && v.replace(/[\s-]/g, '').length >= 8) return 'phone'
  return 'username'
}

// POST /api/auth/login
// Body: { identifier, password }
// identifier can be an email, phone number, or username.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { identifier, password } = body || {}
    const safeIdentifier = typeof identifier === 'string' ? identifier.trim() : ''
    const safePassword = typeof password === 'string' ? password : ''

    if (!safeIdentifier || !safePassword) {
      return NextResponse.json(
        { error: 'Please enter your email, phone, or username and your password' },
        { status: 400 }
      )
    }

    // Look up the user by the identifier type
    const type = detectIdentifierType(safeIdentifier)
    let user = null
    if (type === 'email') {
      user = await db.user.findUnique({
        where: { email: safeIdentifier.toLowerCase() },
      })
    } else if (type === 'phone') {
      // Phone may be stored with or without formatting; try exact match first,
      // then a "digits only" match.
      user = await db.user.findFirst({ where: { phone: safeIdentifier } })
      if (!user) {
        const digits = safeIdentifier.replace(/[\s-]/g, '')
        user = await db.user.findFirst({
          where: { phone: { contains: digits.replace(/^\+/, '') } },
        })
      }
    } else {
      // username
      user = await db.user.findUnique({
        where: { username: safeIdentifier.toLowerCase() },
      })
    }

    if (!user) {
      return NextResponse.json(
        { error: 'No account found with this email, phone, or username' },
        { status: 401 }
      )
    }

    const valid = await bcrypt.compare(safePassword, user.password)
    if (!valid) {
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 401 }
      )
    }

    await setSession(user.id)
    return NextResponse.json({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      avatarColor: user.avatarColor,
      about: user.about,
      verified: user.verified,
    })
  } catch (err) {
    console.error('[auth/login] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
