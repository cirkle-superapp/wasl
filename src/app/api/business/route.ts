import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'

export const runtime = 'nodejs'

// GET /api/business — list businesses owned by / membership of the current user
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const [owned, memberships] = await Promise.all([
    db.business.findMany({
      where: { ownerId: session.id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true, avatarColor: true, phone: true },
            },
          },
        },
        groups: true,
        owner: {
          select: { id: true, name: true, avatar: true, avatarColor: true, verified: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.businessMember.findMany({
      where: { userId: session.id },
      include: {
        business: {
          include: {
            owner: {
              select: { id: true, name: true, avatar: true, avatarColor: true, verified: true },
            },
          },
        },
      },
    }),
  ])
  return NextResponse.json({
    businesses: owned.map(serializeBusiness),
    memberships: memberships.map((m) => ({
      id: m.id,
      role: m.role,
      business: serializeBusiness(m.business),
    })),
  })
}

// POST /api/business — register a new business.
// Requires the current user to be verified. Uploads registrationDocPath,
// taxDocPath, idDocPath. Status defaults to "pending" (auto-approved here so
// the flow is testable).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Must be a verified person
  const me = await db.user.findUnique({
    where: { id: session.id },
    select: { verified: true, name: true },
  })
  if (!me?.verified) {
    return NextResponse.json(
      {
        error:
          'You must verify your personal identity before registering a business. Go to Settings → Verify identity.',
      },
      { status: 403 }
    )
  }
  const body = await req.json()
  const {
    name,
    description = '',
    category,
    registrationDocPath,
    taxDocPath,
    idDocPath,
    hiddenPhone,
    hidePhone = false,
  } = body || {}
  const safeName = typeof name === 'string' ? name.trim() : ''
  if (!safeName || safeName.length < 2) {
    return NextResponse.json({ error: 'Business name is required' }, { status: 400 })
  }
  if (!registrationDocPath || !taxDocPath || !idDocPath) {
    return NextResponse.json(
      {
        error:
          'All three verification documents are required: company registration, tax number, and an ID of someone on the registration.',
      },
      { status: 400 }
    )
  }
  for (const p of [registrationDocPath, taxDocPath, idDocPath]) {
    if (typeof p !== 'string' || !p.startsWith('/uploads/')) {
      return NextResponse.json({ error: 'Invalid document path' }, { status: 400 })
    }
  }
  const business = await db.business.create({
    data: {
      name: safeName,
      ownerId: session.id,
      description: String(description || '').slice(0, 500),
      category: typeof category === 'string' ? category : null,
      registrationDocPath,
      taxDocPath,
      idDocPath,
      avatarColor: pickAvatarColor(safeName),
      hiddenPhone: typeof hiddenPhone === 'string' ? hiddenPhone : null,
      hidePhone: !!hidePhone,
      // Auto-approve so the flow is testable; in production this would be
      // pending until a Wasl admin reviews the documents.
      status: 'approved',
      verified: true,
      verifiedAt: new Date(),
    },
  })
  // Owner is automatically an admin member
  await db.businessMember.create({
    data: {
      businessId: business.id,
      userId: session.id,
      role: 'admin',
      invitedBy: session.id,
    },
  })
  const fresh = await db.business.findUnique({
    where: { id: business.id },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, avatar: true, avatarColor: true, phone: true },
          },
        },
      },
      groups: true,
      owner: {
        select: { id: true, name: true, avatar: true, avatarColor: true, verified: true },
      },
    },
  })
  return NextResponse.json({ ok: true, business: serializeBusiness(fresh) }, { status: 201 })
}

function serializeBusiness(b: any) {
  if (!b) return null
  return {
    id: b.id,
    name: b.name,
    ownerId: b.ownerId,
    description: b.description,
    avatarPath: b.avatarPath,
    avatarColor: b.avatarColor,
    category: b.category,
    status: b.status,
    verified: b.verified,
    rejectionReason: b.rejectionReason,
    hidePhone: b.hidePhone,
    hiddenPhone: b.hiddenPhone,
    createdAt: b.createdAt,
    owner: b.owner
      ? {
          id: b.owner.id,
          name: b.owner.name,
          avatar: b.owner.avatar,
          avatarColor: b.owner.avatarColor,
          verified: b.owner.verified,
        }
      : null,
    members: (b.members || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      userId: m.userId,
      name: m.user?.name,
      avatar: m.user?.avatar,
      avatarColor: m.user?.avatarColor,
      phone: m.user?.phone,
      joinedAt: m.joinedAt,
    })),
    groups: (b.groups || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      visibility: g.visibility,
      category: g.category,
      conversationId: g.conversationId,
      createdAt: g.createdAt,
    })),
  }
}

export { serializeBusiness }
