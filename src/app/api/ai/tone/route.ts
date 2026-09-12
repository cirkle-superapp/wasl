import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const body = await req.json()
  const content = body?.content || ''
  const tone = body?.tone || 'professional'
  
  if (!content.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })
  
  let adjusted = content
  
  if (tone === 'professional') {
    adjusted = content
      .replace(/\bhi|hey|yo|sup\b/gi, 'Hello')
      .replace(/\bthx|ty\b/gi, 'Thank you')
      .replace(/\basap\b/gi, 'at your earliest convenience')
      .replace(/\bidk\b/gi, 'I am not certain')
      .replace(/!+/g, '.')
      .replace(/\blol|lmao|haha\b/gi, '')
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
      .replace(/\bvery|really|quite|basically\b/gi, '')
      .replace(/\s+/g, ' ').trim()
  } else if (tone === 'formal') {
    adjusted = content
      .replace(/\bhi|hey\b/gi, 'Greetings')
      .replace(/\bthanks\b/gi, 'Thank you')
      .replace(/!+/g, '.')
  }
  
  return NextResponse.json({ original: content, adjusted, tone })
}
