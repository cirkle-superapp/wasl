import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// GET /api/vault/entries — list encrypted vault entries (no decryption)
//
// The client fetches all entries, then decrypts them with the user-derived
// key. The server never sees the plaintext.
// ═══════════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const includeExpired = searchParams.get('includeExpired') === 'true'

  const where: any = { userId: session.id }
  if (!includeExpired) {
    where.OR = [
      { expiresAt: null },
      { expiresAt: { gte: new Date() } },
    ]
  }

  const entries = await db.vaultEntry.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      titleCipher: true,
      contentCipher: true,
      categoryCipher: true,
      tagsCipher: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
      accessedAt: true,
    },
  })

  return NextResponse.json({ entries })
}
