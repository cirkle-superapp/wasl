import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// DELETE /api/contacts/[id] — remove a contact
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Verify ownership before deleting
  const contact = await db.contact.findUnique({
    where: { id },
    select: { ownerId: true },
  })
  if (!contact) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (contact.ownerId !== session.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.contact.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
