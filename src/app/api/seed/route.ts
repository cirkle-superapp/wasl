import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'

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
      'Salma Wael',
    ]
    const phones = Array.from({ length: 20 }, (_, i) => `+20100${String(i).padStart(8, '0')}`)
    const created: { id: string; name: string; phone: string }[] = []
    for (let i = 0; i < count; i++) {
      const phone = phones[i]
      const name = demoNames[i]
      let user = await db.user.findUnique({ where: { phone } })
      if (!user) {
        user = await db.user.create({
          data: {
            phone,
            name,
            avatarColor: pickAvatarColor(phone),
            about: [
              'Hey there! I am using Wasl.',
              'Available',
              'Busy',
              'At work',
              'Can\'t talk now',
            ][i % 5],
          },
        })
      }
      created.push({ id: user.id, name: user.name, phone: user.phone })
    }

    // Create a 1-on-1 conversation between current user and the first demo user
    let conversationId: string | null = null
    if (created.length > 0) {
      const otherId = created[0].id
      const existing = await db.conversation.findFirst({
        where: {
          isGroup: false,
          participants: { every: { userId: { in: [session.id, otherId] } } },
        },
        include: { participants: true },
      })
      if (existing && existing.participants.length === 2) {
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

    // Create a group conversation with a few demo users
    const groupParticipants = [session.id, ...created.slice(0, 3).map((u) => u.id)]
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

    return NextResponse.json({
      ok: true,
      created,
      conversationId,
      groupId: groupConv.id,
    })
  } catch (err) {
    console.error('[seed] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
