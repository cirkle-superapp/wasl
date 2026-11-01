import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST /api/ai/transcribe
// Requests a transcription for a voice message.
//
// Body: { messageId: string }
//
// REAL ASR: uses the platform SDK (`z-ai-web-dev-sdk`) speech-to-text
// (`zai.audio.asr.create`) to decode the voice note's base64 audio. If the
// SDK fails or returns nothing, falls back to a clearly-labelled
// placeholder instead of fabricating text. The result is persisted on the
// `Message.transcription` column so the UI doesn't re-prompt.
//
// Returns:
//   200 → { transcription: string, cached: boolean, engine?: 'asr' }
//   400 → missing/invalid messageId
//   403 → user is not a member of the message's conversation
//   404 → message not found / not a voice message
//   401 → not signed in
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const messageId =
    body && typeof body === 'object' && 'messageId' in body
      ? String((body as { messageId: unknown }).messageId)
      : ''
  if (!messageId) {
    return NextResponse.json({ error: 'messageId required' }, { status: 400 })
  }

  const message = await db.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversationId: true,
      type: true,
      content: true,
      transcription: true,
    },
  })
  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  // Membership check — only participants of the conversation that contains
  // the message can request its transcription. This prevents probing for
  // arbitrary message IDs across the whole DB.
  const participation = await db.participant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: message.conversationId,
        userId: session.id,
      },
    },
    select: { id: true },
  })
  if (!participation) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Only voice messages that are stored as base64 data URLs are eligible
  // for transcription in the UI. Anything else (text, image, audio file
  // URL, etc.) gets a clean 404.
  const isVoiceNote =
    message.type === 'voice' && message.content.startsWith('data:audio')
  if (!isVoiceNote) {
    return NextResponse.json(
      { error: 'Message is not a voice note' },
      { status: 404 }
    )
  }

  // If a transcription was already generated (cached on the DB row), just
  // return it. The `cached` flag lets the client distinguish between a
  // freshly-generated result and a stored one (e.g. to show a slightly
  // different toast).
  if (message.transcription) {
    return NextResponse.json({
      transcription: message.transcription,
      cached: true,
    })
  }

  // ---- Real ASR via z-ai-web-dev-sdk ---------------------------------------
  // The platform SDK (`z-ai-web-dev-sdk`) provides genuine speech-to-text
  // via `zai.audio.asr.create({ file_base64 })`. The voice note's content is
  // a `data:audio/...;base64,XXX` data URL, so the base64 payload is already
  // inline. If the SDK fails (or the audio is undecodable), we fall back to
  // a clearly-labelled placeholder rather than fabricating transcript text.
  const base64Match = /^data:audio\/[a-z0-9.+-]+;base64,(.+)$/i.exec(
    message.content
  )
  if (base64Match) {
    try {
      const mod = await import('z-ai-web-dev-sdk')
      const ZAI = mod.default ?? mod
      const zai = await ZAI.create()
      const response = await zai.audio.asr.create({
        file_base64: base64Match[1],
      })
      const text =
        response?.text && String(response.text).trim().length > 0
          ? String(response.text).trim()
          : null
      if (text) {
        await db.message.update({
          where: { id: message.id },
          data: { transcription: text },
        })
        return NextResponse.json({
          transcription: text,
          cached: false,
          engine: 'asr',
        })
      }
    } catch (e) {
      console.error('[transcribe] ASR failed, using placeholder:', e)
    }
  }

  // ---- Honest fallback placeholder ------------------------------------------
  // ASR unavailable or returned nothing useful. Rather than silently
  // fabricate fake transcript text (which would mislead users into thinking
  // the audio was actually decoded), we return a clearly-labelled
  // placeholder and persist it so the bubble stops showing the "Transcribe"
  // CTA.
  const placeholder =
    '🎤 Voice message — automatic transcription is not available. Play to listen.'

  await db.message.update({
    where: { id: message.id },
    data: { transcription: placeholder },
  })

  return NextResponse.json({
    transcription: placeholder,
    cached: false,
  })
}
