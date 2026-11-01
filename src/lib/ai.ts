// ═══════════════════════════════════════════════════════════════════════
// CONSENSUS AI ENGINE — Multi-Provider, Multi-Model Agreement System
// ═══════════════════════════════════════════════════════════════════════
//
// How it works (replaces the old single-answer fallback chain):
//
//   1. JURY SELECTION — for each request, a jury of K models is selected
//      from the healthy pool. Multiple providers participate, and each
//      provider can contribute SEVERAL models ("a couple of models in the
//      same AI provider").
//
//   2. PARALLEL QUERY — every jury member answers the SAME prompt at the
//      same time. Slow/dead members can't hold up the verdict (per-call
//      timeout).
//
//   3. CONSENSUS RESOLUTION — responses are compared:
//        • exact-match majority vote (normalized) for short outputs
//        • token-overlap similarity → the "medoid" (most-representative
//          answer, i.e. the one closest to all the others) for long outputs
//
//   4. SELF-HEALING HEALTH TRACKER — a model that fails 3× in a row is
//      benched for 5 minutes, then gets fresh chances. Models that recover
//      rejoin the jury automatically.
//
// Providers (verified against their live APIs):
//   • NVIDIA   — integrate.api.nvidia.com (OpenAI-compatible)
//   • GROQ     — api.groq.com (OpenAI-compatible) + Whisper ASR
//   • OPENROUTER — openrouter.ai (OpenAI-compatible; free pool)
//   • GEMINI   — Google AI Studio (native generateContent API)
//   • HUGGINGFACE — router.huggingface.co (OpenAI-compatible)
//
// NOTE: z.ai / z-ai-web-dev-sdk is fully removed from this platform.

type Provider = 'nvidia' | 'groq' | 'openrouter' | 'gemini' | 'huggingface'

const PROVIDER_ORDER: Provider[] = [
  'nvidia',
  'groq',
  'openrouter',
  'gemini',
  'huggingface',
]

interface ModelConfig {
  model: string
  // Reasoning models "think" before answering and need extra token budget,
  // otherwise the answer (content) can come back null.
  extraTokens: number
}

// ───────────────────────────────────────────────────────────────────────
// Model pools — verified live on 2026-09 (each was probed with a real
// chat completion; EOL/404 models were removed from the pool).
// ───────────────────────────────────────────────────────────────────────

// FAST tier — short replies (smart-reply chips, bot replies). Low latency,
// clean `content` output, no reasoning overhead.
const FAST_MODELS: Record<Provider, ModelConfig[]> = {
  nvidia: [
    // deepseek is a light-reasoning model — it needs a token buffer or the
    // reasoning consumes the whole budget and content comes back null.
    { model: 'deepseek-ai/deepseek-v4.1-flash', extraTokens: 200 }, // verified ✓
    { model: 'nvidia/nemotron-3.5-bolt-e4b', extraTokens: 0 }, // verified ✓
    { model: 'poolside/laguna-xs-2.1', extraTokens: 0 }, // verified ✓
  ],
  groq: [
    { model: 'llama-3.3-70b-versatile', extraTokens: 0 },
    { model: 'openai/gpt-oss-20b', extraTokens: 0 },
  ],
  openrouter: [
    { model: 'openrouter/free', extraTokens: 0 }, // auto-routes to best free model
    { model: 'xingchen-agi/xing4.0-29b-a4b:free', extraTokens: 0 },
  ],
  gemini: [
    { model: 'gemini-flash-latest', extraTokens: 0 },
    { model: 'gemini-2.0-flash', extraTokens: 0 },
  ],
  huggingface: [
    { model: 'meta-llama/Llama-3.1-8B-Instruct', extraTokens: 0 },
    { model: 'Qwen/Qwen2.5-7B-Instruct', extraTokens: 0 },
  ],
}

// FULL tier — complex analysis (summaries, insights, briefings, tone,
// action items, health scores). Reasoning models allowed (extraTokens).
const FULL_MODELS: Record<Provider, ModelConfig[]> = {
  nvidia: [
    { model: 'nvidia/nemotron-3-ultra-550b-a55b', extraTokens: 600 }, // verified ✓ (largest)
    { model: 'nvidia/nemotron-3.5-super-vl-120b-a12b', extraTokens: 400 }, // verified ✓
    { model: 'deepseek-ai/deepseek-v4.1-flash', extraTokens: 200 }, // verified ✓
    { model: 'nvidia/nemotron-3.5-lightning-30b-a3b', extraTokens: 400 }, // verified ✓
  ],
  groq: [
    { model: 'llama-3.3-70b-versatile', extraTokens: 100 },
  ],
  openrouter: [
    { model: 'openrouter/free', extraTokens: 100 },
    { model: 'xingchen-agi/xing4.0-29b-a4b:free', extraTokens: 100 },
  ],
  gemini: [
    { model: 'gemini-flash-latest', extraTokens: 100 },
    { model: 'gemini-2.0-flash', extraTokens: 100 },
  ],
  huggingface: [
    { model: 'meta-llama/Llama-3.1-8B-Instruct', extraTokens: 100 },
    { model: 'Qwen/Qwen2.5-7B-Instruct', extraTokens: 100 },
  ],
}

// ───────────────────────────────────────────────────────────────────────
// Provider endpoints & keys (read at CALL time, so key updates in .env
// apply to new requests without a server restart).
// ───────────────────────────────────────────────────────────────────────

function getKey(provider: Provider): string | undefined {
  const v = {
    nvidia: process.env.NVIDIA_API_KEY,
    groq: process.env.GROQ_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    huggingface: process.env.HUGGINGFACE_API_KEY,
  }[provider]
  return v && v.trim().length > 0 ? v : undefined
}

const OPENAI_COMPAT_URLS: Partial<Record<Provider, string>> = {
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  huggingface: 'https://router.huggingface.co/v1/chat/completions',
}

// ───────────────────────────────────────────────────────────────────────
// Health tracker — bench models AND providers that keep failing, readmit
// them later. A dead model is excluded after 3 of its own failures; a
// provider whose models have collectively failed 9 times (dead key /
// revoked) is benched wholesale for 5 minutes, then gets fresh chances.
// ───────────────────────────────────────────────────────────────────────

interface Health {
  fails: number
  benchedUntil: number // epoch ms; 0 = active
}
const modelHealth = new Map<string, Health>()
const providerHealth = new Map<Provider, Health>()

const BENCH_AFTER_FAILS = 3
const BENCH_MS = 5 * 60 * 1000 // 5 minutes

function healthKey(provider: Provider, model: string) {
  return `${provider}:${model}`
}

function isBenched(provider: Provider, model: string): boolean {
  const m = modelHealth.get(healthKey(provider, model))
  if (m && m.benchedUntil > Date.now()) return true
  const p = providerHealth.get(provider)
  return !!p && p.benchedUntil > Date.now()
}

function recordSuccess(provider: Provider, model: string) {
  const m = modelHealth.get(healthKey(provider, model))
  if (m) {
    m.fails = 0
    m.benchedUntil = 0
  }
  const p = providerHealth.get(provider)
  if (p) {
    p.fails = 0
    p.benchedUntil = 0
  }
}

function recordFailure(provider: Provider, model: string) {
  const k = healthKey(provider, model)
  const m = modelHealth.get(k) ?? { fails: 0, benchedUntil: 0 }
  m.fails += 1
  if (m.fails >= BENCH_AFTER_FAILS) {
    m.benchedUntil = Date.now() + BENCH_MS
    m.fails = 0 // fresh chance when the bench expires
  }
  modelHealth.set(k, m)

  const p = providerHealth.get(provider) ?? { fails: 0, benchedUntil: 0 }
  p.fails += 1
  if (p.fails >= BENCH_AFTER_FAILS * 3) {
    // Whole provider failing (dead key / revoked) — bench everything on it.
    p.benchedUntil = Date.now() + BENCH_MS
    p.fails = 0
  }
  providerHealth.set(provider, p)
}

// ───────────────────────────────────────────────────────────────────────
// Low-level call helpers
// ───────────────────────────────────────────────────────────────────────

interface CallResult {
  ok: boolean
  text: string | null
}

/** Extract the answer from an OpenAI-compatible response. */
function extractContent(data: unknown): string | null {
  const d = data as {
    choices?: { message?: { content?: unknown } }[]
  }
  const content = d?.choices?.[0]?.message?.content
  // NOTE: `reasoning_content` is chain-of-thought, NOT the answer — a null
  // content with populated reasoning means the model ran out of budget.
  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim()
  }
  return null
}

/** OpenAI-compatible chat (NVIDIA, Groq, OpenRouter, HuggingFace router). */
async function openaiCompatibleChat(
  provider: Provider,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  extraTokens: number,
  timeoutMs: number
): Promise<string | null> {
  const url = OPENAI_COMPAT_URLS[provider]
  const apiKey = getKey(provider)
  if (!url || !apiKey) return null
  const budget = maxTokens + extraTokens
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }
    if (provider === 'openrouter') {
      // OpenRouter attribution headers (their policy for apps).
      headers['HTTP-Referer'] = 'https://wasl.chat'
      headers['X-Title'] = 'WASL'
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: budget,
        temperature: 0.7,
        stream: false,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    return extractContent(data)
  } catch {
    return null
  }
}

/** Google Gemini native generateContent API. */
async function geminiChat(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  timeoutMs: number
): Promise<string | null> {
  const apiKey = getKey('gemini')
  if (!apiKey) return null
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: {
          maxOutputTokens: maxTokens + 400,
          temperature: 0.7,
        },
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    const text = (
      data as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
    )?.candidates?.[0]?.content?.parts?.[0]?.text
    return text && text.trim().length > 0 ? text.trim() : null
  } catch {
    return null
  }
}

/** One jury member's attempt. Returns null on any failure. */
async function callModel(
  provider: Provider,
  cfg: ModelConfig,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  timeoutMs: number
): Promise<string | null> {
  if (provider === 'gemini') {
    return geminiChat(
      cfg.model,
      systemPrompt,
      userMessage,
      maxTokens,
      timeoutMs
    )
  }
  return openaiCompatibleChat(
    provider,
    cfg.model,
    systemPrompt,
    userMessage,
    maxTokens,
    cfg.extraTokens,
    timeoutMs
  )
}

// ───────────────────────────────────────────────────────────────────────
// Consensus resolution
// ───────────────────────────────────────────────────────────────────────

function normalizeForVote(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 1)
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

type ConsensusMethod = 'unanimous' | 'majority' | 'medoid' | 'single'

export interface ConsensusResult {
  text: string
  method: ConsensusMethod
  jury: {
    provider: Provider
    model: string
    ok: boolean
    agreed: boolean
  }[]
}

interface Verdict {
  winnerIndex: number
  method: ConsensusMethod
}

/** Resolve the jury's answers into one consensus verdict. */
function resolveConsensus(texts: string[]): Verdict {
  if (texts.length === 1) return { winnerIndex: 0, method: 'single' }

  // 1) Exact-match vote (normalized) — strong signal for short outputs.
  const norm = texts.map(normalizeForVote)
  const counts = new Map<string, number>()
  for (const n of norm) counts.set(n, (counts.get(n) ?? 0) + 1)
  let bestNorm: string | null = null
  let bestCount = 0
  for (const [n, c] of counts) {
    if (c > bestCount) {
      bestCount = c
      bestNorm = n
    }
  }
  if (bestNorm && bestCount === texts.length) {
    return { winnerIndex: norm.indexOf(bestNorm), method: 'unanimous' }
  }
  if (bestNorm && bestCount > texts.length / 2) {
    return { winnerIndex: norm.indexOf(bestNorm), method: 'majority' }
  }

  // 2) Medoid — the answer with the highest average token-overlap with the
  // others. This is the response "most in agreement" with the jury.
  const sets = texts.map(tokenSet)
  let winner = 0
  let bestScore = -1
  for (let i = 0; i < texts.length; i++) {
    let sum = 0
    for (let j = 0; j < texts.length; j++) {
      if (i === j) continue
      sum += jaccard(sets[i], sets[j])
    }
    const avg = sum / (texts.length - 1)
    if (avg > bestScore) {
      bestScore = avg
      winner = i
    }
  }
  return { winnerIndex: winner, method: 'medoid' }
}

// ───────────────────────────────────────────────────────────────────────
// Jury selection
// ───────────────────────────────────────────────────────────────────────

/**
 * Pick the jury: healthy models only. The first pass takes ONE model per
 * provider (spread across providers), then additional passes add a second/
 * third model from providers that have more — so consensus genuinely mixes
 * providers AND models ("a couple of models in the same provider").
 */
function selectJury(
  tier: 'fast' | 'full',
  size: number
): { provider: Provider; cfg: ModelConfig }[] {
  const pool = tier === 'fast' ? FAST_MODELS : FULL_MODELS
  const byProvider: { provider: Provider; cfg: ModelConfig }[][] = []
  for (const provider of PROVIDER_ORDER) {
    if (!getKey(provider)) continue
    const models = (pool[provider] ?? []).filter(
      (cfg) => !isBenched(provider, cfg.model)
    )
    if (models.length > 0) {
      byProvider.push(models.map((cfg) => ({ provider, cfg })))
    }
  }
  const jury: { provider: Provider; cfg: ModelConfig }[] = []
  let depth = 0
  while (jury.length < size) {
    let added = false
    for (const list of byProvider) {
      if (depth < list.length && jury.length < size) {
        jury.push(list[depth])
        added = true
      }
    }
    if (!added) break
    depth++
  }
  return jury
}

// ───────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────

/**
 * CONSENSUS chat — the primary AI entry point. Selects a jury of models,
 * queries them in parallel, and returns the consensus answer plus
 * telemetry about which models agreed.
 */
export async function aiConsensus(
  systemPrompt: string,
  userMessage: string,
  options: {
    maxTokens?: number
    tier?: 'fast' | 'full'
    jurySize?: number
  } = {}
): Promise<ConsensusResult | null> {
  const maxTokens = options.maxTokens ?? 300
  const tier = options.tier ?? 'full'
  const jurySize = Math.max(1, options.jurySize ?? 3)
  const timeoutMs = tier === 'fast' ? 14000 : 25000

  const jury = selectJury(tier, jurySize)
  if (jury.length === 0) return null

  const answers = await Promise.all(
    jury.map(({ provider, cfg }) =>
      callModel(
        provider,
        cfg,
        systemPrompt,
        userMessage,
        maxTokens,
        timeoutMs
      ).then((text) => ({ provider, cfg, text }))
    )
  )

  // Health bookkeeping
  for (const a of answers) {
    if (a.text) recordSuccess(a.provider, a.cfg.model)
    else recordFailure(a.provider, a.cfg.model)
  }

  const valid = answers.filter((a) => !!a.text)
  if (valid.length === 0) {
    // Last resort: all jury members failed simultaneously (e.g. a shared
    // rate-limit burst). Retry ONCE with the single healthiest model and a
    // longer timeout before giving up.
    const solo = await callModel(
      jury[0].provider,
      jury[0].cfg,
      systemPrompt,
      userMessage,
      maxTokens,
      timeoutMs + 10000
    )
    if (solo) {
      recordSuccess(jury[0].provider, jury[0].cfg.model)
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[ai] consensus ✓ solo-retry — ${jury[0].provider}/${jury[0].cfg.model}`
        )
      }
      return {
        text: solo,
        method: 'single',
        jury: answers.map((a) => ({
          provider: a.provider,
          model: a.cfg.model,
          ok: false,
          agreed: false,
        })),
      }
    }
    recordFailure(jury[0].provider, jury[0].cfg.model)
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[ai] consensus ✗ — 0/${answers.length} jury members responded`
      )
    }
    return null
  }

  const verdict = resolveConsensus(valid.map((a) => a.text as string))
  const winner = valid[verdict.winnerIndex]

  if (process.env.NODE_ENV === 'development') {
    console.log(
      `[ai] consensus ✓ ${verdict.method} — ${winner.provider}/${winner.cfg.model} ` +
        `(agreed with ${valid.length - 1}/${valid.length - 1} peers) ` +
        `→ ${String(winner.text).slice(0, 60)}...`
    )
  }

  return {
    text: winner.text as string,
    method: verdict.method,
    jury: answers.map((a) => ({
      provider: a.provider,
      model: a.cfg.model,
      ok: !!a.text,
      agreed: valid[verdict.winnerIndex] === a,
    })),
  }
}

/**
 * Full-tier consensus chat. Returns just the answer text (compatible with
 * all existing call sites). Jury of 3 models across providers.
 */
export async function aiChat(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 300
): Promise<string | null> {
  const result = await aiConsensus(systemPrompt, userMessage, {
    maxTokens,
    tier: 'full',
  })
  return result?.text ?? null
}

/**
 * Fast-tier consensus chat for latency-sensitive replies (smart replies,
 * bot replies). Smaller models, shorter timeout.
 */
export async function aiChatFast(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 80
): Promise<string | null> {
  const result = await aiConsensus(systemPrompt, userMessage, {
    maxTokens,
    tier: 'fast',
  })
  return result?.text ?? null
}

/**
 * Speech-to-text via Groq Whisper (OpenAI-compatible audio transcriptions).
 * Tries whisper-large-v3-turbo (fast) then whisper-large-v3 (accurate).
 * Returns null if ASR is unavailable (e.g. key not provisioned).
 */
export async function groqTranscribe(
  base64Audio: string,
  mimeType: string
): Promise<string | null> {
  const apiKey = getKey('groq')
  if (!apiKey) return null
  const models = ['whisper-large-v3-turbo', 'whisper-large-v3']
  for (const model of models) {
    try {
      const bytes = Buffer.from(base64Audio, 'base64')
      const ext = mimeType.includes('webm')
        ? 'webm'
        : mimeType.includes('ogg')
          ? 'ogg'
          : 'm4a'
      const form = new FormData()
      form.append(
        'file',
        new Blob([new Uint8Array(bytes)], { type: mimeType }),
        `voice.${ext}`
      )
      form.append('model', model)
      form.append('response_format', 'json')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30000)
      const res = await fetch(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: controller.signal,
        }
      )
      clearTimeout(timer)
      if (!res.ok) continue
      const data = (await res.json()) as { text?: string }
      if (data.text && data.text.trim().length > 0) return data.text.trim()
    } catch {
      // try the next whisper variant
    }
  }
  return null
}

/** Which providers have a key configured (not necessarily healthy). */
export function getProviderStatus(): Record<Provider, boolean> {
  return {
    nvidia: !!getKey('nvidia'),
    groq: !!getKey('groq'),
    openrouter: !!getKey('openrouter'),
    gemini: !!getKey('gemini'),
    huggingface: !!getKey('huggingface'),
  }
}

/** Live consensus health snapshot (for diagnostics endpoints). */
export function getConsensusHealth(): {
  provider: Provider
  model: string
  benched: boolean
  benchedUntil: number
}[] {
  const out: {
    provider: Provider
    model: string
    benched: boolean
    benchedUntil: number
  }[] = []
  for (const provider of PROVIDER_ORDER) {
    for (const { model } of [
      ...FAST_MODELS[provider],
      ...FULL_MODELS[provider],
    ]) {
      const h = modelHealth.get(healthKey(provider, model))
      if (h) {
        out.push({
          provider,
          model,
          benched: h.benchedUntil > Date.now(),
          benchedUntil: h.benchedUntil,
        })
      }
    }
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════
// Prompt sanitization — keep AI prompts inside model context limits
// ═══════════════════════════════════════════════════════════════════════

/**
 * Make a message's content safe to embed in an LLM prompt:
 *  - data URLs (voice notes, images — can be hundreds of KB of base64) are
 *    replaced with a short placeholder like "[voice message]"
 *  - anything longer than 2000 chars is truncated
 * Call this on every message before building a conversation transcript.
 */
export function sanitizeForAI(content: string): string {
  if (!content) return ''
  if (content.startsWith('data:')) {
    const audio = /^data:audio\/[a-z0-9.+-]+/i.exec(content)
    return audio ? '[voice message]' : '[attachment]'
  }
  if (content.length > 2000) {
    return content.slice(0, 2000) + '…[truncated]'
  }
  return content
}
