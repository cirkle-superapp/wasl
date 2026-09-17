import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// PATCH /api/bookmarks/[id]
// Body: { done?, note? }
//  - When `done` is set to true, also set doneAt = now()
//  - When `done` is set to false, clear doneAt
//  - When `note` is provided (string, possibly empty), update the note
// The bookmark must belong to the current user (no peeking at others).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  // Ensure the bookmark exists AND belongs to the current user.
  const existing = await db.bookmark.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.userId !== session.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const data: {
    done?: boolean
    doneAt?: Date | null
    note?: string | null
  } = {}

  if (typeof body.done === 'boolean') {
    data.done = body.done
    data.doneAt = body.done ? new Date() : null
  }

  if (typeof body.note === 'string') {
    const trimmed = body.note.trim()
    data.note = trimmed.length > 0 ? trimmed : null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'Nothing to update' },
      { status: 400 }
    )
  }

  const updated = await db.bookmark.update({
    where: { id },
    data,
    select: {
      id: true,
      note: true,
      done: true,
      doneAt: true,
    },
  })

  return NextResponse.json({ ok: true, bookmark: updated })
}

// DELETE /api/bookmarks/[id]
// Removes a bookmark. Must belong to the current user.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const existing = await db.bookmark.findUnique({
    where: { id },
    select: { userId: true, messageId: true },
  })
  if (!existing) {
    // Already gone — idempotent delete returns ok so the client can clean up.
    return NextResponse.json({ ok: true, deleted: false })
  }
  if (existing.userId !== session.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.bookmark.delete({ where: { id } })
  return NextResponse.json({ ok: true, deleted: true, messageId: existing.messageId })
}
