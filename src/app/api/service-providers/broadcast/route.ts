import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/service-providers/broadcast
// Send an official announcement to all users within the provider's country.
// Only approved providers with canBroadcast=true can use this.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { providerId, title, content, type = 'announcement', imagePath, priority = 0 } = body || {}

  if (!providerId || !title || !content) {
    return NextResponse.json({ error: 'providerId, title, and content are required' }, { status: 400 })
  }

  // Verify the provider is approved and owned by the current user
  const provider = await db.serviceProvider.findUnique({
    where: { id: providerId },
  })
  if (!provider) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
  }
  if (provider.ownerId !== session.id) {
    return NextResponse.json({ error: 'You do not own this provider' }, { status: 403 })
  }
  if (!provider.verified || !provider.canBroadcast) {
    return NextResponse.json(
      { error: 'Your provider account is not yet approved for broadcasting. Please wait for admin review.' },
      { status: 403 }
    )
  }

  // Create the broadcast message
  const message = await db.serviceProviderMessage.create({
    data: {
      providerId,
      title: title.slice(0, 200),
      content: content.slice(0, 2000),
      type,
      imagePath: imagePath || null,
      countryCode: provider.countryCode,
      priority: Math.min(Math.max(priority, 0), 10),
    },
  })

  return NextResponse.json({ ok: true, messageId: message.id }, { status: 201 })
}

// GET /api/service-providers/broadcast?providerId=xxx
// List all broadcasts sent by a provider
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const providerId = searchParams.get('providerId')
  if (!providerId) {
    return NextResponse.json({ error: 'providerId required' }, { status: 400 })
  }

  const provider = await db.serviceProvider.findUnique({
    where: { id: providerId },
  })
  if (!provider || provider.ownerId !== session.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const broadcasts = await db.serviceProviderMessage.findMany({
    where: { providerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({ broadcasts })
}
