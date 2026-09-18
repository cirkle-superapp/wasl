import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'

export const runtime = 'nodejs'

// POST /api/service-providers/register
// Register a new official service provider (bank, government, etc.)
// Requires the current user to be identity-verified.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const me = await db.user.findUnique({
    where: { id: session.id },
    select: { verified: true, name: true },
  })
  if (!me?.verified) {
    return NextResponse.json(
      { error: 'You must verify your personal identity first before registering a service provider.' },
      { status: 403 }
    )
  }

  const body = await req.json()
  const {
    name,
    type = 'government',
    description = '',
    officialName,
    registrationNumber,
    taxNumber,
    countryCode = '+20',
    registrationDocPath,
    idDocPath,
    livenessVideoPath,
    livenessVerified = false,
    contactPhone,
    contactEmail,
    website,
  } = body || {}

  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: 'Provider name is required' }, { status: 400 })
  }
  if (!registrationDocPath || !idDocPath) {
    return NextResponse.json(
      { error: 'Registration document and ID document are required' },
      { status: 400 }
    )
  }

  const provider = await db.serviceProvider.create({
    data: {
      name: name.trim(),
      ownerId: session.id,
      type,
      description: description.slice(0, 500),
      avatarColor: pickAvatarColor(name),
      officialName: officialName || null,
      registrationNumber: registrationNumber || null,
      taxNumber: taxNumber || null,
      countryCode,
      registrationDocPath,
      idDocPath,
      livenessVideoPath: livenessVideoPath || null,
      livenessVerified: !!livenessVerified,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
      website: website || null,
      // Auto-approve for testing (in production, this would be 'pending' /
      // false / false until a Wasl admin reviews the provider).
      status: 'approved',
      verified: true,
      canBroadcast: true,
    },
  })

  return NextResponse.json({ ok: true, provider }, { status: 201 })
}

// GET /api/service-providers/register
// List service providers owned by the current user
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const providers = await db.serviceProvider.findMany({
    where: { ownerId: session.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      avatarPath: true,
      avatarColor: true,
      countryCode: true,
      status: true,
      verified: true,
      canBroadcast: true,
      createdAt: true,
      _count: { select: { broadcasts: true } },
    },
  })
  return NextResponse.json({ providers })
}
