// Unified AI router — supports multiple AI providers with automatic fallback.
// Primary: NVIDIA (DeepSeek V4 Flash) → Fallback: Groq → OpenRouter → Gemini
//
// All OpenAI-compatible providers use the same chat completions format.
// Gemini uses its own REST API format (handled separately).
//
// Usage:
//   import { aiChat } from '@/lib/ai'
//   const reply = await aiChat('You are a helpful assistant.', 'Hello!')

type Provider = 'nvidia' | 'groq' | 'openrouter' | 'gemini'

// Provider priority order — NVIDIA works from this server, others as fallback
const PROVIDER_ORDER: Provider[] = ['nvidia', 'groq', 'openrouter', 'gemini']

const PROVIDER_CONFIG: Record<
  Provider,
  { url: string; key: string | undefined; model: string; extraTokens: number }
> = {
  nvidia: {
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    key: process.env.NVIDIA_API_KEY,
    // DeepSeek V4 Flash — fast, works from this server
    model: 'deepseek-ai/deepseek-v4-flash-0731',
    // DeepSeek uses reasoning tokens, so we need extra headroom
    extraTokens: 200,
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
    extraTokens: 0,
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: process.env.OPENROUTER_API_KEY,
    model: 'meta-llama/llama-3.3-70b-instruct',
    extraTokens: 0,
  },
  gemini: {
    url: '',
    key: process.env.GEMINI_API_KEY,
    // Gemini 3.6 Flash — the latest available model
    model: 'gemini-3.6-flash',
    extraTokens: 0,
  },
}

/**
 * Call an OpenAI-compatible chat completions endpoint.
 * Returns the assistant's text response, or null on failure.
 */
async function openaiCompatibleChat(
  url: string,
  apiKey: string | undefined,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 300,
  extraTokens: number = 0
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
    // Some models (like DeepSeek) return content in reasoning_content first
    // then the actual response in content. We prefer content.
    const content = data?.choices?.[0]?.message?.content
    return content ? String(content).trim() : null
  } catch {
    return null
  }
}

/**
 * Call the Gemini REST API (different format from OpenAI).
 */
async function geminiChat(
  apiKey: string | undefined,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 300
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
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.7,
        },
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

/**
 * Unified AI chat — tries providers in order until one succeeds.
 * Returns the generated text, or null if all providers fail (caller should
 * provide a fallback).
 */
export async function aiChat(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 300
): Promise<string | null> {
  for (const provider of PROVIDER_ORDER) {
    const cfg = PROVIDER_CONFIG[provider]
    if (!cfg.key) continue

    let result: string | null = null
    if (provider === 'gemini') {
      result = await geminiChat(cfg.key, cfg.model, systemPrompt, userMessage, maxTokens)
    } else {
      result = await openaiCompatibleChat(
        cfg.url, cfg.key, cfg.model,
        systemPrompt, userMessage, maxTokens, cfg.extraTokens
      )
    }

    if (result) return result
  }
  return null
}

/**
 * Check which AI providers are configured (for debugging / health check).
 */
export function getProviderStatus(): Record<Provider, boolean> {
  return {
    nvidia: !!process.env.NVIDIA_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    openrouter: !!process.env.OPENROUTER_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
  }
}
