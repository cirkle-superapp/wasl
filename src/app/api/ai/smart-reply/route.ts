import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/ai/smart-reply — generate 3 quick reply suggestions
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { conversationId } = await req.json()
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  
  // Get last message from the other person
  const lastMsg = await db.message.findFirst({
    where: { conversationId, senderId: { not: session.id }, type: { not: 'system' } },
    orderBy: { createdAt: 'desc' },
  })
  
  if (!lastMsg) {
    return NextResponse.json({ replies: ['Hey! 👋', 'How are you?', 'What\'s up?'] })
  }
  
  const text = lastMsg.content.toLowerCase().trim()
  const replies: string[] = []
  
  // Greetings
  if (/\b(hi|hello|hey|salam|سلام|اهلا)\b/.test(text)) {
    replies.push('Hey! How are you? 😊', 'Hi! What\'s new?', 'Hello! Good to hear from you 👋')
  }
  // Questions
  else if (text.endsWith('?')) {
    replies.push('Good question — let me think 🤔', 'I\'d say it depends!', 'Hmm, not sure about that')
  }
  // Thanks
  else if (/\b(thanks|thank you|thx|shukran|شكرا)\b/.test(text)) {
    replies.push('You\'re welcome! 🌟', 'No problem at all 👍', 'Anytime!')
  }
  // Agreement
  else if (/\b(yes|yeah|ok|sure|agreed)\b/.test(text)) {
    replies.push('Great! 👍', 'Perfect', 'Awesome, let\'s do it')
  }
  // Disagreement
  else if (/\b(no|nope|nah)\b/.test(text)) {
    replies.push('No worries 🙏', 'That\'s fine', 'I understand')
  }
  // How are you
  else if (/\b(how are you|how r u|kayfak)\b/.test(text)) {
    replies.push('Doing great, thanks! 🙌', 'All good! How about you?', 'I\'m fine, just busy 😊')
  }
  // Default
  else {
    replies.push('Interesting! Tell me more 🤔', 'I hear you 👂', 'That\'s cool! 😄')
  }
  
  // Pad to 3 if needed
  while (replies.length < 3) {
    replies.push('Got it! 👍')
  }
  
  return NextResponse.json({ replies: replies.slice(0, 3) })
}
