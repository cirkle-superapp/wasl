import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/ai/summary — summarize a conversation using last N messages
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { conversationId } = await req.json()
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  
  // Get last 50 messages
  const messages = await db.message.findMany({
    where: { conversationId, type: { not: 'system' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  
  if (messages.length === 0) {
    return NextResponse.json({ summary: 'No messages to summarize.' })
  }
  
  // Build a simple summary without external AI (zero-cost, offline)
  const msgs = messages.reverse().map(m => {
    const sender = m.senderId === session.id ? 'You' : 'Them'
    return `${sender}: ${m.content}`
  }).join('\n')
  
  // Rule-based summary (counts, topics, key phrases)
  const totalMsgs = messages.length
  const myMsgs = messages.filter(m => m.senderId === session.id).length
  const theirMsgs = totalMsgs - myMsgs
  const avgLength = Math.round(messages.reduce((s, m) => s + m.content.length, 0) / totalMsgs)
  
  // Extract key topics (most common words, excluding stopwords)
  const stopwords = new Set(['the','a','an','and','or','but','is','are','was','were','i','you','he','she','it','we','they','to','of','in','on','at','for','with','by','from','this','that','have','has','had','do','does','did','will','would','can','could','should','my','your','his','her','its','our','their','me','him','her','us','them','about','if','so','no','yes','just','like','get','got','go','going','really','very','more','some','any','all','what','when','where','who','how','why'])
  const wordFreq: Record<string, number> = {}
  for (const m of messages) {
    for (const word of m.content.toLowerCase().split(/\s+/)) {
      const clean = word.replace(/[^a-z0-9]/g, '')
      if (clean.length > 3 && !stopwords.has(clean)) {
        wordFreq[clean] = (wordFreq[clean] || 0) + 1
      }
    }
  }
  const topWords = Object.entries(wordFreq).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([w]) => w)
  
  // Last activity
  const lastMsg = messages[messages.length - 1]
  const lastTime = new Date(lastMsg.createdAt).toLocaleString()
  
  const summary = `📋 Conversation Summary\n\n` +
    `• ${totalMsgs} messages exchanged (${myMsgs} by you, ${theirMsgs} by them)\n` +
    `• Average message length: ${avgLength} characters\n` +
    `• Key topics: ${topWords.join(', ') || 'general conversation'}\n` +
    `• Last activity: ${lastTime}\n` +
    `• Recent context: "${messages.slice(-3).map(m => m.content.slice(0, 50)).join('... ')}"`
  
  return NextResponse.json({ summary })
}
