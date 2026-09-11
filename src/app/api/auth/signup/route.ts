import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'

export const runtime = 'nodejs'

// Sign up: register by phone + name
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone, name } = body || {}
    if (!phone || !name) {
      return NextResponse.json(
        { error: 'Phone and name are required' },
        { status: 400 }
      )
    }
    const trimmedPhone = String(phone).trim()
    const trimmedName = String(name).trim()
    if (trimmedName.length < 2) {
      return NextResponse.json(
        { error: 'Name must be at least 2 characters' },
        { status: 400 }
      )
    }

    // If phone already exists, treat as login
    let user = await db.user.findUnique({ where: { phone: trimmedPhone } })
    if (!user) {
      user = await db.user.create({
        data: {
          phone: trimmedPhone,
          name: trimmedName,
          avatarColor: pickAvatarColor(trimmedPhone),
        },
      })
    } else {
      // Update name if changed
      if (user.name !== trimmedName) {
        user = await db.user.update({
          where: { id: user.id },
          data: { name: trimmedName },
        })
      }
    }

    await setSession(user.id)
    return NextResponse.json({
      id: user.id,
      phone: user.phone,
      name: user.name,
      avatar: user.avatar,
      avatarColor: user.avatarColor,
      about: user.about,
    })
  } catch (err) {
    console.error('[auth/signup] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
