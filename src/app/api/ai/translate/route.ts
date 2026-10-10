import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { aiChat } from '@/lib/ai'

export const runtime = 'nodejs'

// POST /api/ai/translate — translate a message to the user's language
// Body: { text, targetLang? }
// Uses our self-healing AI router (28 models × 5 providers) — no external
// translation API like Google Translate. The AI does the translation.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, targetLang } = await req.json().catch(() => ({}))
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const target = targetLang || 'English'

  try {
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 7000))
    const result = await Promise.race([
      aiChat(
        `You are a translator. Translate the following text to ${target}. Reply with ONLY the translation, nothing else. Preserve formatting, names, and URLs.`,
        text.slice(0, 2000),
        500,
      ),
      timeoutPromise,
    ])

    if (!result) {
      return NextResponse.json({ error: 'Translation timed out' }, { status: 504 })
    }

    return NextResponse.json({ translation: result.trim(), targetLang: target })
  } catch {
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 })
  }
}
