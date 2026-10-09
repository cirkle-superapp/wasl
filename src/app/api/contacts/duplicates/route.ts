import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import {
  findDuplicates,
  groupDuplicates,
  type ContactForDedup,
} from '@/lib/dedup'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// GET /api/contacts/duplicates — find duplicate contact pairs
//
// Runs the from-scratch fuzzy-matching algorithm (Jaro-Winkler on names,
// E.164 phone normalization, exact username match) against all of the
// user's contacts. Returns grouped duplicate sets with similarity scores.
// ═══════════════════════════════════════════════════════════════════════
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pull all contacts + their linked Wasl user info. The Contact→User
  // relation is named `user` (named via @relation("ContactTarget")).
  const contacts = await db.contact.findMany({
    where: { ownerId: session.id },
    include: {
      user: {
        select: { id: true, username: true, name: true },
      },
    },
  })

  // Build the dedup input. The Contact schema has `nickname` (the saved
  // display name) and optionally `userId` (the linked Wasl account). We
  // fall back to the linked user's name if nickname is missing.
  const dedupInput: ContactForDedup[] = contacts.map((c) => ({
    id: c.id,
    name: c.nickname || c.user?.name || '',
    phone: c.phone,
    username: c.user?.username ?? null,
    userId: c.userId ?? null,
  }))

  // Find duplicates (threshold = 0.85)
  const pairs = findDuplicates(dedupInput, 0.85)

  // Group into connected components
  const groups = groupDuplicates(pairs)

  return NextResponse.json({
    totalContacts: contacts.length,
    duplicatePairs: pairs.length,
    duplicateGroups: groups.length,
    groups: groups.map((g) => ({
      contacts: g,
      // Find the best pair score in this group for display
      bestScore: Math.max(
        ...pairs
          .filter((p) => g.some((c) => c.id === p.contactA.id) && g.some((c) => c.id === p.contactB.id))
          .map((p) => p.score),
        0,
      ),
    })),
    pairs: pairs.map((p) => ({
      contactA: p.contactA,
      contactB: p.contactB,
      score: p.score,
      signals: p.signals,
      primarySignal: p.primarySignal,
    })),
  })
}
