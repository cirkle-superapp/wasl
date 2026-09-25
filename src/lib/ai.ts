// ═══════════════════════════════════════════════════════════════════════
// Unified AI Router — Self-Healing Multi-Model Consensus (Task 78)
// ═══════════════════════════════════════════════════════════════════════
//
// When a model fails, the router automatically tries ANOTHER MODEL on the
// SAME provider, then falls to the NEXT provider. This creates a 2D
// fallback grid:
//
//   Provider 1 (NVIDIA):
//     ├── model A → if fails → model B → if fails → model C
//     ↓ (all models failed)
//   Provider 2 (Groq):
//     ├── model A → if fails → model B
//     ↓
//   Provider 3 (OpenRouter):
//     ├── model A → if fails → model B → if fails → model C
//     ↓
//   Provider 4 (Gemini):
//     ├── model A
//     ↓
//   Provider 5 (HuggingFace):
//     └── model A
//
// Usage:
//   import { aiChat, aiChatFast } from '@/lib/ai'
//   const reply = await aiChatFast('You are friendly.', 'Hello!')
//   const summary = await aiChat('Summarize this.', longText, 400)

type Provider = 'nvidia' | 'groq' | 'openrouter' | 'gemini' | 'huggingface'

// Each provider has MULTIPLE models per tier. If one model fails (EOL, 404,
// rate-limit, etc.), the router tries the next model on the same provider.
const PROVIDER_ORDER: Provider[] = ['nvidia', 'groq', 'openrouter', 'gemini', 'huggingface']

// Fast models — for short chat replies (1-2 sentences). Multiple models per
// provider, ordered by preference (first = best, last = fallback).
const FAST_MODELS: Record<Provider, { model: string; extraTokens: number }[]> = {
  nvidia: [
    { model: 'google/gemma-3-4b-it', extraTokens: 0 },
    { model: 'ibm/granite-3.0-8b-instruct', extraTokens: 0 },
    { model: 'google/gemma-3-12b-it', extraTokens: 0 },
    { model: 'deepseek-ai/deepseek-v4.1-flash', extraTokens: 0 },
  ],
  groq: [
    { model: 'llama-3.1-8b-instant', extraTokens: 0 },
    { model: 'llama-3.3-70b-versatile', extraTokens: 0 },
    { model: 'gemma2-9b-it', extraTokens: 0 },
  ],
  openrouter: [
    { model: 'qwen/qwen3.8-27b:free', extraTokens: 0 },
    { model: 'liquid/lfm-2.5-2.6b:free', extraTokens: 0 },
    { model: 'inclusionai/ling-3.0-flash-sante:free', extraTokens: 0 },
  ],
  gemini: [
    { model: 'gemini-flash-latest', extraTokens: 0 },
    { model: 'gemini-2.0-flash', extraTokens: 0 },
    { model: 'gemini-1.5-flash', extraTokens: 0 },
  ],
  huggingface: [
    { model: 'meta-llama/Llama-3.2-1B', extraTokens: 0 },
    { model: 'distilgpt2', extraTokens: 0 },
  ],
}

// Full models — for complex analysis (summary, action items, tone).
const FULL_MODELS: Record<Provider, { model: string; extraTokens: number }[]> = {
  nvidia: [
    { model: 'deepseek-ai/deepseek-v4.1-flash', extraTokens: 200 },
    { model: '01-ai/yi-large', extraTokens: 200 },
    { model: 'google/gemma-3-12b-it', extraTokens: 200 },
    { model: 'ibm/granite-3.0-8b-instruct', extraTokens: 200 },
  ],
  groq: [
    { model: 'llama-3.3-70b-versatile', extraTokens: 0 },
    { model: 'llama-3.1-8b-instant', extraTokens: 0 },
  ],
  openrouter: [
    { model: 'qwen/qwen3.8-27b:free', extraTokens: 0 },
    { model: 'nvidia/nemotron-3.5-lightning:free', extraTokens: 0 },
    { model: 'thinkingmachines/inkling-small:free', extraTokens: 0 },
  ],
  gemini: [
    { model: 'gemini-flash-latest', extraTokens: 0 },
    { model: 'gemini-2.0-flash', extraTokens: 0 },
  ],
  huggingface: [
    { model: 'meta-llama/Llama-3.2-1B', extraTokens: 0 },
    { model: 'distilgpt2', extraTokens: 0 },
  ],
}

const PROVIDER_URLS: Record<Provider, { url: string; key: string | undefined }> = {
  nvidia: {
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    key: process.env.NVIDIA_API_KEY,
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: process.env.GROQ_API_KEY,
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: process.env.OPENROUTER_API_KEY,
  },
  gemini: { url: '', key: process.env.GEMINI_API_KEY },
  huggingface: {
    url: 'https://api-inference.huggingface.co/models',
    key: process.env.HUGGINGFACE_API_KEY,
  },
}

// ── OpenAI-compatible chat (NVIDIA, Groq, OpenRouter) ─────────────────
async function openaiCompatibleChat(
  url: string,
  apiKey: string | undefined,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  extraTokens: number
): Promise<string | null> {
  if (!apiKey) return null
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens + extraTokens,
        temperature: 0.7,
        stream: false,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    return content ? String(content).trim() : null
  } catch {
    return null
  }
}

// ── Gemini native API ──────────────────────────────────────────────────
async function geminiChat(
  apiKey: string | undefined,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<string | null> {
  if (!apiKey) return null
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    return text ? String(text).trim() : null
  } catch {
    return null
  }
}

// ── HuggingFace inference API ──────────────────────────────────────────
async function huggingfaceChat(
  apiKey: string | undefined,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<string | null> {
  if (!apiKey) return null
  try {
    const url = `${PROVIDER_URLS.huggingface.url}/${model}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs: `${systemPrompt}\n\nUser: ${userMessage}\nAssistant:`,
        parameters: {
          max_new_tokens: maxTokens,
          temperature: 0.7,
          return_full_text: false,
        },
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = await res.json()
    if (Array.isArray(data) && data[0]?.generated_text) {
      return String(data[0].generated_text).trim()
    }
    return null
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Self-healing router — tries MULTIPLE MODELS per provider before giving up
// ═══════════════════════════════════════════════════════════════════════

/**
 * Try a single model on a provider. Returns null on failure (so the caller
 * can try the next model). Dispatches to the right API format per provider.
 */
async function tryModel(
  provider: Provider,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  extraTokens: number
): Promise<string | null> {
  const urls = PROVIDER_URLS[provider]
  if (!urls.key) return null
  if (provider === 'gemini') {
    return geminiChat(urls.key, model, systemPrompt, userMessage, maxTokens)
  }
  if (provider === 'huggingface') {
    return huggingfaceChat(urls.key, model, systemPrompt, userMessage, maxTokens)
  }
  return openaiCompatibleChat(urls.url, urls.key, model, systemPrompt, userMessage, maxTokens, extraTokens)
}

/**
 * Self-healing AI chat — tries every model on every provider in sequence.
 * If a model fails (404, EOL, rate-limit, network error), it automatically
 * tries the NEXT MODEL on the SAME provider, then falls to the NEXT PROVIDER.
 *
 * This ensures maximum resilience — even if 3 out of 5 providers are down,
 * the app still gets AI responses from the remaining 2.
 */
async function selfHealingChat(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  modelTier: 'fast' | 'full'
): Promise<string | null> {
  const models = modelTier === 'fast' ? FAST_MODELS : FULL_MODELS

  for (const provider of PROVIDER_ORDER) {
    const providerModels = models[provider]
    if (!providerModels || providerModels.length === 0) continue
    const urls = PROVIDER_URLS[provider]
    if (!urls.key) continue

    // Try EACH model on this provider — if one fails, try the next model
    for (const cfg of providerModels) {
      const result = await tryModel(
        provider,
        cfg.model,
        systemPrompt,
        userMessage,
        maxTokens,
        cfg.extraTokens
      )
      if (result) {
        // Log which provider+model succeeded (for debugging)
        if (process.env.NODE_ENV === 'development') {
          console.log(`[ai] ✓ ${provider}/${cfg.model} → ${result.slice(0, 40)}...`)
        }
        return result
      }
      // Model failed — try the next model on the same provider
      if (process.env.NODE_ENV === 'development') {
        console.log(`[ai] ✗ ${provider}/${cfg.model} — trying next model...`)
      }
    }
    // All models on this provider failed — move to the next provider
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ai] ⚠️ ${provider} exhausted — moving to next provider`)
    }
  }

  // All providers + all models failed
  return null
}

/** Fast AI chat — small/fast models for short replies (bot-reply, smart-reply) */
export async function aiChatFast(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 80
): Promise<string | null> {
  return selfHealingChat(systemPrompt, userMessage, maxTokens, 'fast')
}

/** Full AI chat — large models for complex analysis (summary, tone, action-items) */
export async function aiChat(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 300
): Promise<string | null> {
  return selfHealingChat(systemPrompt, userMessage, maxTokens, 'full')
}

export function getProviderStatus(): Record<Provider, boolean> {
  return {
    nvidia: !!process.env.NVIDIA_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    openrouter: !!process.env.OPENROUTER_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    huggingface: !!process.env.HUGGINGFACE_API_KEY,
  }
}
