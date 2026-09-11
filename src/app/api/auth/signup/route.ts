import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'
import bcrypt from 'bcryptjs'

export const runtime = 'nodejs'

// POST /api/auth/signup — register with username + password + name
// Optional phone number is stored as the first (active) PhoneNumber.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, password, name, phone } = body || {}
    const safeUsername = typeof username === 'string' ? username.trim().toLowerCase() : ''
    const safePassword = typeof password === 'string' ? password : ''
    const safeName = typeof name === 'string' ? name.trim() : ''

    if (!safeUsername || safeUsername.length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters' },
        { status: 400 }
      )
    }
    if (!/^[a-z0-9_]+$/.test(safeUsername)) {
      return NextResponse.json(
        { error: 'Username can only contain lowercase letters, numbers, and underscores' },
        { status: 400 }
      )
    }
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

    // Check username uniqueness
    const existing = await db.user.findUnique({ where: { username: safeUsername } })
    if (existing) {
      return NextResponse.json(
        { error: 'This username is already taken' },
        { status: 409 }
      )
    }

    // Check phone uniqueness if provided
    const safePhone = typeof phone === 'string' && phone.trim() ? phone.trim() : null
    if (safePhone) {
      const existingPhone = await db.user.findFirst({ where: { phone: safePhone } })
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
        phone: safePhone,
        avatarColor: pickAvatarColor(safeUsername),
      },
    })

    // If a phone was provided, create the first PhoneNumber record as active
    if (safePhone) {
      await db.phoneNumber.create({
        data: {
          userId: user.id,
          number: safePhone,
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
      phone: user.phone,
      avatar: user.avatar,
      avatarColor: user.avatarColor,
      about: user.about,
      verified: user.verified,
    })
  } catch (err) {
    console.error('[auth/signup] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
