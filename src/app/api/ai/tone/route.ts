import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { aiChat } from '@/lib/ai'

export const runtime = 'nodejs'

// POST /api/ai/tone — adjust the tone of a message using AI
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const content = body?.content || ''
  const tone = body?.tone || 'professional'

  if (!content.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })

  const toneMap: Record<string, string> = {
    professional: 'Rewrite this message in a professional, polite tone. Keep it concise.',
    casual: 'Rewrite this message in a casual, relaxed tone. Use contractions.',
    friendly: 'Rewrite this message in a warm, friendly tone. Add an emoji if appropriate.',
    concise: 'Rewrite this message to be as concise as possible. Remove unnecessary words.',
    formal: 'Rewrite this message in a formal, business-appropriate tone.',
  }

  const systemPrompt = `You are a writing assistant. ${toneMap[tone] || toneMap.professional} Return ONLY the rewritten message, nothing else.`

  const aiResult = await aiChat(systemPrompt, content, 200)

  if (aiResult) {
    return NextResponse.json({ original: content, adjusted: aiResult, tone })
  }

  // Fallback: rule-based tone adjustment
  let adjusted = content
  if (tone === 'professional') {
    adjusted = content
      .replace(/\b(hi|hey|yo|sup)\b/gi, 'Hello')
      .replace(/\b(thx|ty)\b/gi, 'Thank you')
      .replace(/\b(asap)\b/gi, 'at your earliest convenience')
      .replace(/\b(idk)\b/gi, 'I am not certain')
      .replace(/!+/g, '.')
      .replace(/\b(lol|lmao|haha)\b/gi, '')
      .replace(/\s+/g, ' ').trim()
  } else if (tone === 'casual') {
    adjusted = content
      .replace(/\bhello\b/gi, 'hey')
      .replace(/\bthank you\b/gi, 'thanks')
      .replace(/\bI am\b/g, "I'm")
  } else if (tone === 'friendly') {
    adjusted = content.replace(/\.\s/g, '! ')
    if (adjusted.length < 100) adjusted += ' 😊'
  } else if (tone === 'concise') {
    adjusted = content
      .replace(/\b(very|really|quite|basically)\b/gi, '')
      .replace(/\s+/g, ' ').trim()
  } else if (tone === 'formal') {
    adjusted = content
      .replace(/\b(hi|hey)\b/gi, 'Greetings')
      .replace(/\bthanks\b/gi, 'Thank you')
      .replace(/!+/g, '.')
  }

  return NextResponse.json({ original: content, adjusted, tone })
}
