import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/folders — list my folders
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const folders = await db.chatFolder.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: 'asc' },
    include: { conversations: true },
  })
  return NextResponse.json({
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      icon: f.icon,
      conversationIds: f.conversations.map((c) => c.conversationId),
      createdAt: f.createdAt,
    })),
  })
}

// POST /api/folders — create a folder
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const { name, color, icon } = body || {}
  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }
  try {
    const folder = await db.chatFolder.create({
      data: {
        userId: session.id,
        name: String(name).trim().slice(0, 40),
        color: typeof color === 'string' ? color : null,
        icon: typeof icon === 'string' ? icon : null,
      },
    })
    return NextResponse.json({
      id: folder.id,
      name: folder.name,
      color: folder.color,
      icon: folder.icon,
      conversationIds: [],
      createdAt: folder.createdAt,
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: 'A folder with this name already exists' },
        { status: 409 }
      )
    }
    throw err
  }
}
