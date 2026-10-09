'use client'

import { useState, useEffect } from 'react'
import { ShieldAlert, Shield, X, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

type SafetyResponse = {
  riskScore: number
  label: string
  recommendation: 'allow' | 'warn' | 'block'
  reason: string
  rules: { rule: string; weight: number; matched: boolean; detail?: string }[]
  hasHistory: boolean
}

export function SafetyWarningBanner({
  conversationId,
  senderId,
  content,
  messageId,
}: {
  conversationId: string
  senderId: string | null | undefined
  content: string
  messageId?: string
}) {
  const [data, setData] = useState<SafetyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  // Track which (senderId, messageId) pairs the user has dismissed so they
  // don't see the warning again for the same first-message.
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const currentKey = `${senderId || ''}:${messageId || ''}`

  // Fetch once per (senderId, messageId) tuple. The parent remounts this
  // component via `key` when the conversation changes, so we don't need to
  // reset state on prop changes here.
  useEffect(() => {
    if (!senderId || !content) {
      setLoading(false)
      return
    }
    let cancelled = false
    // Use an IIFE so we never call setState synchronously inside the effect body.
    // The leading semicolon is REQUIRED — without it, TypeScript/JS parses
    // "let cancelled = false (async () => ...)" as a function call on `false`.
    ;(async () => {
      try {
        const res = await fetch('/api/ai/safety-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, senderId }),
          cache: 'no-store',
        })
        if (cancelled) return
        const json: SafetyResponse = await res.json()
        // Only surface a banner if there's actually a risk to show
        if (json.recommendation === 'warn' || json.recommendation === 'block') {
          setData(json)
        }
      } catch {
        // silent — a missing safety API shouldn't break chat
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [senderId, content])

  if (loading || !data) return null
  if (dismissedKey === currentKey) return null

  const isBlock = data.recommendation === 'block'
  const isWarn = data.recommendation === 'warn'
  if (!isBlock && !isWarn) return null

  const Icon = isBlock ? ShieldAlert : Shield
  const containerClass = isBlock
    ? 'bg-rose-500/10 border-rose-500/30'
    : 'bg-amber-500/10 border-amber-500/30'
  const iconClass = isBlock ? 'text-rose-500' : 'text-amber-500'
  const matchedRules = data.rules.filter((r) => r.matched)

  return (
    <div className={cn('border-b', containerClass)}>
      <div className="px-3 py-2 flex items-start gap-2">
        <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', iconClass)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-semibold', iconClass)}>
              {isBlock ? 'Likely scam — be very careful' : 'New contact — verify before responding'}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground ml-auto">
              Risk {data.riskScore}/100
            </span>
          </div>
          <p className="text-[11px] text-foreground/80 mt-0.5 leading-relaxed">{data.reason}</p>

          {matchedRules.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {matchedRules.length} risk indicator{matchedRules.length === 1 ? '' : 's'}
            </button>
          )}
          {expanded && (
            <ul className="mt-1.5 space-y-0.5 wasl-anim-slide-up">
              {matchedRules.map((r, i) => (
                <li key={i} className="text-[10px] flex items-start gap-1.5 text-foreground/70">
                  <span className={iconClass}>•</span>
                  <span>
                    {r.rule}
                    {r.detail && <span className="text-muted-foreground"> ({r.detail})</span>}
                    <span className="text-muted-foreground"> +{r.weight}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={() => setDismissedKey(currentKey)}
          className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
          aria-label="Dismiss warning"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
