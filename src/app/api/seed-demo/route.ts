import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { pickAvatarColor } from '@/lib/avatar'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

export const runtime = 'nodejs'

// POST /api/seed-demo
// Builds a comprehensive demo dataset for the current user — multiple 1-on-1
// conversations with varied content (replies, edits, reactions, voice notes,
// protected messages), group conversations with polls + commits, stories,
// broadcast channels, service-provider announcements, scheduled messages,
// time capsules, receipt splits, bookmarks, stars, and chat folders.
//
// IDEMPOTENT: calling it twice produces the same dataset (no duplicates).
// Safe to call from any authenticated session — only writes data owned by
// the calling user.
//
// Body (all optional):
//   { "reset": true }   — wipe the demo dataset for this user first so a
//                          fresh presentation starts clean. Preserves the
//                          user account itself + their phone numbers.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const reset = body?.reset === true

  try {
    if (reset) {
      await wipeDemoData(session.id)
    }

    // 1. Ensure the demo contacts exist (idempotent).
    const personas = await ensurePersonas(session.id)

    // 2. Build the 1-on-1 conversations.
    const oneOnOnes = await buildOneOnOneConversations(session, personas)

    // 3. Build group conversations.
    const groups = await buildGroupConversations(session, personas)

    // 4. Stories from several personas.
    const stories = await buildStories(session, personas)

    // 5. Broadcast channels the user is subscribed to.
    const broadcasts = await buildBroadcastChannels(session, personas)

    // 6. Service providers + official announcements.
    const providers = await buildServiceProviders(session)

    // 7. Chat folders organizing the conversations.
    const folders = await buildChatFolders(session, [...oneOnOnes, ...groups])

    // 8. Scheduled messages (upcoming).
    const scheduled = await buildScheduledMessages(session, oneOnOnes, personas)

    // 9. Time capsules (locked, future-dated).
    const capsules = await buildTimeCapsules(session, oneOnOnes, personas)

    // 10. Receipt splits (one unpaid).
    const splits = await buildReceiptSplits(session, [...oneOnOnes, ...groups], personas)

    // 11. School Connect demo data — a verified school + 3 students + parent connections.
    const schools = await buildSchoolConnect(session, personas)

    return NextResponse.json({
      ok: true,
      reset,
      stats: {
        personas: personas.length,
        oneOnOneConversations: oneOnOnes.length,
        groupConversations: groups.length,
        stories: stories.length,
        broadcastChannels: broadcasts.length,
        serviceProviders: providers.length,
        folders: folders.length,
        scheduledMessages: scheduled.length,
        timeCapsules: capsules.length,
        receiptSplits: splits.length,
        schools: schools.length,
      },
    })
  } catch (err) {
    console.error('[seed-demo] error', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function wipeDemoData(userId: string) {
  // Delete in dependency order (children before parents) to avoid FK errors.
  // We ONLY delete records the user owns or participates in — not other users'
  // accounts. The user themselves is preserved.
  await db.bookmark.deleteMany({ where: { userId } })
  await db.starredMessage.deleteMany({ where: { userId } })
  await db.chatFolder.deleteMany({ where: { userId } })
  await db.scheduledMessage.deleteMany({ where: { senderId: userId } })
  await db.timeCapsule.deleteMany({ where: { senderId: userId } })
  await db.receiptSplit.deleteMany({ where: { creatorId: userId } })
  await db.broadcastSubscriber.deleteMany({ where: { userId } })

  // School Connect — wipe schools owned by this user, plus their memberships
  // and parent connections (cascades down to school students, parent
  // connections, etc. via onDelete: Cascade in the schema).
  const ownedSchools = await db.school.findMany({
    where: { ownerId: userId },
    select: { id: true },
  })
  if (ownedSchools.length) {
    await db.school.deleteMany({
      where: { id: { in: ownedSchools.map((s) => s.id) } },
    })
  }
  // Also wipe this user's memberships + parent connections at OTHER schools
  // (in case they joined a school owned by someone else).
  await db.schoolMembership.deleteMany({ where: { userId } })
  await db.schoolParentConnection.deleteMany({ where: { parentId: userId } })

  // Pull all conversations the user participates in.
  const parts = await db.participant.findMany({
    where: { userId },
    select: { conversationId: true },
  })
  const convIds = parts.map((p) => p.conversationId)
  if (convIds.length) {
    // Delete cascading children manually (reactions, edits, commits, polls,
    // stories, etc.) because some are linked via messageId / conversationId.
    const msgs = await db.message.findMany({
      where: { conversationId: { in: convIds } },
      select: { id: true },
    })
    const msgIds = msgs.map((m) => m.id)
    if (msgIds.length) {
      await db.reaction.deleteMany({ where: { messageId: { in: msgIds } } })
      await db.messageEdit.deleteMany({ where: { messageId: { in: msgIds } } })
      await db.starredMessage.deleteMany({ where: { messageId: { in: msgIds } } })
      await db.bookmark.deleteMany({ where: { messageId: { in: msgIds } } })
      await db.deletedForMe.deleteMany({ where: { messageId: { in: msgIds } } })
    }
    await db.commit.deleteMany({ where: { conversationId: { in: convIds } } })
    const polls = await db.poll.findMany({
      where: { conversationId: { in: convIds } },
      select: { id: true },
    })
    if (polls.length) {
      await db.pollVote.deleteMany({
        where: { pollId: { in: polls.map((p) => p.id) } },
      })
    }
    await db.poll.deleteMany({ where: { conversationId: { in: convIds } } })
    await db.disappearingSetting.deleteMany({
      where: { conversationId: { in: convIds } },
    })
    await db.folderConversation.deleteMany({
      where: { conversationId: { in: convIds } },
    })
    await db.message.deleteMany({ where: { conversationId: { in: convIds } } })
    await db.participant.deleteMany({ where: { conversationId: { in: convIds } } })
    await db.conversation.deleteMany({ where: { id: { in: convIds } } })
  }

  // Service-provider read/dismissed records for this user.
  await db.serviceProviderMessageRead.deleteMany({ where: { userId } })
  await db.serviceProviderMessageDismissed.deleteMany({ where: { userId } })
}

type Persona = {
  id: string
  name: string
  username: string
  phone: string
  about: string
  avatarColor: string
  online: boolean
  lastSeen: Date
}

const PERSONA_DEFS: Array<Omit<Persona, 'id'>> = [
  {
    name: 'Amira Hassan',
    username: 'demo_amira_hassan',
    phone: '+201001000001',
    about: 'Hey there! I am using Wasl.',
    avatarColor: '#FF6B6B',
    online: true,
    lastSeen: new Date(),
  },
  {
    name: 'Omar Khalil',
    username: 'demo_omar_khalil',
    phone: '+201001000002',
    about: 'At work — back at 6pm',
    avatarColor: '#128C7E',
    online: false,
    lastSeen: new Date(Date.now() - 18 * 60 * 1000),
  },
  {
    name: 'Layla Mostafa',
    username: 'demo_layla_mostafa',
    phone: '+201001000003',
    about: 'Family first ❤️',
    avatarColor: '#EC4899',
    online: true,
    lastSeen: new Date(),
  },
  {
    name: 'Yusuf Ibrahim',
    username: 'demo_yusuf_ibrahim',
    phone: '+201001000004',
    about: 'Landlord — Building 12',
    avatarColor: '#F59E0B',
    online: false,
    lastSeen: new Date(Date.now() - 3 * 60 * 60 * 1000),
  },
  {
    name: 'Sara Adel',
    username: 'demo_sara_adel',
    phone: '+201001000005',
    about: 'Project Falcon lead',
    avatarColor: '#8B5CF6',
    online: true,
    lastSeen: new Date(),
  },
  {
    name: 'Karim Nabil',
    username: 'demo_karim_nabil',
    phone: '+201001000006',
    about: 'Coffee. Code. Repeat.',
    avatarColor: '#10B981',
    online: false,
    lastSeen: new Date(Date.now() - 25 * 60 * 1000),
  },
  {
    name: 'Mariam Tarek',
    username: 'demo_mariam_tarek',
    phone: '+201001000007',
    about: 'Available',
    avatarColor: '#6366F1',
    online: false,
    lastSeen: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    name: 'Hana Sameh',
    username: 'demo_hana_sameh',
    phone: '+201001000008',
    about: 'On vacation 🏖️',
    avatarColor: '#F97316',
    online: false,
    lastSeen: new Date(Date.now() - 6 * 60 * 60 * 1000),
  },
  {
    name: 'Adam Fouad',
    username: 'demo_adam_fouad',
    phone: '+201001000009',
    about: 'Football Saturday!',
    avatarColor: '#14B8A6',
    online: true,
    lastSeen: new Date(),
  },
  {
    name: 'Nour Sherif',
    username: 'demo_nour_sherif',
    phone: '+201001000010',
    about: 'Designer + coffee enthusiast',
    avatarColor: '#84CC16',
    online: false,
    lastSeen: new Date(Date.now() - 12 * 60 * 60 * 1000),
  },
]

async function ensurePersonas(currentUserId: string): Promise<Persona[]> {
  const out: Persona[] = []
  for (const def of PERSONA_DEFS) {
    let user = await db.user.findUnique({ where: { username: def.username } })
    if (!user) {
      const hashed = await bcrypt.hash('demo123', 10)
      user = await db.user.create({
        data: {
          username: def.username,
          password: hashed,
          name: def.name,
          email: `${def.username}@cirkle.app`,
          phone: def.phone,
          about: def.about,
          avatarColor: def.avatarColor,
          online: def.online,
          lastSeen: def.lastSeen,
          verified: true,
          verifiedAt: new Date(),
        },
      })
      await db.phoneNumber.create({
        data: {
          userId: user.id,
          number: def.phone,
          label: 'Primary',
          active: true,
        },
      })
    } else {
      // Refresh presence + about so the demo always looks alive.
      await db.user.update({
        where: { id: user.id },
        data: {
          about: def.about,
          avatarColor: def.avatarColor,
          online: def.online,
          lastSeen: def.lastSeen,
        },
      })
    }
    out.push({ ...def, id: user.id })
  }
  return out
}

// Find an existing 1-on-1 conversation between two users (or create one).
async function findOrCreate1On1(
  userA: string,
  userB: string
): Promise<string> {
  const existing = await db.conversation.findFirst({
    where: {
      isGroup: false,
      participants: { some: { userId: userA } },
      AND: [{ participants: { some: { userId: userB } } }],
    },
    include: { participants: true },
  })
  if (existing && existing.participants.length === 2) return existing.id
  const conv = await db.conversation.create({
    data: {
      isGroup: false,
      createdBy: userA,
      participants: {
        create: [{ userId: userA }, { userId: userB }],
      },
    },
  })
  return conv.id
}

async function findOrCreateGroup(
  name: string,
  description: string,
  avatarColor: string,
  userIds: string[],
  creatorId: string
): Promise<string> {
  const existing = await db.conversation.findFirst({
    where: { isGroup: true, name, participants: { some: { userId: creatorId } } },
  })
  if (existing) return existing.id
  const conv = await db.conversation.create({
    data: {
      name,
      isGroup: true,
      description,
      avatarColor,
      createdBy: creatorId,
      participants: {
        create: userIds.map((uid) => ({
          userId: uid,
          role: uid === creatorId ? 'admin' : 'member',
        })),
      },
    },
  })
  return conv.id
}

// Helper: create a message and update the conversation's updatedAt (so the
// sidebar preview reflects the latest message). Returns the message id.
type NewMsg = {
  conversationId: string
  senderId: string
  content: string
  type?: string
  status?: string
  replyToId?: string | null
  protected?: boolean | null
  createdAt?: Date
  edited?: boolean
  pinned?: boolean
  commitId?: string | null
}
async function addMessage(m: NewMsg): Promise<string> {
  const msg = await db.message.create({
    data: {
      conversationId: m.conversationId,
      senderId: m.senderId,
      content: m.content,
      type: m.type ?? 'text',
      status: m.status ?? 'read',
      replyToId: m.replyToId ?? null,
      protected: m.protected ?? null,
      edited: m.edited ?? false,
      pinned: m.pinned ?? false,
      commitId: m.commitId ?? null,
      createdAt: m.createdAt ?? new Date(),
    },
  })
  // Bump the conversation's updatedAt.
  await db.conversation.update({
    where: { id: m.conversationId },
    data: { updatedAt: m.createdAt ?? new Date() },
  })
  return msg.id
}

async function addReaction(messageId: string, userId: string, emoji: string) {
  // Skip if a reaction by this user already exists on this message.
  const existing = await db.reaction.findUnique({
    where: { messageId_userId: { messageId, userId } },
  })
  if (existing) return
  await db.reaction.create({ data: { messageId, userId, emoji } })
}

async function starMessage(messageId: string, userId: string) {
  const existing = await db.starredMessage.findUnique({
    where: { messageId_userId: { messageId, userId } },
  })
  if (existing) return
  await db.starredMessage.create({ data: { messageId, userId } })
}

async function bookmarkMessage(
  messageId: string,
  userId: string,
  note?: string
) {
  const existing = await db.bookmark.findUnique({
    where: { userId_messageId: { userId, messageId } },
  })
  if (existing) return
  await db.bookmark.create({
    data: { messageId, userId, note: note ?? null },
  })
}

async function addMessageEdit(messageId: string, previousContent: string) {
  await db.messageEdit.create({
    data: { messageId, content: previousContent, editedAt: new Date() },
  })
}

// ----------------------------------------------------------------------------
// 1-on-1 conversations
// ----------------------------------------------------------------------------

async function buildOneOnOneConversations(
  session: { id: string; name: string; username: string },
  personas: Persona[]
): Promise<{ id: string; name: string; folder: string }[]> {
  const out: { id: string; name: string; folder: string }[] = []
  const now = Date.now()
  const minutesAgo = (m: number) => new Date(now - m * 60_000)
  const hoursAgo = (h: number) => new Date(now - h * 60 * 60_000)
  const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60_000)

  // ---- Amira Hassan: friendly daily chat with replies + reactions ----
  {
    const p = personas[0] // Amira
    const convId = await findOrCreate1OnOne(session.id, p.id)
    const m1 = await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'Hey! Welcome to Wasl 👋',
      createdAt: minutesAgo(45),
    })
    const m2 = await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'How are you doing today?',
      createdAt: minutesAgo(44),
    })
    const m3 = await addMessage({
      conversationId: convId,
      senderId: session.id,
      content: "Hi! I'm great, thanks. This app looks awesome!",
      createdAt: minutesAgo(43),
    })
    await addReaction(m3, p.id, '❤️')
    const m4 = await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'Glad to hear it. Let me know if you need anything.',
      replyToId: m3,
      createdAt: minutesAgo(42),
    })
    // A protected message — recipient can't screenshot / forward.
    const m5 = await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: '🔒 This message is protected — you cannot screenshot or forward it.',
      protected: true,
      createdAt: minutesAgo(40),
    })
    await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'Anyway — lunch this Friday?',
      createdAt: minutesAgo(8),
    })
    await starMessage(m2, session.id)
    await starMessage(m4, session.id)
    await bookmarkMessage(m5, session.id, 'Reference the protection policy')
    out.push({ id: convId, name: p.name, folder: 'Friends' })
  }

  // ---- Omar Khalil: work colleague with an EDITED message ----
  {
    const p = personas[1] // Omar
    const convId = await findOrCreate1OnOne(session.id, p.id)
    const m1 = await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'Morning! Did you push the deploy script yet?',
      createdAt: hoursAgo(5),
    })
    // Outgoing edited message — we create the original, then a MessageEdit
    // entry capturing the previous content, then update the message in place.
    const m2 = await addMessage({
      conversationId: convId,
      senderId: session.id,
      content: 'Pushing the deploy now, ETA 10 min',
      createdAt: new Date(now - 4.8 * 60 * 60_000),
    })
    await addMessageEdit(m2, 'Pushing the deploy now, ETA 10 min')
    await db.message.update({
      where: { id: m2 },
      data: {
        content: 'Pushed ✅ — deploy script live, ETA 10 min for prod',
        edited: true,
      },
    })
    await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'Perfect — I’ll watch the dashboard 👀',
      createdAt: hoursAgo(4),
    })
    const m4 = await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'One more thing — can you review PR #428 when you have a sec?',
      createdAt: minutesAgo(20),
    })
    await addReaction(m4, session.id, '👍')
    await bookmarkMessage(m4, session.id, 'Review PR #428')
    out.push({ id: convId, name: p.name, folder: 'Work' })
  }

  // ---- Layla Mostafa: sister/family with a voice-note (placeholder) ----
  {
    const p = personas[2] // Layla
    const convId = await findOrCreate1OnOne(session.id, p.id)
    const m1 = await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'Mama said dinner at 8pm — bring dessert 🍮',
      createdAt: hoursAgo(2),
    })
    await addMessage({
      conversationId: convId,
      senderId: session.id,
      content: 'On it! Picking up basbousa from the place near home.',
      createdAt: new Date(now - 1.5 * 60 * 60_000),
    })
    // A voice message — stored as text content because we don't have a real
    // audio asset in the demo, but the type='voice' triggers the voice-player UI.
    await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: '🎙️ [Voice message — 0:12]',
      type: 'voice',
      createdAt: minutesAgo(35),
    })
    await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'See you tonight ❤️',
      createdAt: minutesAgo(33),
    })
    out.push({ id: convId, name: p.name, folder: 'Family' })
  }

  // ---- Yusuf Ibrahim: landlord with a Commit (rental agreement) ----
  {
    const p = personas[3] // Yusuf
    const convId = await findOrCreate1OnOne(session.id, p.id)
    await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'Salam — your lease is up for renewal next month.',
      createdAt: daysAgo(3),
    })
    await addMessage({
      conversationId: convId,
      senderId: session.id,
      content: 'Wa alaykum salam. Yes, ready to renew. Same terms?',
      createdAt: new Date(now - 2.9 * 24 * 60 * 60_000),
    })
    // Create a Commit (rental agreement) — pending counterparty signature.
    const commitHash = crypto.createHash('sha256').update(`commit-${Date.now()}`).digest('hex')
    const commit = await db.commit.create({
      data: {
        conversationId: convId,
        creatorId: session.id,
        counterpartyId: p.id,
        type: 'rental',
        title: 'Apartment 4B — 12-month lease renewal',
        description: 'Renewal of lease for apartment 4B, Building 12, Nasr City. Monthly rent EGP 12,000 paid on the 1st of each month.',
        amount: 12000,
        currency: 'EGP',
        deadline: new Date(now + 14 * 24 * 60 * 60_000).toISOString(),
        conditions: JSON.stringify([
          'Tenant pays utilities (water, electricity, internet).',
          'Two months deposit refundable at end of lease.',
          'No subletting without written landlord consent.',
          '30-day notice required for early termination.',
        ]),
        status: 'pending',
        fairnessScore: 92,
        fairnessNote: 'AI fairness check passed: balanced terms, market-rate rent, standard deposit.',
        hash: commitHash,
        creatorSigned: true,
        creatorSignedAt: new Date(),
        counterpartySigned: false,
      },
    })
    await addMessage({
      conversationId: convId,
      senderId: session.id,
      content: 'Sent you a verified agreement — please review and sign 📝',
      type: 'commit',
      commitId: commit.id,
      createdAt: new Date(now - 2.5 * 24 * 60 * 60_000),
    })
    await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'Looks good — reviewing now.',
      createdAt: daysAgo(1),
    })
    out.push({ id: convId, name: p.name, folder: 'Work' })
  }

  // ---- Sara Adel: project lead with a Receipt Split ----
  {
    const p = personas[4] // Sara
    const convId = await findOrCreate1OnOne(session.id, p.id)
    await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'Team lunch was great — let me split the bill.',
      createdAt: hoursAgo(6),
    })
    const split = await db.receiptSplit.create({
      data: {
        conversationId: convId,
        creatorId: session.id,
        title: 'Team lunch — Koshary Abou Tarek',
        totalAmount: 240,
        currency: 'EGP',
        splitCount: 4,
      },
    })
    // Create 2 participants (only 2 are in this 1-on-1 chat but the split
    // records who owes what across the team).
    await db.receiptSplitParticipant.create({
      data: {
        splitId: split.id,
        userId: session.id,
        amount: 60,
        paid: true,
      },
    })
    await db.receiptSplitParticipant.create({
      data: {
        splitId: split.id,
        userId: p.id,
        amount: 60,
        paid: false,
      },
    })
    out.push({ id: convId, name: p.name, folder: 'Work' })
  }

  // ---- Karim Nabil: chat with a TIME CAPSULE (locked) ----
  {
    const p = personas[5] // Karim
    const convId = await findOrCreate1OnOne(session.id, p.id)
    await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'Writing you a letter for next year ✨',
      createdAt: daysAgo(1),
    })
    await db.timeCapsule.create({
      data: {
        conversationId: convId,
        senderId: p.id,
        content: 'A year ago today, we started this project. If you are reading this, I hope Wasl has shipped and we are celebrating. Cheers, Karim 🥂',
        unlockAt: new Date(now + 365 * 24 * 60 * 60_000),
      },
    })
    await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: '⏳ Time capsule — unlocks in 365 days',
      type: 'system',
      createdAt: new Date(now - 23 * 60 * 60_000),
    })
    out.push({ id: convId, name: p.name, folder: 'Friends' })
  }

  // ---- Hana Sameh: muted conversation (vacationing friend) ----
  {
    const p = personas[7] // Hana
    const convId = await findOrCreate1OnOne(session.id, p.id)
    await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'Postcards coming your way from Sharm 🏖️',
      createdAt: daysAgo(4),
    })
    // Mute this conversation for the user (per-user setting on Participant).
    await db.participant.updateMany({
      where: { conversationId: convId, userId: session.id },
      data: { muted: true },
    })
    out.push({ id: convId, name: p.name, folder: 'Friends' })
  }

  // ---- Adam Fouad: archived conversation (old football chat) ----
  {
    const p = personas[8] // Adam
    const convId = await findOrCreate1OnOne(session.id, p.id)
    await addMessage({
      conversationId: convId,
      senderId: p.id,
      content: 'Saturday football is back on ⚽',
      createdAt: daysAgo(7),
    })
    await db.participant.updateMany({
      where: { conversationId: convId, userId: session.id },
      data: { archived: true },
    })
    out.push({ id: convId, name: p.name, folder: 'Friends' })
  }

  return out
}

async function findOrCreate1OnOne(
  userA: string,
  userB: string
): Promise<string> {
  const existing = await db.conversation.findFirst({
    where: {
      isGroup: false,
      participants: { some: { userId: userA } },
      AND: [{ participants: { some: { userId: userB } } }],
    },
    include: { participants: true },
  })
  if (existing && existing.participants.length === 2) return existing.id
  const conv = await db.conversation.create({
    data: {
      isGroup: false,
      createdBy: userA,
      participants: {
        create: [{ userId: userA }, { userId: userB }],
      },
    },
  })
  return conv.id
}

// ----------------------------------------------------------------------------
// Group conversations
// ----------------------------------------------------------------------------

async function buildGroupConversations(
  session: { id: string; name: string },
  personas: Persona[]
): Promise<{ id: string; name: string; folder: string }[]> {
  const out: { id: string; name: string; folder: string }[] = []
  const now = Date.now()
  const minutesAgo = (m: number) => new Date(now - m * 60_000)
  const hoursAgo = (h: number) => new Date(now - h * 60 * 60_000)
  const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60_000)

  // ---- Family Group: parents + siblings planning ----
  {
    const members = [session.id, personas[2].id, personas[6].id] // Layla, Mariam
    const convId = await findOrCreateGroup(
      'Family Group ❤️',
      'For mama, baba, and the kids.',
      pickAvatarColor('family-group'),
      members,
      session.id
    )
    await addMessage({
      conversationId: convId,
      senderId: session.id,
      content: `${session.name} created the group "Family Group ❤️"`,
      type: 'system',
      createdAt: daysAgo(10),
    })
    const m1 = await addMessage({
      conversationId: convId,
      senderId: personas[2].id,
      content: 'Who is bringing dessert Friday? 🍮',
      createdAt: hoursAgo(3),
    })
    const m2 = await addMessage({
      conversationId: convId,
      senderId: personas[6].id,
      content: 'I can grab konafa from the place near work.',
      createdAt: new Date(now - 2.5 * 60 * 60_000),
    })
    await addReaction(m2, session.id, '👍')
    await addMessage({
      conversationId: convId,
      senderId: session.id,
      content: 'You’re the best, Mariam 🙏',
      replyToId: m2,
      createdAt: hoursAgo(2),
    })
    out.push({ id: convId, name: 'Family Group ❤️', folder: 'Family' })
  }

  // ---- Project Falcon: work team with a POLL ----
  {
    const members = [
      session.id,
      personas[1].id, // Omar
      personas[4].id, // Sara
      personas[5].id, // Karim
    ]
    const convId = await findOrCreateGroup(
      'Project Falcon 🦅',
      'Q4 launch coordination. Stand-ups 10am daily.',
      pickAvatarColor('project-falcon'),
      members,
      session.id
    )
    await addMessage({
      conversationId: convId,
      senderId: session.id,
      content: `${session.name} created the group "Project Falcon 🦅"`,
      type: 'system',
      createdAt: daysAgo(14),
    })
    await addMessage({
      conversationId: convId,
      senderId: personas[4].id,
      content: 'Sprint review tomorrow at 11am. Demo dry-run at 10am.',
      createdAt: hoursAgo(8),
    })
    const m = await addMessage({
      conversationId: convId,
      senderId: personas[1].id,
      content: 'Pinning the launch checklist 📋',
      pinned: true,
      createdAt: hoursAgo(7),
    })
    // Poll — which feature to demo first?
    const poll = await db.poll.create({
      data: {
        conversationId: convId,
        question: 'Which feature should we demo first at the launch?',
        options: JSON.stringify([
          { id: 'opt-1', text: 'Verified commits (Cirkle-inspired)' },
          { id: 'opt-2', text: 'Voice / Video calls (WebRTC)' },
          { id: 'opt-3', text: 'AI smart replies + summary' },
          { id: 'opt-4', text: 'Receipt split + scheduled messages' },
        ]),
        multiChoice: false,
        anonymous: false,
        createdBy: personas[1].id,
      },
    })
    await addMessage({
      conversationId: convId,
      senderId: personas[1].id,
      content: 'Vote on the launch demo order 👇',
      type: 'poll',
      createdAt: hoursAgo(6),
    })
    // Add some votes.
    await db.pollVote.create({
      data: { pollId: poll.id, userId: session.id, optionId: 'opt-2' },
    })
    await db.pollVote.create({
      data: { pollId: poll.id, userId: personas[4].id, optionId: 'opt-2' },
    })
    await db.pollVote.create({
      data: { pollId: poll.id, userId: personas[5].id, optionId: 'opt-1' },
    })
    // Add a commit (group_buy) — bulk license purchase.
    const commitHash = crypto
      .createHash('sha256')
      .update(`commit-falcon-${Date.now()}`)
      .digest('hex')
    const commit = await db.commit.create({
      data: {
        conversationId: convId,
        creatorId: personas[4].id,
        counterpartyId: session.id,
        type: 'group_buy',
        title: 'Bulk Figma license — 5 seats',
        description: 'Annual Figma Organization plan, 5 seats. $540/year total split equally among 5 team members.',
        amount: 108,
        currency: 'USD',
        deadline: new Date(now + 7 * 24 * 60 * 60_000).toISOString(),
        conditions: JSON.stringify([
          'Each member pays $108/year (or equivalent in EGP at lock-in rate).',
          'License valid for 12 months from purchase date.',
          'Cancellation requires unanimous consent.',
        ]),
        status: 'active',
        fairnessScore: 95,
        fairnessNote: 'Equal split, market-rate license, fair terms.',
        hash: commitHash,
        creatorSigned: true,
        creatorSignedAt: daysAgo(2),
        counterpartySigned: true,
        counterpartySignedAt: daysAgo(1),
      },
    })
    await addMessage({
      conversationId: convId,
      senderId: personas[4].id,
      content: 'Figma license agreement — please countersign ✍️',
      type: 'commit',
      commitId: commit.id,
      createdAt: daysAgo(2),
    })
    out.push({ id: convId, name: 'Project Falcon 🦅', folder: 'Work' })
  }

  // ---- Football Saturday: social group ----
  {
    const members = [
      session.id,
      personas[5].id, // Karim
      personas[8].id, // Adam
      personas[9].id, // Nour
    ]
    const convId = await findOrCreateGroup(
      'Football Saturday ⚽',
      'Weekly match + post-game mint tea.',
      pickAvatarColor('football-saturday'),
      members,
      personas[8].id,
    )
    await addMessage({
      conversationId: convId,
      senderId: personas[8].id,
      content: `${personas[8].name} created the group "Football Saturday ⚽"`,
      type: 'system',
      createdAt: daysAgo(30),
    })
    const m = await addMessage({
      conversationId: convId,
      senderId: personas[8].id,
      content: 'Game on for this Saturday 5pm at the usual pitch 🏟️',
      createdAt: hoursAgo(20),
    })
    await addReaction(m, session.id, '⚽')
    await addReaction(m, personas[5].id, '👍')
    await addReaction(m, personas[9].id, '🔥')
    out.push({ id: convId, name: 'Football Saturday ⚽', folder: 'Friends' })
  }

  // ---- Building 12 Residents: utility group (community) ----
  {
    const members = [
      session.id,
      personas[3].id, // Yusuf (landlord)
      personas[7].id, // Hana
    ]
    const convId = await findOrCreateGroup(
      'Building 12 Residents',
      'For building maintenance, water, electricity, and neighbour coordination.',
      pickAvatarColor('building-12'),
      members,
      personas[3].id,
    )
    await addMessage({
      conversationId: convId,
      senderId: personas[3].id,
      content: `${personas[3].name} created the group "Building 12 Residents"`,
      type: 'system',
      createdAt: daysAgo(45),
    })
    await addMessage({
      conversationId: convId,
      senderId: personas[3].id,
      content: 'Water will be off tomorrow 9am-11am for maintenance. Please plan accordingly 🚰',
      createdAt: hoursAgo(12),
    })
    out.push({ id: convId, name: 'Building 12 Residents', folder: 'Work' })
  }

  return out
}

// ----------------------------------------------------------------------------
// Stories
// ----------------------------------------------------------------------------

async function buildStories(
  session: { id: string },
  personas: Persona[]
): Promise<number[]> {
  const out: number[] = []
  const now = Date.now()
  const captions = [
    '✨ New day, new opportunities!',
    '☕ Coffee first.',
    'Hard at work on Project Falcon 🦅',
    'Friday vibes 🎉',
  ]
  for (let i = 0; i < Math.min(4, personas.length); i++) {
    const p = personas[i]
    const existing = await db.story.findFirst({
      where: { userId: p.id },
    })
    if (existing) {
      out.push(1)
      continue
    }
    await db.story.create({
      data: {
        userId: p.id,
        type: 'text',
        content: captions[i] || '✨',
        bgColor: p.avatarColor,
        expiresAt: new Date(now + 24 * 60 * 60_000),
      },
    })
    out.push(1)
  }
  // Mark all stories as viewed by the current user (so the sidebar doesn't
  // show a "new" indicator on every reload).
  const allStories = await db.story.findMany({
    where: { userId: { not: session.id } },
  })
  for (const s of allStories) {
    await db.storyView.upsert({
      where: { storyId_userId: { storyId: s.id, userId: session.id } },
      update: {},
      create: { storyId: s.id, userId: session.id },
    })
  }
  return out
}

// ----------------------------------------------------------------------------
// Broadcast channels
// ----------------------------------------------------------------------------

async function buildBroadcastChannels(
  session: { id: string },
  personas: Persona[]
): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = []
  const now = Date.now()
  const minutesAgo = (m: number) => new Date(now - m * 60_000)
  const hoursAgo = (h: number) => new Date(now - h * 60 * 60_000)

  const channelDefs = [
    {
      name: 'Cirkle News',
      description: 'Official Wasl + Cirkle newsroom — product updates, launch announcements, and feature drops.',
      color: '#075E54',
      ownerId: personas[4].id, // Sara Adel — anchor
      messages: [
        { sender: personas[4].id, content: '📣 Wasl 4.0 is live — voice & video calls, verified commits, AI smart replies, and more.', at: hoursAgo(2) },
        { sender: personas[4].id, content: '🎙️ New: on-device voice transcription with the Web Speech API. Your audio never leaves your phone.', at: hoursAgo(1) },
      ],
    },
    {
      name: 'Wasl Engineering',
      description: 'Behind-the-scenes engineering blog from the Wasl dev team.',
      color: '#128C7E',
      ownerId: personas[1].id, // Omar
      messages: [
        { sender: personas[1].id, content: 'How we built zero-cost production on Vercel + Turso + Inngest + Resend — breakdown in the latest post.', at: hoursAgo(5) },
      ],
    },
  ]

  for (const def of channelDefs) {
    let channel = await db.broadcastChannel.findFirst({
      where: { name: def.name },
    })
    if (!channel) {
      channel = await db.broadcastChannel.create({
        data: {
          name: def.name,
          description: def.description,
          avatarColor: def.color,
          ownerId: def.ownerId,
        },
      })
    }
    // Subscribe the user (idempotent).
    await db.broadcastSubscriber.upsert({
      where: {
        channelId_userId: { channelId: channel.id, userId: session.id },
      },
      update: {},
      create: { channelId: channel.id, userId: session.id },
    })
    // Bump subscriber count if zero.
    if (channel.subscriberCount === 0) {
      await db.broadcastChannel.update({
        where: { id: channel.id },
        data: { subscriberCount: 1 },
      })
    }
    // Add messages if missing.
    for (const m of def.messages) {
      const existing = await db.broadcastMessage.findFirst({
        where: { channelId: channel.id, content: m.content },
      })
      if (!existing) {
        await db.broadcastMessage.create({
          data: {
            channelId: channel.id,
            senderId: m.sender,
            content: m.content,
            type: 'text',
            createdAt: m.at,
          },
        })
      }
    }
    out.push({ id: channel.id, name: def.name })
  }
  return out
}

// ----------------------------------------------------------------------------
// Service providers + announcements
// ----------------------------------------------------------------------------

async function buildServiceProviders(
  session: { id: string }
): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = []
  const now = Date.now()
  const hoursAgo = (h: number) => new Date(now - h * 60 * 60_000)

  const providerDefs = [
    {
      name: 'Ministry of Health',
      type: 'government',
      description: 'Official public-health updates from the Egyptian Ministry of Health.',
      color: '#075E54',
      country: '+20',
      messages: [
        { title: 'Flu vaccination campaign', content: 'Free seasonal flu vaccinations available at all primary-care clinics from October 1. Bring your national ID.', type: 'announcement', priority: 5 },
      ],
    },
    {
      name: 'National Bank of Egypt',
      type: 'bank',
      description: 'Official account updates and security alerts from NBE.',
      color: '#128C7E',
      country: '+20',
      messages: [
        { title: 'Scheduled maintenance', content: 'Mobile banking will be unavailable on Saturday 2am-4am for system upgrades.', type: 'notice', priority: 3 },
      ],
    },
    {
      name: 'Cairo Electricity',
      type: 'utility',
      description: 'Planned outages and outage updates for Greater Cairo.',
      color: '#F59E0B',
      country: '+20',
      messages: [
        { title: 'Planned outage — Nasr City', content: 'Power will be off in parts of Nasr City (Building 12 area) tomorrow 9am-11am for transformer maintenance.', type: 'alert', priority: 10 },
      ],
    },
  ]

  for (const def of providerDefs) {
    let provider = await db.serviceProvider.findFirst({
      where: { name: def.name },
    })
    if (!provider) {
      provider = await db.serviceProvider.create({
        data: {
          name: def.name,
          ownerId: session.id, // the demo user "owns" them in this presentation
          type: def.type,
          description: def.description,
          avatarColor: def.color,
          countryCode: def.country,
          status: 'approved',
          verified: true,
          verifiedAt: new Date(),
          canBroadcast: true,
        },
      })
    }
    for (const m of def.messages) {
      const existing = await db.serviceProviderMessage.findFirst({
        where: { providerId: provider.id, title: m.title },
      })
      if (!existing) {
        await db.serviceProviderMessage.create({
          data: {
            providerId: provider.id,
            title: m.title,
            content: m.content,
            type: m.type,
            countryCode: def.country,
            status: 'sent',
            priority: m.priority,
            createdAt: hoursAgo(2),
          },
        })
        // Do NOT mark as read so the announcement badge shows up.
      }
    }
    out.push({ id: provider.id, name: def.name })
  }
  return out
}

// ----------------------------------------------------------------------------
// Chat folders
// ----------------------------------------------------------------------------

async function buildChatFolders(
  session: { id: string },
  convs: { id: string; name: string; folder: string }[]
): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = []
  const folderDefs = [
    { name: 'Work', color: '#128C7E', icon: 'briefcase' },
    { name: 'Family', color: '#EC4899', icon: 'heart' },
    { name: 'Friends', color: '#10B981', icon: 'users' },
  ]
  for (const fd of folderDefs) {
    let folder = await db.chatFolder.findUnique({
      where: { userId_name: { userId: session.id, name: fd.name } },
    })
    if (!folder) {
      folder = await db.chatFolder.create({
        data: { userId: session.id, name: fd.name, color: fd.color, icon: fd.icon },
      })
    }
    // Add conversations whose `folder` field matches.
    const matching = convs.filter((c) => c.folder === fd.name)
    for (const c of matching) {
      const existing = await db.folderConversation.findUnique({
        where: { folderId_conversationId: { folderId: folder.id, conversationId: c.id } },
      })
      if (!existing) {
        await db.folderConversation.create({
          data: { folderId: folder.id, conversationId: c.id },
        })
      }
    }
    out.push({ id: folder.id, name: fd.name })
  }
  return out
}

// ----------------------------------------------------------------------------
// Scheduled messages
// ----------------------------------------------------------------------------

async function buildScheduledMessages(
  session: { id: string },
  convs: { id: string; name: string }[],
  personas: Persona[]
): Promise<number[]> {
  const out: number[] = []
  const now = Date.now()
  const inHours = (h: number) => new Date(now + h * 60 * 60_000)
  // Use the Amira conversation if present.
  const amiraConv = convs[0]
  if (!amiraConv) return out

  const defs = [
    {
      conversationId: amiraConv.id,
      content: 'Reminder: lunch on Friday at 1pm 🍽️',
      scheduledFor: inHours(3),
      repeat: 'none',
    },
    {
      conversationId: amiraConv.id,
      content: '☕ Daily standup in 10 min — see you in Project Falcon 🦅',
      scheduledFor: inHours(24),
      repeat: 'daily',
      repeatUntil: inHours(24 * 30),
    },
  ]
  for (const def of defs) {
    const existing = await db.scheduledMessage.findFirst({
      where: { senderId: session.id, conversationId: def.conversationId, content: def.content },
    })
    if (existing) {
      out.push(1)
      continue
    }
    await db.scheduledMessage.create({
      data: {
        conversationId: def.conversationId,
        senderId: session.id,
        content: def.content,
        type: 'text',
        scheduledFor: def.scheduledFor,
        repeat: def.repeat,
        repeatUntil: def.repeatUntil ?? null,
      },
    })
    out.push(1)
  }
  return out
}

// ----------------------------------------------------------------------------
// Time capsules (additional demo entries across conversations)
// ----------------------------------------------------------------------------

async function buildTimeCapsules(
  session: { id: string },
  convs: { id: string; name: string }[],
  personas: Persona[]
): Promise<number[]> {
  const out: number[] = []
  const now = Date.now()
  const inDays = (d: number) => new Date(now + d * 24 * 60 * 60_000)

  // Layla conversation — letter to self
  if (convs[2]) {
    const existing = await db.timeCapsule.findFirst({
      where: { conversationId: convs[2].id, senderId: personas[2].id },
    })
    if (!existing) {
      await db.timeCapsule.create({
        data: {
          conversationId: convs[2].id,
          senderId: personas[2].id,
          content: 'Dear future us — if you are reading this, I hope the family is well and mama is healthy. Love, Layla.',
          unlockAt: inDays(180),
        },
      })
      out.push(1)
    }
  }
  return out
}

// ----------------------------------------------------------------------------
// Receipt splits (additional demo entries)
// ----------------------------------------------------------------------------

async function buildReceiptSplits(
  session: { id: string },
  convs: { id: string; name: string }[],
  personas: Persona[]
): Promise<number[]> {
  const out: number[] = []
  const now = Date.now()

  // Football Saturday group — split the pitch rental.
  const footballConv = convs.find((c) => c.name.includes('Football Saturday'))
  if (footballConv) {
    const existing = await db.receiptSplit.findFirst({
      where: { conversationId: footballConv.id, creatorId: session.id },
    })
    if (!existing) {
      const split = await db.receiptSplit.create({
        data: {
          conversationId: footballConv.id,
          creatorId: session.id,
          title: 'Pitch rental — Saturday match',
          totalAmount: 200,
          currency: 'EGP',
          splitCount: 4,
        },
      })
      await db.receiptSplitParticipant.create({
        data: { splitId: split.id, userId: session.id, amount: 50, paid: true },
      })
      await db.receiptSplitParticipant.create({
        data: { splitId: split.id, userId: personas[5].id, amount: 50, paid: false },
      })
      out.push(1)
    }
  }
  return out
}

// ----------------------------------------------------------------------------
// School Connect (Task 66)
// ----------------------------------------------------------------------------

import {
  generateSchoolCode as _genSchoolCode,
  generateStudentId as _genStudentId,
  generateJoinCode as _genJoinCode,
} from '@/lib/school'

async function buildSchoolConnect(
  session: { id: string; name: string; username: string },
  personas: Persona[]
): Promise<Array<{ id: string; name: string }>> {
  const out: { id: string; name: string }[] = []

  // ── School 1: Nile International School (verified) ────────────────────
  // The demo user is the school admin (owns it). Three students are
  // pre-registered. The user's own Wasl account is also connected as a PARENT
  // to one of the students (so they can see both admin + parent views).
  {
    const schoolName = 'Nile International School'
    let school = await db.school.findFirst({
      where: { name: schoolName, ownerId: session.id },
    })
    if (!school) {
      const code = 'NIS-2048'
      school = await db.school.create({
        data: {
          name: schoolName,
          code,
          description: 'Verified international school in Nasr City, Cairo. IB curriculum, KG through Grade 12.',
          logoColor: '#1A4A5A',
          city: 'Cairo',
          country: 'Egypt',
          phone: '+20 2 1234 5678',
          email: 'admin@nile-international.edu',
          website: 'https://nile-international.edu',
          ownerId: session.id,
          type: 'international',
          status: 'verified',
          verifiedAt: new Date(),
          verifiedBy: session.id,
          studentCount: 3,
          staffCount: 2,
        },
      })
      // Make the demo user the school admin (membership).
      await db.schoolMembership.create({
        data: {
          schoolId: school.id,
          userId: session.id,
          role: 'admin',
          status: 'active',
        },
      })
    }

    // ── Student 1: Ahmed Mohamed — the demo user is the parent ──────
    {
      const fullName = 'Ahmed Mohamed'
      const studentIdVal = 'NIS-25-08421'
      let student = await db.schoolStudent.findUnique({
        where: { schoolId_studentId: { schoolId: school.id, studentId: studentIdVal } },
      })
      if (!student) {
        // Generate a unique join code
        let jc = '7K4P-92XM'
        for (let i = 0; i < 5; i++) {
          const e = await db.schoolStudent.findUnique({ where: { joinCode: jc } })
          if (!e) break
          jc = _genJoinCode()
        }
        student = await db.schoolStudent.create({
          data: {
            schoolId: school.id,
            studentId: studentIdVal,
            fullName,
            grade: 'Grade 8',
            className: 'Class B',
            enrollmentYear: 2025,
            joinCode: jc,
            joinCodeGeneratedAt: new Date(),
            joinCodeExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
            status: 'active',
          },
        })
      }
      // Connect the demo user as Ahmed's parent (relationship: parent)
      const existing = await db.schoolParentConnection.findUnique({
        where: { schoolStudentId_parentId: { schoolStudentId: student.id, parentId: session.id } },
      })
      if (!existing) {
        await db.schoolParentConnection.create({
          data: {
            schoolStudentId: student.id,
            parentId: session.id,
            relationship: 'parent',
            status: 'confirmed',
            confirmedAt: new Date(),
            joinedViaCode: student.joinCode,
          },
        })
      }
      // Also make sure the demo user has a 'parent' membership at this school
      await db.schoolMembership.upsert({
        where: { schoolId_userId: { schoolId: school.id, userId: session.id } },
        update: {},
        create: {
          schoolId: school.id,
          userId: session.id,
          role: 'parent',
          status: 'active',
        },
      })
    }

    // ── Student 2: Omar Mohamed (no parent connected — demoable join flow) ──
    {
      const fullName = 'Omar Mohamed'
      const studentIdVal = 'NIS-25-08422'
      let student = await db.schoolStudent.findUnique({
        where: { schoolId_studentId: { schoolId: school.id, studentId: studentIdVal } },
      })
      if (!student) {
        let jc = 'B3F8-21K9'
        for (let i = 0; i < 5; i++) {
          const e = await db.schoolStudent.findUnique({ where: { joinCode: jc } })
          if (!e) break
          jc = _genJoinCode()
        }
        student = await db.schoolStudent.create({
          data: {
            schoolId: school.id,
            studentId: studentIdVal,
            fullName,
            grade: 'Grade 9',
            className: 'Class A',
            enrollmentYear: 2025,
            joinCode: jc,
            joinCodeGeneratedAt: new Date(),
            joinCodeExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
            status: 'active',
          },
        })
      }
    }

    // ── Student 3: Sara Adel (also no parent — demoable join flow) ──
    {
      const fullName = 'Sara Adel'
      const studentIdVal = 'NIS-25-08423'
      let student = await db.schoolStudent.findUnique({
        where: { schoolId_studentId: { schoolId: school.id, studentId: studentIdVal } },
      })
      if (!student) {
        let jc = 'M9X2-4P7R'
        for (let i = 0; i < 5; i++) {
          const e = await db.schoolStudent.findUnique({ where: { joinCode: jc } })
          if (!e) break
          jc = _genJoinCode()
        }
        student = await db.schoolStudent.create({
          data: {
            schoolId: school.id,
            studentId: studentIdVal,
            fullName,
            grade: 'Grade 7',
            className: 'Class C',
            enrollmentYear: 2025,
            joinCode: jc,
            joinCodeGeneratedAt: new Date(),
            joinCodeExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
            status: 'active',
          },
        })
      }
    }

    out.push({ id: school.id, name: school.name })
  }

  return out
}
