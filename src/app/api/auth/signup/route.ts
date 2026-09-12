import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'
import { rateLimit, getClientIP } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'

export const runtime = 'nodejs'

// Detect what kind of identifier the user typed.
// - email: contains '@'
// - phone: starts with '+' or is all digits (with optional spaces/dashes)
// - username: otherwise
function detectIdentifierType(value: string): 'email' | 'phone' | 'username' {
  const v = value.trim()
  if (v.includes('@')) return 'email'
  if (/^\+?[\d\s-]+$/.test(v) && v.replace(/[\s-]/g, '').length >= 8) return 'phone'
  return 'username'
}

// Generate Cirkle username suggestions from a base name.
async function generateSuggestions(base: string): Promise<string[]> {
  const clean = base.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15) || 'user'
  const candidates = [
    clean,
    `${clean}_1`,
    `${clean}_2`,
    `${clean}1`,
    `${clean}2`,
    `${clean}_cirkle`,
    `${clean}_wasl`,
    `${clean}99`,
    `${clean}_007`,
  ]
  const suggestions: string[] = []
  for (const c of candidates) {
    if (c.length < 3) continue
    const taken = await db.user.findUnique({ where: { username: c } })
    if (!taken && !suggestions.includes(c)) {
      suggestions.push(c)
    }
    if (suggestions.length >= 5) break
  }
  return suggestions
}

// POST /api/auth/signup
// Body: { identifier, password, name, username?, phone?, email? }
// - identifier: what the user typed (email / phone / username)
// - username: the chosen Cirkle username (auto-suggested if not provided)
// - name: display name
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 signups per IP per 60s
    const ip = getClientIP(req)
    const rl = rateLimit(`signup:${ip}`, 5, 60_000)
    if (!rl.allowed) {
      const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000)
      return NextResponse.json(
        { error: `Too many signups. Try again in ${retryAfter}s.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    const body = await req.json()
    const { identifier, password, name, username, phone, email } = body || {}
    const safePassword = typeof password === 'string' ? password : ''
    const safeName = typeof name === 'string' ? name.trim() : ''

    if (safePassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }
    if (safeName.length < 2) {
      return NextResponse.json(
        { error: 'Name must be at least 2 characters' },
        { status: 400 }
      )
    }

    // Detect what the identifier is, and extract email/phone
    const safeIdentifier = typeof identifier === 'string' ? identifier.trim() : ''
    let resolvedEmail: string | null = null
    let resolvedPhone: string | null = null
    if (safeIdentifier) {
      const type = detectIdentifierType(safeIdentifier)
      if (type === 'email') resolvedEmail = safeIdentifier.toLowerCase()
      else if (type === 'phone') resolvedPhone = safeIdentifier
    }
    // Explicit overrides
    if (typeof email === 'string' && email.trim()) resolvedEmail = email.trim().toLowerCase()
    if (typeof phone === 'string' && phone.trim()) resolvedPhone = phone.trim()

    // Resolve the Cirkle username
    let safeUsername = typeof username === 'string' ? username.trim().toLowerCase() : ''
    if (!safeUsername) {
      // Auto-generate from the name
      const suggestions = await generateSuggestions(safeName.replace(/\s+/g, '_'))
      if (suggestions.length === 0) {
        return NextResponse.json(
          { error: 'Could not generate a username. Please choose one manually.' },
          { status: 400 }
        )
      }
      safeUsername = suggestions[0]
    }
    if (!/^[a-z0-9_]+$/.test(safeUsername) || safeUsername.length < 3) {
      return NextResponse.json(
        { error: 'Username must be 3+ lowercase letters, numbers, or underscores' },
        { status: 400 }
      )
    }

    // Check username uniqueness
    const existingUser = await db.user.findUnique({ where: { username: safeUsername } })
    if (existingUser) {
      const suggestions = await generateSuggestions(safeUsername)
      return NextResponse.json(
        {
          error: 'This username is already taken',
          suggestions,
        },
        { status: 409 }
      )
    }
    // Check email uniqueness
    if (resolvedEmail) {
      const existingEmail = await db.user.findUnique({ where: { email: resolvedEmail } })
      if (existingEmail) {
        return NextResponse.json(
          { error: 'This email is already registered' },
          { status: 409 }
        )
      }
    }
    // Check phone uniqueness (only if it's set as User.phone, not in PhoneNumber table)
    if (resolvedPhone) {
      const existingPhone = await db.user.findFirst({ where: { phone: resolvedPhone } })
      if (existingPhone) {
        return NextResponse.json(
          { error: 'This phone number is already registered' },
          { status: 409 }
        )
      }
    }

    const hashedPassword = await bcrypt.hash(safePassword, 10)
    const user = await db.user.create({
      data: {
        username: safeUsername,
        password: hashedPassword,
        name: safeName,
        email: resolvedEmail,
        phone: resolvedPhone,
        avatarColor: pickAvatarColor(safeUsername),
      },
    })

    // If a phone was provided, create the first PhoneNumber record as active
    if (resolvedPhone) {
      await db.phoneNumber.create({
        data: {
          userId: user.id,
          number: resolvedPhone,
          label: 'Primary',
          active: true,
        },
      })
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
      defaultProtectMessages: user.defaultProtectMessages,
      privacyAlwaysAllow: user.privacyAlwaysAllow,
    })
  } catch (err) {
    console.error('[auth/signup] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
