import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

const STORY_TTL_HOURS = 24

// GET /api/stories — list active stories from me + my contacts
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const now = new Date()
  // Find all users I have conversations with
  const myConvos = await db.participant.findMany({
    where: { userId: session.id },
    select: { conversation: { select: { participants: { select: { userId: true } } } } },
  })
  const contactIds = new Set<string>([session.id])
  for (const p of myConvos) {
    for (const cp of p.conversation.participants) {
      contactIds.add(cp.userId)
    }
  }
  const stories = await db.story.findMany({
    where: {
      userId: { in: Array.from(contactIds) },
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  })
  // Group by user
  const byUser = new Map<
    string,
    {
      userId: string
      stories: any[]
    }
  >()
  for (const s of stories) {
    const u = byUser.get(s.userId) || { userId: s.userId, stories: [] }
    u.stories.push({
      id: s.id,
      type: s.type,
      content: s.content,
      bgColor: s.bgColor,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    })
    byUser.set(s.userId, u)
  }
  // Fetch user info + my-view status for each
  const userIds = Array.from(byUser.keys())
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true,
      avatar: true,
      avatarColor: true,
    },
  })
  // Collect all story IDs so we can query StoryView efficiently (StoryView
  // has no direct relation to Story — only storyId FK).
  const allStoryIds: string[] = []
  for (const entry of byUser.values()) {
    for (const s of entry.stories) allStoryIds.push(s.id)
  }
  const myViews = await db.storyView.findMany({
    where: { userId: session.id, storyId: { in: allStoryIds } },
    select: { storyId: true },
  })
  const myViewedStoryIds = new Set(myViews.map((v) => v.storyId))
  const serialized = Array.from(byUser.values()).map((entry) => {
    const user = users.find((u) => u.id === entry.userId)
    return {
      userId: entry.userId,
      userName: user?.name || 'Unknown',
      userAvatar: user?.avatar || null,
      userAvatarColor: user?.avatarColor || '#c2a060',
      stories: entry.stories.map((s) => ({
        ...s,
        viewed: myViewedStoryIds.has(s.id),
      })),
    }
  })
  return NextResponse.json({ stories: serialized })
}

// POST /api/stories — create a story (text or image)
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const { type = 'text', content, bgColor } = body || {}
  if (!content || typeof content !== 'string') {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }
  if (type === 'image' && content.length > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image too large (max 2MB)' }, { status: 400 })
  }
  if (type === 'text' && content.length > 500) {
    return NextResponse.json({ error: 'Text too long (max 500 chars)' }, { status: 400 })
  }
  const now = new Date()
  const expiresAt = new Date(now.getTime() + STORY_TTL_HOURS * 60 * 60 * 1000)
  const story = await db.story.create({
    data: {
      userId: session.id,
      type: String(type),
      content: String(content),
      bgColor: bgColor || null,
      expiresAt,
    },
  })
  return NextResponse.json({
    id: story.id,
    type: story.type,
    content: story.content,
    bgColor: story.bgColor,
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
  })
}

// DELETE /api/stories — delete my story
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const storyId = searchParams.get('id')
  if (!storyId) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  const story = await db.story.findUnique({ where: { id: storyId } })
  if (!story || story.userId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  await db.story.delete({ where: { id: storyId } })
  return NextResponse.json({ ok: true })
}
