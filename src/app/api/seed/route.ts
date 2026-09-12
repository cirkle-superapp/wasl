import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'
import bcrypt from 'bcryptjs'

export const runtime = 'nodejs'

// POST /api/seed
// Creates demo users if not present, and one 1-on-1 conversation between
// the current user and a demo user. Idempotent.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const count = Math.max(1, Math.min(20, Number(body?.count) || 8))
    const demoNames = [
      'Amira Hassan',
      'Omar Khalil',
      'Layla Mostafa',
      'Yusuf Ibrahim',
      'Sara Adel',
      'Mariam Tarek',
      'Karim Nabil',
      'Hana Sameh',
      'Adam Fouad',
      'Nour Sherif',
      'Rana Hossam',
      'Ziad Magdy',
      'Salma Wael',
      'Bassel Adel',
      'Farida Hisham',
      'Tiaa Mahmoud',
      'Habiba Samy',
      'Jana Khaled',
      'Malek Emad',
      'Salma Adel',
    ]
    const phones = Array.from({ length: 20 }, (_, i) => `+20100${String(i).padStart(8, '0')}`)
    const created: { id: string; name: string; username: string }[] = []
    for (let i = 0; i < count; i++) {
      const phone = phones[i]
      const name = demoNames[i]
      const username = `demo_${name.toLowerCase().replace(/\s+/g, '_')}`
      let user = await db.user.findUnique({ where: { username } })
      if (!user) {
        // Also check if someone already has this phone
        const existingPhone = await db.user.findFirst({ where: { phone } })
        if (existingPhone) {
          user = existingPhone
        } else {
          const hashedPassword = await bcrypt.hash('demo123', 10)
          user = await db.user.create({
            data: {
              username,
              password: hashedPassword,
              name,
              email: `${username}@cirkle.app`,
              phone,
              avatarColor: pickAvatarColor(phone),
              about: [
                'Hey there! I am using Wasl.',
                'Available',
                'Busy',
                'At work',
                "Can't talk now",
              ][i % 5],
              verified: true,
              verifiedAt: new Date(),
            },
          })
          // Create a PhoneNumber record
          await db.phoneNumber.create({
            data: {
              userId: user.id,
              number: phone,
              label: 'Primary',
              active: true,
            },
          })
        }
      }
      created.push({ id: user.id, name: user.name, username: user.username })
    }

    // Create a 1-on-1 conversation between current user and the first demo user
    let conversationId: string | null = null
    if (created.length > 0) {
      const otherId = created[0].id
      // Check for existing 1-on-1 by looking at all non-group conversations where
      // BOTH the current user and the other user are participants.
      const all1on1 = await db.conversation.findMany({
        where: {
          isGroup: false,
          participants: { some: { userId: session.id } },
        },
        include: { participants: true },
      })
      const existing = all1on1.find(
        (c) =>
          c.participants.length === 2 &&
          c.participants.some((p) => p.userId === otherId)
      )
      if (existing) {
        conversationId = existing.id
      } else {
        const conv = await db.conversation.create({
          data: {
            isGroup: false,
            createdBy: session.id,
            participants: {
              create: [{ userId: session.id }, { userId: otherId }],
            },
          },
        })
        // Seed some messages
        const msgs = [
          { from: otherId, content: 'Hey! Welcome to Wasl 👋' },
          { from: otherId, content: 'How are you doing today?' },
          {
            from: session.id,
            content: "Hi! I'm great, thanks. This app looks awesome!",
          },
          { from: otherId, content: 'Glad to hear it. Let me know if you need anything.' },
        ]
        for (let i = 0; i < msgs.length; i++) {
          await db.message.create({
            data: {
              conversationId: conv.id,
              senderId: msgs[i].from,
              content: msgs[i].content,
              type: 'text',
              status: 'read',
            },
          })
        }
        conversationId = conv.id
      }
    }

    // Create a group conversation with a few demo users (idempotent)
    const groupParticipants = [session.id, ...created.slice(0, 3).map((u) => u.id)]
    // Check if a group named "Friends on Wasl" already exists with the current user
    const existingGroup = await db.conversation.findFirst({
      where: {
        isGroup: true,
        name: 'Friends on Wasl',
        participants: { some: { userId: session.id } },
      },
    })
    let groupConvId: string
    if (existingGroup) {
      groupConvId = existingGroup.id
    } else {
      const groupConv = await db.conversation.create({
        data: {
          name: 'Friends on Wasl',
          isGroup: true,
          createdBy: session.id,
          avatarColor: pickAvatarColor('friends-group'),
          participants: {
            create: groupParticipants.map((uid) => ({ userId: uid })),
          },
        },
      })
      await db.message.create({
        data: {
          conversationId: groupConv.id,
          senderId: session.id,
          content: `${session.name} created the group "Friends on Wasl"`,
          type: 'system',
          status: 'read',
        },
      })
      await db.message.create({
        data: {
          conversationId: groupConv.id,
          senderId: created[1]?.id || session.id,
          content: 'Welcome everyone 🎉',
          type: 'text',
          status: 'read',
        },
      })
      groupConvId = groupConv.id
    }

    return NextResponse.json({
      ok: true,
      created,
      conversationId,
      groupId: groupConvId,
    })
  } catch (err) {
    console.error('[seed] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
