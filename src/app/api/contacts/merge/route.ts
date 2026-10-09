import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// POST /api/contacts/merge — merge two duplicate contacts into one
//
// Body: { primaryId: string, secondaryId: string }
//
// Algorithm:
//   1. Verify both contacts belong to the current user.
//   2. Copy any non-null fields from the secondary to the primary IF the
//      primary doesn't already have them (don't overwrite existing data).
//   3. Delete the secondary contact.
//   4. If the secondary had a linked userId (the contact was a Wasl user),
//      keep the link on the primary (if the primary doesn't already have one).
// ═══════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { primaryId, secondaryId } = await req.json().catch(() => ({}))
  if (!primaryId || !secondaryId || primaryId === secondaryId) {
    return NextResponse.json({ error: 'primaryId + secondaryId required (must differ)' }, { status: 400 })
  }

  const primary = await db.contact.findUnique({
    where: { id: primaryId },
    include: { user: true },
  })
  const secondary = await db.contact.findUnique({
    where: { id: secondaryId },
    include: { user: true },
  })

  if (!primary || primary.ownerId !== session.id) {
    return NextResponse.json({ error: 'Primary not found or not authorized' }, { status: 404 })
  }
  if (!secondary || secondary.ownerId !== session.id) {
    return NextResponse.json({ error: 'Secondary not found or not authorized' }, { status: 404 })
  }

  // Merge: copy non-null secondary fields into primary if primary's field is null
  // The Contact schema has: nickname, phone, notes, userId (no email/avatarColor).
  const merged = {
    nickname: primary.nickname || secondary.nickname,
    phone: primary.phone || secondary.phone,
    notes: primary.notes || secondary.notes,
    userId: primary.userId || secondary.userId,
  }

  await db.contact.update({
    where: { id: primaryId },
    data: merged,
  })

  await db.contact.delete({ where: { id: secondaryId } })

  return NextResponse.json({
    ok: true,
    mergedInto: primaryId,
    deleted: secondaryId,
  })
}
