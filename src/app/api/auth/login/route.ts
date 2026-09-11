import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export const runtime = 'nodejs'

// POST /api/auth/login — login with username + password
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, password } = body || {}
    const safeUsername = typeof username === 'string' ? username.trim().toLowerCase() : ''
    const safePassword = typeof password === 'string' ? password : ''

    if (!safeUsername || !safePassword) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({
      where: { username: safeUsername },
    })
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      )
    }

    const valid = await bcrypt.compare(safePassword, user.password)
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      )
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
    console.error('[auth/login] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
