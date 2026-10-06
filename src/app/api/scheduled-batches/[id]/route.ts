import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// GET /api/scheduled-batches/[id] — get batch details
// ═══════════════════════════════════════════════════════════════════════
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const batch = await db.scheduledBatch.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { order: 'asc' } },
      recipients: { orderBy: { id: 'asc' } },
    },
  })
  if (!batch || batch.userId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ batch })
}

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/scheduled-batches/[id] — cancel a pending batch
// Already-processed batches can also be deleted (cleans up history).
// ═══════════════════════════════════════════════════════════════════════
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const batch = await db.scheduledBatch.findUnique({
    where: { id },
    select: { userId: true, status: true },
  })
  if (!batch || batch.userId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (batch.status === 'processing') {
    return NextResponse.json({ error: 'Batch is currently being processed — try again in a moment' }, { status: 409 })
  }

  await db.scheduledBatch.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
