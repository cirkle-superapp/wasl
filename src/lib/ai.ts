// Unified AI router — supports 5 AI providers with automatic consensus fallback.
// Two-tier system:
//   - aiChatFast(): small/fast model for short chat replies (bot-reply, smart-reply)
//   - aiChat(): full model for complex analysis (summary, tone, action-items)
//
// Provider chain (consensus — tries each in order, uses first success):
//   1. NVIDIA  (deepseek-v4.1-flash, gemma-3-4b-it)
//   2. Groq    (llama-3.3-70b, llama-3.1-8b-instant)
//   3. OpenRouter (qwen-3.8-27b:free, etc.)
//   4. Gemini  (gemini-flash-latest)
//   5. HuggingFace (open models via inference API)
//
// Usage:
//   import { aiChat, aiChatFast } from '@/lib/ai'
//   const reply = await aiChatFast('You are friendly.', 'Hello!')
//   const summary = await aiChat('Summarize this.', longText, 400)

type Provider = 'nvidia' | 'groq' | 'openrouter' | 'gemini' | 'huggingface'

const PROVIDER_ORDER: Provider[] = ['nvidia', 'groq', 'openrouter', 'gemini', 'huggingface']

// Fast model config — for short chat replies (1-2 sentences)
const FAST_MODEL: Record<Provider, { model: string; extraTokens: number }> = {
  nvidia: { model: 'google/gemma-3-4b-it', extraTokens: 0 },
  groq: { model: 'llama-3.1-8b-instant', extraTokens: 0 },
  openrouter: { model: 'qwen/qwen3.8-27b:free', extraTokens: 0 },
  gemini: { model: 'gemini-flash-latest', extraTokens: 0 },
  huggingface: { model: 'meta-llama/Llama-3.2-1B', extraTokens: 0 },
}

// Full model config — for complex analysis (summary, action items, tone)
const FULL_MODEL: Record<Provider, { model: string; extraTokens: number }> = {
  nvidia: { model: 'deepseek-ai/deepseek-v4.1-flash', extraTokens: 200 },
  groq: { model: 'llama-3.3-70b-versatile', extraTokens: 0 },
  openrouter: { model: 'qwen/qwen3.8-27b:free', extraTokens: 0 },
  gemini: { model: 'gemini-flash-latest', extraTokens: 0 },
  huggingface: { model: 'meta-llama/Llama-3.2-1B', extraTokens: 0 },
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

// HuggingFace inference API — uses a different request/response format
// (text-generation models, not OpenAI-compatible chat completions).
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
    // HF returns [{ generated_text: "..." }] for text-generation models
    if (Array.isArray(data) && data[0]?.generated_text) {
      return String(data[0].generated_text).trim()
    }
    return null
  } catch {
    return null
  }
}

/** Fast AI chat — uses small/fast models for short replies (bot-reply, smart-reply) */
export async function aiChatFast(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 80
): Promise<string | null> {
  for (const provider of PROVIDER_ORDER) {
    const urls = PROVIDER_URLS[provider]
    if (!urls.key) continue
    const cfg = FAST_MODEL[provider]
    let result: string | null = null
    if (provider === 'gemini') {
      result = await geminiChat(urls.key, cfg.model, systemPrompt, userMessage, maxTokens)
    } else if (provider === 'huggingface') {
      result = await huggingfaceChat(urls.key, cfg.model, systemPrompt, userMessage, maxTokens)
    } else {
      result = await openaiCompatibleChat(urls.url, urls.key, cfg.model, systemPrompt, userMessage, maxTokens, cfg.extraTokens)
    }
    if (result) return result
  }
  return null
}

/** Full AI chat — uses large models for complex analysis (summary, tone, action-items) */
export async function aiChat(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 300
): Promise<string | null> {
  for (const provider of PROVIDER_ORDER) {
    const urls = PROVIDER_URLS[provider]
    if (!urls.key) continue
    const cfg = FULL_MODEL[provider]
    let result: string | null = null
    if (provider === 'gemini') {
      result = await geminiChat(urls.key, cfg.model, systemPrompt, userMessage, maxTokens)
    } else if (provider === 'huggingface') {
      result = await huggingfaceChat(urls.key, cfg.model, systemPrompt, userMessage, maxTokens)
    } else {
      result = await openaiCompatibleChat(urls.url, urls.key, cfg.model, systemPrompt, userMessage, maxTokens, cfg.extraTokens)
    }
    if (result) return result
  }
  return null
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
