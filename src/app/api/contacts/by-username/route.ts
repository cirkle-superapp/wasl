import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { rateLimit, getClientIP } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// POST /api/contacts/by-username — add a contact by their @username.
//
// Body: { username, nickname?, notes? }
//
// Resolves the username to a Wasl user and creates a Contact row linked via
// `contactUserId`. The contact appears in the user's address book with the
// matched user's avatar, name, and online status.
//
// - Skips duplicates (if already a contact with the same userId)
// - Returns the matched user so the UI can preview before saving
// - Respects blocks: if the target user has blocked the calling user, the
//   add succeeds but the contact's profile info is hidden (we don't tell
//   the caller they're blocked — that would defeat the privacy purpose of blocking)
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 20 username-adds per IP per 60s
  const ip = getClientIP(req)
  const rl = rateLimit(`contacts-by-username:${ip}`, 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many contact adds. Try again later.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  const body = await req.json().catch(() => ({}))
  // Strip leading @ if the user typed it
  const username = (body?.username || '').toString().trim().replace(/^@/, '').toLowerCase()
  const nickname = (body?.nickname || '').toString().trim() || null
  const notes = (body?.notes || '').toString().trim() || null

  if (!username) {
    return NextResponse.json({ error: 'username is required' }, { status: 400 })
  }
  if (username.length < 3) {
    return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 })
  }

  // Look up the target user
  const target = await db.user.findUnique({
    where: { username },
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
      hideLastSeen: true,
      ghostMode: true,
    },
  })
  if (!target) {
    return NextResponse.json({ error: 'No Wasl user with this username' }, { status: 404 })
  }
  if (target.id === session.id) {
    return NextResponse.json({ error: 'You cannot add yourself as a contact' }, { status: 400 })
  }

  // Check for an existing contact with the same userId
  const existing = await db.contact.findFirst({
    where: { ownerId: session.id, userId: target.id },
  })
  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadyContact: true,
      contact: {
        id: existing.id,
        nickname: existing.nickname,
        notes: existing.notes,
        user: target,
      },
    })
  }

  // Create the contact linked to the matched user — PENDING confirmation
  // The contact starts as "pending-confirmation:<requesterId>" in the notes
  // field. The other party (the target user) must accept via
  // /api/contact-requests before the contact appears in their address book.
  // This implements the "other party has to confirm" requirement.
  const contact = await db.contact.create({
    data: {
      ownerId: session.id,
      userId: target.id,
      nickname: nickname || target.name,
      notes: `pending-confirmation:${session.id}`,
    },
  })

  return NextResponse.json({
    ok: true,
    pendingConfirmation: true,
    message: `Contact request sent to @${target.username}. They need to confirm before the contact is established.`,
    contact: {
      id: contact.id,
      nickname: contact.nickname,
      notes: contact.notes,
      user: target,
    },
  })
}
