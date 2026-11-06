import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { aiProviderStatus } from '@/lib/ai'

export const runtime = 'nodejs'

// GET /api/ai/status — operational dashboard for the consensus AI engine.
// Shows which providers are configured, which models are currently benched
// (self-healing health tracker), and the active jury for each tier.
// NEVER returns key values — only booleans and model names.
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const status = aiProviderStatus()

  return NextResponse.json({
    ok: true,
    ...status,
    hint:
      status.configuredProviders === 0
        ? 'No AI provider keys configured. Add them to .env (NVIDIA_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY, HUGGINGFACE_API_KEY) — the engine picks them up without a restart.'
        : status.benchedCount > 0
          ? 'Some models are temporarily benched by the self-healing health tracker (they will be retried automatically).'
          : 'All configured providers are active.',
  })
}
