import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { aiChat } from '@/lib/ai'

export const runtime = 'nodejs'

// POST — extract action items from conversation using AI
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { conversationId } = await req.json()
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  const messages = await db.message.findMany({
    where: { conversationId, type: { not: 'system' } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  if (messages.length === 0) return NextResponse.json({ items: [] })

  // Build conversation text
  const convoText = messages
    .reverse()
    .map((m) => {
      const sender = m.senderId === session.id ? 'Me' : 'Them'
      return `${sender}: ${m.content}`
    })
    .join('\n')

  const systemPrompt = `You are a helpful assistant that extracts action items from chat conversations. Identify tasks, todos, deadlines, decisions, and follow-ups. Return a JSON array of objects with "text" (the action item), "type" (todo, schedule, action, finance, or decision), and "sender" (Me or Them). Return ONLY the JSON array, no other text. Maximum 10 items.`

  const userMessage = `Extract action items from this conversation:\n\n${convoText}`

  const aiResult = await aiChat(systemPrompt, userMessage, 500)

  if (aiResult) {
    try {
      // Try to parse the JSON response
      const jsonMatch = aiResult.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const items = JSON.parse(jsonMatch[0])
        if (Array.isArray(items) && items.length > 0) {
          return NextResponse.json({ items: items.slice(0, 10) })
        }
      }
    } catch {
      // Fall through to rule-based
    }
  }

  // Fallback: rule-based action item extraction
  const items: { text: string; type: string; sender: string }[] = []
  const actionPatterns = [
    { pattern: /\b(todo|to-do|task|need to|should|must|have to|don't forget|remember to|make sure)\b/i, type: 'todo' },
    { pattern: /\b(schedule|meeting|call|appointment|deadline|due date|by monday|by friday|by tomorrow)\b/i, type: 'schedule' },
    { pattern: /\b(send|share|forward|email|attach|upload|deliver)\b/i, type: 'action' },
    { pattern: /\b(pay|buy|order|purchase|transfer|invoice|receipt|split)\b/i, type: 'finance' },
    { pattern: /\b(decide|choose|pick|select|confirm|approve)\b/i, type: 'decision' },
  ]

  for (const m of messages.reverse()) {
    for (const { pattern, type } of actionPatterns) {
      if (pattern.test(m.content)) {
        const sender = m.senderId === session.id ? 'Me' : 'Them'
        items.push({ text: m.content.slice(0, 150), type, sender })
        break
      }
    }
  }

  return NextResponse.json({ items: items.slice(0, 10) })
}
