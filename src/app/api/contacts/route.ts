import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/contacts — list my contacts (address book)
// Optional query: ?q=search to filter by name/username/phone
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim().toLowerCase()

  const contacts = await db.contact.findMany({
    where: { ownerId: session.id },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          phone: true,
          avatar: true,
          avatarColor: true,
          about: true,
          online: true,
          lastSeen: true,
          verified: true,
        },
      },
    },
    orderBy: { addedAt: 'desc' },
  })

  // Apply search filter in JS (across nickname + user fields + phone)
  const filtered = q
    ? contacts.filter((c) => {
        const nick = (c.nickname || '').toLowerCase()
        const name = (c.user?.name || '').toLowerCase()
        const username = (c.user?.username || '').toLowerCase()
        const phone = (c.phone || c.user?.phone || '').toLowerCase()
        return (
          nick.includes(q) ||
          name.includes(q) ||
          username.includes(q) ||
          phone.includes(q)
        )
      })
    : contacts

  return NextResponse.json({
    contacts: filtered.map((c) => ({
      id: c.id,
      userId: c.userId,
      nickname: c.nickname,
      phone: c.phone,
      notes: c.notes,
      addedAt: c.addedAt,
      // The resolved display name: nickname > user.name > phone
      name: c.nickname || c.user?.name || c.phone || 'Unknown',
      user: c.user
        ? {
            ...c.user,
          }
        : null,
    })),
  })
}

// POST /api/contacts — add a contact
// Body: { userId?, phone?, nickname?, notes? }
// Either userId or phone must be provided.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { userId, phone, nickname, notes } = body || {}

  if (!userId && !phone) {
    return NextResponse.json(
      { error: 'Either userId or phone is required' },
      { status: 400 }
    )
  }

  // If userId is provided, verify the user exists and isn't already a contact
  if (userId) {
    const existing = await db.contact.findUnique({
      where: {
        ownerId_userId: { ownerId: session.id, userId },
      },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Already in your contacts', contact: existing },
        { status: 409 }
      )
    }
  }

  const contact = await db.contact.create({
    data: {
      ownerId: session.id,
      userId: userId || null,
      phone: phone || null,
      nickname: nickname || null,
      notes: notes || null,
    },
  })

  return NextResponse.json({ ok: true, id: contact.id })
}
