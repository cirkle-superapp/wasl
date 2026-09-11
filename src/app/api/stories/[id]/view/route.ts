import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/stories/[id]/view — mark a story as viewed by me
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const story = await db.story.findUnique({ where: { id } })
  if (!story) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  // Upsert view (ignore if already exists)
  const existing = await db.storyView.findUnique({
    where: { storyId_userId: { storyId: id, userId: session.id } },
  })
  if (!existing) {
    await db.storyView.create({
      data: { storyId: id, userId: session.id },
    })
  }
  return NextResponse.json({ ok: true })
}
