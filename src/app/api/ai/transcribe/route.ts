import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { groqTranscribe } from '@/lib/ai'

export const runtime = 'nodejs'

// POST /api/ai/transcribe
// Requests a transcription for a voice message.
//
// Body: { messageId: string }
//
// REAL ASR: uses Groq's Whisper (`whisper-large-v3-turbo` then
// `whisper-large-v3`) via the consensus AI engine's ASR helper to decode
// the voice note's base64 audio. If ASR fails or returns nothing, falls
// back to a clearly-labelled placeholder instead of fabricating text. The
// result is persisted on the `Message.transcription` column so the UI
// doesn't re-prompt.
//
// Returns:
//   200 → { transcription: string, cached: boolean, engine?: 'whisper' }
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

  // ---- Real ASR via Groq Whisper --------------------------------------------
  // The consensus AI engine exposes `groqTranscribe`, which posts the voice
  // note (a `data:audio/...;base64,XXX` data URL) to Groq's
  // whisper-large-v3-turbo / whisper-large-v3 transcription endpoint. If
  // ASR fails (key not provisioned, undecodable audio), we fall back to a
  // clearly-labelled placeholder rather than fabricating transcript text.
  const base64Match = /^data:audio\/[a-z0-9.+-]+;base64,(.+)$/i.exec(
    message.content
  )
  if (base64Match) {
    const mimeMatch = /^data:(audio\/[a-z0-9.+-]+)[;,]/i.exec(message.content)
    const mimeType = mimeMatch ? mimeMatch[1] : 'audio/webm'
    try {
      const text = await groqTranscribe(base64Match[1], mimeType)
      if (text) {
        await db.message.update({
          where: { id: message.id },
          data: { transcription: text },
        })
        return NextResponse.json({
          transcription: text,
          cached: false,
          engine: 'whisper',
        })
      }
    } catch (e) {
      console.error('[transcribe] Whisper ASR failed:', e)
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
