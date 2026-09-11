import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone, name } = body || {}
    if (!phone) {
      return NextResponse.json({ error: 'Phone is required' }, { status: 400 })
    }
    const trimmedPhone = String(phone).trim()
    const user = await db.user.findUnique({ where: { phone: trimmedPhone } })
    if (!user) {
      return NextResponse.json(
        { error: 'No account found for this phone number. Please sign up.' },
        { status: 404 }
      )
    }
    if (name && String(name).trim() !== user.name) {
      await db.user.update({
        where: { id: user.id },
        data: { name: String(name).trim() },
      })
    }
    await setSession(user.id)
    return NextResponse.json({
      id: user.id,
      phone: user.phone,
      name: user.name,
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
