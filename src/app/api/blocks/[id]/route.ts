import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// DELETE /api/blocks/[id] — unblock a user.
// The [id] URL param can be either the Block row id OR the blocked user's id
// (we accept both for convenience — the front-end only has the user id).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Try by block row id first
  let block = await db.block.findUnique({ where: { id } })
  // Otherwise look up by (blockerId=self, blockedId=id)
  if (!block) {
    block = await db.block.findUnique({
      where: { blockerId_blockedId: { blockerId: session.id, blockedId: id } },
    })
  }
  if (!block || block.blockerId !== session.id) {
    return NextResponse.json({ error: 'Block record not found' }, { status: 404 })
  }

  await db.block.delete({ where: { id: block.id } })

  return NextResponse.json({ ok: true, unblockedUserId: block.blockedId })
}
