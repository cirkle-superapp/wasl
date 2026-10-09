import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/vault/[id] — delete a vault entry (cryptographic erasure)
// ═══════════════════════════════════════════════════════════════════════
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const entry = await db.vaultEntry.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!entry || entry.userId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db.vaultEntry.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// ═══════════════════════════════════════════════════════════════════════
// PATCH /api/vault/[id] — update an entry (replace encrypted blobs)
// Used for editing + "touch" (update accessedAt).
// ═══════════════════════════════════════════════════════════════════════
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const entry = await db.vaultEntry.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!entry || entry.userId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const data: any = { accessedAt: new Date() }

  if (typeof body.titleCipher === 'string') data.titleCipher = body.titleCipher
  if (typeof body.contentCipher === 'string') data.contentCipher = body.contentCipher
  if (typeof body.categoryCipher === 'string') data.categoryCipher = body.categoryCipher
  if (typeof body.tagsCipher === 'string') data.tagsCipher = body.tagsCipher

  const updated = await db.vaultEntry.update({
    where: { id },
    data,
    select: {
      id: true,
      type: true,
      expiresAt: true,
      updatedAt: true,
      accessedAt: true,
    },
  })

  return NextResponse.json({ entry: updated })
}
