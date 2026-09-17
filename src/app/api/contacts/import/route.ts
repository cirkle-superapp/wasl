import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// Hard cap to prevent abuse — matches the documented contract.
const MAX_CONTACTS_PER_IMPORT = 100

type ImportContactInput = {
  phone: string
  nickname?: string
  notes?: string
}

type PreviewRow = {
  phone: string
  nickname: string
  notes: string
  status: 'new' | 'matched' | 'duplicate'
  matchedUser: { name: string; username: string } | null
}

// Normalize a phone number for storage/lookup: trim, strip spaces, dashes,
// parentheses. We deliberately do NOT do full international normalization
// (e.g. 00 → +) because Wasl stores the user's active phone verbatim and we
// want exact matches only — false positives would silently link a contact to
// the wrong Wasl user.
function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s\-()]/g, '')
}

// POST /api/contacts/import — bulk import contacts.
//
// Body: { contacts: Array<{ phone, nickname?, notes? }> }
//   - phone is required for every contact
//   - For each contact: lookup a Wasl user with that phone; if found, set
//     userId on the new Contact row.
//   - Skip duplicates (already a contact) — does NOT error.
//   - Hard cap of MAX_CONTACTS_PER_IMPORT rows per request.
//
// Query: ?preview=1 → return per-phone status without creating anything.
// Useful for showing the user a "New / Matched / Duplicate" preview table
// before they commit to the import.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const rawContacts: ImportContactInput[] = Array.isArray(body?.contacts)
    ? body.contacts
    : []

  if (rawContacts.length === 0) {
    return NextResponse.json({ error: 'No contacts to import' }, { status: 400 })
  }

  if (rawContacts.length > MAX_CONTACTS_PER_IMPORT) {
    return NextResponse.json(
      {
        error: `Too many contacts. Maximum is ${MAX_CONTACTS_PER_IMPORT} per import.`,
      },
      { status: 400 }
    )
  }

  // Normalize + drop empties. Keep duplicates-in-list for the preview path
  // so we can show the user "Duplicate" for repeated phones.
  const normalized: ImportContactInput[] = []
  for (const c of rawContacts) {
    const phone = normalizePhone(typeof c?.phone === 'string' ? c.phone : '')
    if (!phone) continue
    normalized.push({
      phone,
      nickname:
        typeof c?.nickname === 'string' && c.nickname.trim()
          ? c.nickname.trim()
          : undefined,
      notes:
        typeof c?.notes === 'string' && c.notes.trim()
          ? c.notes.trim()
          : undefined,
    })
  }

  if (normalized.length === 0) {
    return NextResponse.json({ error: 'No valid phone numbers' }, { status: 400 })
  }

  const phoneSet = new Set(normalized.map((c) => c.phone))

  // Lookup Wasl users whose active phone matches any of the imported phones.
  // `User.phone` is unique-ish (one active number per user) but not enforced
  // at the DB level, so we still treat it as a 1:many map.
  const matchedUsers = await db.user.findMany({
    where: { phone: { in: Array.from(phoneSet) } },
    select: { id: true, phone: true, name: true, username: true },
  })
  const phoneToUser = new Map<
    string,
    { id: string; name: string; username: string }
  >()
  for (const u of matchedUsers) {
    if (!u.phone) continue
    // First-wins if two Wasl users somehow share a stored phone (shouldn't
    // happen, but be defensive).
    if (!phoneToUser.has(u.phone)) {
      phoneToUser.set(u.phone, {
        id: u.id,
        name: u.name,
        username: u.username,
      })
    }
  }

  const matchedUserIds = matchedUsers.map((u) => u.id)

  // Lookup existing contact rows for the current owner that match either the
  // imported phone OR a matched Wasl userId. Used both to skip duplicates on
  // import and to mark "Duplicate" in the preview.
  const existingContacts = await db.contact.findMany({
    where: {
      ownerId: session.id,
      OR: [
        { phone: { in: Array.from(phoneSet) } },
        ...(matchedUserIds.length > 0
          ? [{ userId: { in: matchedUserIds } }]
          : []),
      ],
    },
    select: { phone: true, userId: true },
  })
  const existingPhones = new Set<string>()
  const existingUserIds = new Set<string>()
  for (const c of existingContacts) {
    if (c.phone) existingPhones.add(c.phone)
    if (c.userId) existingUserIds.add(c.userId)
  }

  // ---- Preview path ---------------------------------------------------------
  //
  // Returns one row per input contact (NOT deduped — duplicates within the
  // paste/CSV are flagged as 'duplicate'). The client uses this to render
  // the preview table before committing.
  const isPreview =
    new URL(req.url).searchParams.get('preview') === '1'
  if (isPreview) {
    const seenInList = new Set<string>()
    const results: PreviewRow[] = normalized.map((c) => {
      const user = phoneToUser.get(c.phone) ?? null
      const isExistingContact =
        (user ? existingUserIds.has(user.id) : false) ||
        existingPhones.has(c.phone)
      const isListDuplicate = seenInList.has(c.phone)
      seenInList.add(c.phone)

      let status: PreviewRow['status']
      if (isExistingContact || isListDuplicate) {
        status = 'duplicate'
      } else if (user) {
        status = 'matched'
      } else {
        status = 'new'
      }

      return {
        phone: c.phone,
        nickname: c.nickname ?? '',
        notes: c.notes ?? '',
        status,
        matchedUser: user
          ? { name: user.name, username: user.username }
          : null,
      }
    })

    return NextResponse.json({ results })
  }

  // ---- Import path ----------------------------------------------------------
  //
  // Dedupe the input list first (keep first occurrence) so a single paste
  // error doesn't create twice. Then create per-row, skipping any contact
  // that already exists. We don't use Prisma's `upsert` directly because we
  // have two distinct uniqueness dimensions: `ownerId+userId` (the @@unique)
  // and `ownerId+phone` (no constraint, but still want to dedupe by phone for
  // non-Wasl contacts).
  const seenImportPhones = new Set<string>()
  const unique: ImportContactInput[] = []
  for (const c of normalized) {
    if (seenImportPhones.has(c.phone)) continue
    seenImportPhones.add(c.phone)
    unique.push(c)
  }

  let imported = 0
  let skipped = 0
  let matched = 0

  for (const c of unique) {
    const user = phoneToUser.get(c.phone) ?? null

    if (user) {
      // Already a contact via userId? Skip.
      if (existingUserIds.has(user.id)) {
        skipped++
        continue
      }
      await db.contact.create({
        data: {
          ownerId: session.id,
          userId: user.id,
          phone: c.phone,
          nickname: c.nickname ?? null,
          notes: c.notes ?? null,
        },
      })
      imported++
      matched++
      continue
    }

    // No matching Wasl user — fall back to phone-only dedupe.
    if (existingPhones.has(c.phone)) {
      skipped++
      continue
    }
    await db.contact.create({
      data: {
        ownerId: session.id,
        userId: null,
        phone: c.phone,
        nickname: c.nickname ?? null,
        notes: c.notes ?? null,
      },
    })
    imported++
  }

  return NextResponse.json({ imported, skipped, matched })
}
