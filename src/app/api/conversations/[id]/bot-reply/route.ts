import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { aiChatFast } from '@/lib/ai'

export const runtime = 'nodejs'

// POST /api/conversations/[id]/bot-reply
// Generates a contextual reply from the demo counterparty (a "companion bot")
// using real AI (Groq/OpenRouter/Gemini/NVIDIA with fallback).
// Only works for 1-on-1 conversations where the other participant's phone
// matches the demo pattern (+20100…).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const participation = await db.participant.findUnique({
    where: {
      conversationId_userId: { conversationId: id, userId: session.id },
    },
  })
  if (!participation) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find the other participant (the bot)
  const conv = await db.conversation.findUnique({
    where: { id },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, name: true, phone: true, avatarColor: true },
          },
        },
      },
    },
  })
  if (!conv || conv.isGroup) {
    return NextResponse.json(
      { error: 'Bot replies are only available in 1-on-1 chats' },
      { status: 400 }
    )
  }
  const other = conv.participants.find((p) => p.userId !== session.id)
  if (!other) {
    return NextResponse.json({ error: 'No counterparty' }, { status: 400 })
  }
  if (!other.user.phone || !other.user.phone.startsWith('+20100')) {
    return NextResponse.json(
      { error: 'Counterparty is not a demo bot' },
      { status: 400 }
    )
  }

  // Fetch the last few messages for context
  const recent = await db.message.findMany({
    where: { conversationId: id, type: { not: 'system' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { content: true, senderId: true },
  })

  const lastFromMe = recent.find((m) => m.senderId === session.id)?.content || ''

  // Try AI-generated reply first
  const contextMessages = recent
    .reverse()
    .map((m) => `${m.senderId === session.id ? 'User' : other.user.name}: ${m.content}`)
    .join('\n')

  const systemPrompt = `You are ${other.user.name}, a friendly person chatting on Wasl (a messaging app). Keep replies short (1-2 sentences), casual, and natural. Be warm and conversational. Don't use markdown formatting.`

  const userMessage = `Recent conversation:\n${contextMessages}\n\nGenerate a short, natural reply from ${other.user.name}:`

  const aiReply = await aiChatFast(systemPrompt, userMessage, 60)

  // Use AI reply if available, otherwise fall back to rule-based
  const reply = aiReply || generateFallbackReply(lastFromMe)

  const message = await db.message.create({
    data: {
      conversationId: id,
      senderId: other.user.id,
      content: reply,
      type: 'text',
      status: 'sent',
    },
    include: {
      reactions: { select: { id: true, userId: true, emoji: true } },
    },
  })
  await db.conversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  })
  await db.message.update({
    where: { id: message.id },
    data: { status: 'read' },
  })

  return NextResponse.json({
    message: {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      type: message.type,
      status: 'read',
      createdAt: message.createdAt,
      replyToId: message.replyToId,
      commitId: message.commitId,
      starred: false,
      reactions: [],
    },
  })
}

// Rule-based fallback reply generator (used when AI is unavailable)
function generateFallbackReply(userText: string): string {
  const t = userText.toLowerCase().trim()
  if (!t) return 'Hey! 👋'

  if (/\b(hi|hello|hey|salam|سلام|اهلا|أهلا|مرحبا)\b/.test(t)) {
    return `Hey! Good to hear from you 😊 How's your day going?`
  }
  if (/\b(how are you|how r u|kayfak|كيفك|عامل ايه)\b/.test(t)) {
    return `I'm doing great, thanks for asking! 🙌 What about you?`
  }
  if (/\b(thanks|thank you|thx|shukran|شكرا)\b/.test(t)) {
    return `You're welcome! 🌟 Anything else I can help with?`
  }
  if (t.endsWith('?')) {
    return `That's a good question 🤔 Let me think… I'd say it depends on the details. What do you think?`
  }
  if (/\b(price|cost|how much|deal|commit|agreement|سعر|كم)\b/.test(t)) {
    return `Sounds like a deal 💼 We could turn that into a Commit to make it official — just tap the shield icon in the composer!`
  }
  if (/\b(bye|goodbye|see you|talk later|مع السلامة)\b/.test(t)) {
    return `Talk to you soon! 👋`
  }
  if (/^(yes|yeah|yep|ok|okay|sure|اه|نعم|تمام)\b/.test(t)) {
    return `Great! 👍`
  }
  if (/^(no|nope|nah|لا)\b/.test(t)) {
    return `No worries — let me know if you change your mind 🙏`
  }
  if (/^[\p{Emoji}\s]+$/u.test(t)) {
    return `😂`
  }

  const fallbacks = [
    `That's interesting! Tell me more 🤔`,
    `I hear you 👂 What happened next?`,
    `Makes sense 🤝`,
    `Got it! 👍`,
    `Haha, nice one 😄`,
    `Oh really? I didn't know that 🤓`,
    `Totally agree with you 💯`,
  ]
  return fallbacks[userText.length % fallbacks.length]
}
