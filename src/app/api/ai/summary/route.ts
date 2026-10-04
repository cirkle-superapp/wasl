import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { aiChat } from '@/lib/ai'

export const runtime = 'nodejs'

// POST /api/ai/summary — summarize a conversation using AI
// Body: { conversationId, range?: 'all'|'today'|'week', topicDetection?: boolean, sendEmail?: boolean, emailTarget?: 'personal'|'business'|'other_personal'|'other_business' }
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const { conversationId } = body
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  const range: 'all' | 'today' | 'week' = body.range || 'all'
  const topicDetection: boolean = body.topicDetection === true
  const sendEmail: boolean = body.sendEmail === true
  const emailTarget: string = body.emailTarget || 'personal'

  // Build date filter based on range
  let dateFilter: any = undefined
  const now = new Date()
  if (range === 'today') {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    dateFilter = { gte: startOfDay }
  } else if (range === 'week') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000)
    dateFilter = { gte: weekAgo }
  }

  // Get messages (more for topic detection, fewer for simple summary)
  const take = topicDetection ? 100 : 50
  const messages = await db.message.findMany({
    where: {
      conversationId,
      type: { not: 'system' },
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
  })

  if (messages.length === 0) {
    const rangeLabel = range === 'today' ? 'today' : range === 'week' ? 'this week' : 'in this conversation'
    return NextResponse.json({ summary: `No messages found ${rangeLabel}.` })
  }

  // Get conversation + participants for email resolution
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, name: true, email: true, username: true, phone: true },
          },
        },
      },
    },
  })

  // Build conversation text with sender names
  const participants = conversation?.participants || []
  const convoText = messages
    .reverse()
    .map((m) => {
      const p = participants.find((pp) => pp.userId === m.senderId)
      const senderName = m.senderId === session.id
        ? 'Me'
        : p?.user?.name || 'Them'
      return `${senderName}: ${m.content}`
    })
    .join('\n')

  // Build system prompt based on options
  let systemPrompt = 'You are a helpful assistant that summarizes chat conversations. '
  if (topicDetection) {
    systemPrompt += 'Also detect and list the main topics discussed. '
  }
  systemPrompt += 'Provide a concise, well-formatted summary with key points, decisions, and any action items. Keep it under 200 words. Use bullet points.'

  // Add date range context
  let rangeContext = ''
  if (range === 'today') {
    rangeContext = ' (messages from today only)'
  } else if (range === 'week') {
    rangeContext = ' (messages from the past week)'
  }

  const userMessage = `Please summarize this conversation${rangeContext}:\n\n${convoText}`

  const aiResult = await aiChat(systemPrompt, userMessage, 400)

  let summary: string

  if (aiResult) {
    summary = aiResult
  } else {
    // Fallback: rule-based summary
    const totalMsgs = messages.length
    const myMsgs = messages.filter((m) => m.senderId === session.id).length
    const theirMsgs = totalMsgs - myMsgs
    const avgLength = Math.round(messages.reduce((s, m) => s + m.content.length, 0) / totalMsgs)

    const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'this', 'that', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him', 'us', 'them', 'about', 'if', 'so', 'no', 'yes', 'just', 'like', 'get', 'got', 'go', 'going', 'really', 'very', 'more', 'some', 'any', 'all', 'what', 'when', 'where', 'who', 'how', 'why'])
    const wordFreq: Record<string, number> = {}
    for (const m of messages) {
      for (const word of m.content.toLowerCase().split(/\s+/)) {
        const clean = word.replace(/[^a-z0-9]/g, '')
        if (clean.length > 3 && !stopwords.has(clean)) {
          wordFreq[clean] = (wordFreq[clean] || 0) + 1
        }
      }
    }
    const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w)
    const lastMsg = messages[messages.length - 1]
    const lastTime = new Date(lastMsg.createdAt).toLocaleString()

    summary = `📋 Conversation Summary${rangeContext}\n\n` +
      `• ${totalMsgs} messages exchanged (${myMsgs} by you, ${theirMsgs} by them)\n` +
      `• Average message length: ${avgLength} characters\n` +
      `• Key topics: ${topWords.join(', ') || 'general conversation'}\n` +
      `• Last activity: ${lastTime}\n` +
      `• Recent context: "${messages.slice(-3).map((m) => m.content.slice(0, 50)).join('... ')}"`
  }

  // Send email if requested
  let emailSent = false
  let emailError: string | null = null
  if (sendEmail) {
    try {
      const target = resolveEmailTarget(emailTarget, session, participants)
      if (target) {
        // Send via Cirkle Mail ecosystem API
        const res = await fetch(`${process.env.CIRKLE_MAIL_API_URL || 'https://cirkle-mail.vercel.app/api'}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Ecosystem': 'wasl',
          },
          body: JSON.stringify({
            to: target.email,
            from: 'wasl@cirkle.app',
            subject: `📋 Wasl Chat Summary — ${conversation?.name || 'Conversation'}`,
            body: summary,
            ecosystemUser: session.username,
          }),
        })
        emailSent = res.ok
        if (!res.ok) {
          emailError = 'Cirkle Mail API returned an error'
        }
      } else {
        emailError = 'No email address found for the selected target'
      }
    } catch (err) {
      emailError = 'Failed to connect to Cirkle Mail API'
    }
  }

  return NextResponse.json({
    summary,
    range,
    messageCount: messages.length,
    topicDetection,
    emailSent,
    emailError,
  })
}

// Resolve the email address based on the target type
function resolveEmailTarget(
  target: string,
  session: { id: string; email: string | null; username: string },
  participants: any[]
): { email: string; name: string } | null {
  if (target === 'personal') {
    // My personal email
    if (session.email) return { email: session.email, name: 'You' }
    return null
  }

  if (target === 'business') {
    // My business email — resolves from the user's verified businesses
    // For now, use the personal email as fallback (business email lookup
    // would query the Business model for the user's approved businesses)
    if (session.email) return { email: session.email, name: 'You (Business)' }
    return null
  }

  if (target === 'other_personal' || target === 'other_business') {
    // The other party's email
    const other = participants.find((p) => p.userId !== session.id)
    if (other?.user?.email) {
      return {
        email: other.user.email,
        name: other.user.name,
      }
    }
    return null
  }

  return null
}
