import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { aiChatFast } from '@/lib/ai'

export const runtime = 'nodejs'

// POST /api/ai/smart-reply — generate 3 quick reply suggestions using AI
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { conversationId } = await req.json()
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  // Get last few messages for context
  const recentMsgs = await db.message.findMany({
    where: { conversationId, type: { not: 'system' } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { content: true, senderId: true },
  })

  if (recentMsgs.length === 0) {
    return NextResponse.json({ replies: ['Hey! 👋', 'How are you?', "What's up?"] })
  }

  const lastMsg = recentMsgs[0]
  if (lastMsg.senderId === session.id) {
    // No message from the other person yet
    return NextResponse.json({ replies: ['Hey! 👋', 'How are you?', "What's up?"] })
  }

  // Build conversation context
  const context = recentMsgs
    .reverse()
    .map((m) => `${m.senderId === session.id ? 'Me' : 'Them'}: ${m.content}`)
    .join('\n')

  const systemPrompt = `You are a helpful assistant generating 3 short, natural chat reply suggestions. Each reply should be concise (under 50 characters), friendly, and conversational. Return exactly 3 replies, one per line, no numbering or bullets. Keep it casual like a chat app.`

  const userMessage = `Here's the recent conversation:\n${context}\n\nGenerate 3 short reply suggestions for "Me" to send next. Each on its own line:`

  const aiResult = await aiChatFast(systemPrompt, userMessage, 100)

  if (aiResult) {
    const replies = aiResult
      .split('\n')
      .map((r) => r.replace(/^\d+[\.\)]\s*/, '').replace(/^[-•]\s*/, '').trim())
      .filter((r) => r.length > 0 && r.length < 100)
      .slice(0, 3)

    if (replies.length >= 2) {
      return NextResponse.json({ replies })
    }
  }

  // Fallback: rule-based
  const text = lastMsg.content.toLowerCase().trim()
  let replies: string[] = []

  if (/\b(hi|hello|hey|salam|سلام|اهلا)\b/.test(text)) {
    replies = ['Hey! How are you? 😊', "Hi! What's new?", 'Hello! Good to hear from you 👋']
  } else if (text.endsWith('?')) {
    replies = ['Good question — let me think 🤔', "I'd say it depends!", 'Hmm, not sure about that']
  } else if (/\b(thanks|thank you|thx|shukran|شكرا)\b/.test(text)) {
    replies = ["You're welcome! 🌟", 'No problem at all 👍', 'Anytime!']
  } else if (/\b(yes|yeah|ok|sure|agreed)\b/.test(text)) {
    replies = ['Great! 👍', 'Perfect', "Awesome, let's do it"]
  } else if (/\b(no|nope|nah)\b/.test(text)) {
    replies = ['No worries 🙏', "That's fine", 'I understand']
  } else {
    replies = ['Interesting! Tell me more 🤔', 'I hear you 👂', "That's cool! 😄"]
  }

  while (replies.length < 3) replies.push('Got it! 👍')
  return NextResponse.json({ replies: replies.slice(0, 3) })
}
