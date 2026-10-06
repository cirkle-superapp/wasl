'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Loader2, TrendingUp, TrendingDown, Minus, Sparkles, Heart, Clock, Scale, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'

type HealthResponse = {
  conversationId: string
  isGroup?: boolean
  conversationName?: string
  score: number | null
  label: string
  emoji?: string
  color?: string
  trend?: 'up' | 'flat' | 'down'
  signals?: {
    symmetry: number
    latencyTrend: number
    initiation: number
    sentiment: number
    recency: number
  }
  sentimentLabel?: string
  aiAssessment?: string | null
  stats?: {
    totalMessages: number
    myMessages: number
    theirMessages: number
    myInitiations: number
    theirInitiations: number
    firstHalfMedianResponseMs: number
    secondHalfMedianResponseMs: number
    daysSinceLastMessage: number
  }
  weights?: Record<string, number>
  reason?: string
}

const COLOR_CLASSES: Record<string, { text: string; bg: string; ring: string; from: string; to: string }> = {
  green: {
    text: 'text-[var(--wasl-green)]',
    bg: 'bg-[var(--wasl-green)]/10',
    ring: 'ring-[var(--wasl-green)]/30',
    from: 'from-[var(--wasl-green)]',
    to: 'to-emerald-400',
  },
  teal: {
    text: 'text-[var(--wasl-teal)]',
    bg: 'bg-[var(--wasl-teal)]/10',
    ring: 'ring-[var(--wasl-teal)]/30',
    from: 'from-[var(--wasl-teal)]',
    to: 'to-cyan-400',
  },
  amber: {
    text: 'text-amber-500',
    bg: 'bg-amber-500/10',
    ring: 'ring-amber-500/30',
    from: 'from-amber-500',
    to: 'to-orange-400',
  },
  rose: {
    text: 'text-rose-500',
    bg: 'bg-rose-500/10',
    ring: 'ring-rose-500/30',
    from: 'from-rose-500',
    to: 'to-red-400',
  },
}

function formatMs(ms: number): string {
  if (!ms || ms === 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.round(min / 60)
  return `${hr}h`
}

export function HealthScoreDialog({
  open,
  onOpenChange,
  conversationId,
  conversationName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  conversationId: string | null
  conversationName?: string
}) {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchHealth() {
    if (!conversationId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/health-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      setError(e?.message || 'Failed to compute health score')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && conversationId && !data) {
      fetchHealth()
    }
  }, [open, conversationId])

  useEffect(() => {
    if (!open) {
      // Reset on close so re-opening re-fetches fresh data
      setData(null)
      setError(null)
    }
  }, [open])

  const color = data?.color ? COLOR_CLASSES[data.color] : COLOR_CLASSES.teal
  const trendIcon = data?.trend === 'up' ? TrendingUp : data?.trend === 'down' ? TrendingDown : Minus
  const TrendIcon = trendIcon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-[var(--wasl-green)]" />
            Conversation Health
          </DialogTitle>
          <DialogDescription>
            {conversationName ? `${conversationName} · ` : ''}Algorithmic composite score across 5 signals
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[var(--wasl-green)]" />
            <p className="text-xs text-muted-foreground">Analyzing conversation patterns…</p>
          </div>
        ) : error ? (
          <div className="p-4 text-center text-sm text-rose-500 bg-rose-500/5 rounded-lg border border-rose-500/20">
            {error}
          </div>
        ) : data ? (
          <div className="space-y-4">
            {/* Big score gauge */}
            {data.score !== null ? (
              <div className={cn('rounded-xl p-4 border', color.bg, `border-${data.color === 'green' ? '[var(--wasl-green)]' : data.color === 'teal' ? '[var(--wasl-teal)]' : data.color}/30`)}>
                <div className="flex items-center gap-4">
                  {/* Circular gauge */}
                  <div className="relative w-24 h-24 shrink-0">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-muted/20"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 42}`}
                        strokeDashoffset={`${2 * Math.PI * 42 * (1 - data.score / 100)}`}
                        className={color.text}
                        style={{ transition: 'stroke-dashoffset 0.6s var(--wasl-ease)' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={cn('text-2xl font-bold', color.text)}>{data.score}</span>
                      <span className="text-[10px] text-muted-foreground">/100</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className={cn('inline-flex items-center gap-1 text-sm font-semibold', color.text)}>
                      <span className="text-base">{data.emoji}</span>
                      {data.label}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <TrendIcon className={cn('w-3 h-3', data.trend === 'up' ? 'text-[var(--wasl-green)]' : data.trend === 'down' ? 'text-rose-500' : 'text-muted-foreground')} />
                      <span>
                        Trend: {data.trend === 'up' ? 'Improving' : data.trend === 'down' ? 'Slowing' : 'Steady'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground bg-muted/30 rounded-lg">
                {data.reason || 'Not enough data to compute a score yet.'}
              </div>
            )}

            {/* AI assessment */}
            {data.aiAssessment && (
              <div className="rounded-lg p-3 bg-gradient-to-br from-[var(--wasl-green)]/5 to-transparent border border-[var(--wasl-green)]/20 wasl-anim-slide-up">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--wasl-green)] mb-1">
                  <Sparkles className="w-3 h-3" />
                  AI Assessment
                </div>
                <p className="text-xs text-foreground/80 leading-relaxed">{data.aiAssessment}</p>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Sentiment: <span className="capitalize">{data.sentimentLabel}</span>
                </div>
              </div>
            )}

            {/* Signal breakdown */}
            {data.signals && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Signal breakdown</div>
                {[
                  { key: 'symmetry', label: 'Response symmetry', icon: Scale, help: 'Balanced message volume between you' },
                  { key: 'latencyTrend', label: 'Response time trend', icon: Clock, help: 'Are replies getting faster or slower?' },
                  { key: 'initiation', label: 'Initiation balance', icon: Timer, help: 'Who starts the conversations?' },
                  { key: 'sentiment', label: 'Sentiment', icon: Sparkles, help: 'AI-derived emotional tone' },
                  { key: 'recency', label: 'Recency', icon: Heart, help: 'Days since last exchange' },
                ].map((s) => {
                  const val = data.signals![s.key as keyof typeof data.signals] ?? 0
                  const weight = data.weights?.[s.key] ?? 0
                  const SigIcon = s.icon
                  return (
                    <div key={s.key} className="flex items-center gap-3" title={s.help}>
                      <SigIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs font-medium">{s.label}</span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {val}/100 <span className="text-[10px] opacity-60">×{weight}</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn('h-full rounded-full bg-gradient-to-r', color.from, color.to)}
                            style={{ width: `${val}%`, transition: 'width 0.6s var(--wasl-ease)' }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Stats grid */}
            {data.stats && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg p-2 bg-muted/30">
                  <div className="text-sm font-semibold tabular-nums">{data.stats.totalMessages}</div>
                  <div className="text-[10px] text-muted-foreground">Total msgs</div>
                </div>
                <div className="rounded-lg p-2 bg-muted/30">
                  <div className="text-sm font-semibold tabular-nums">
                    {data.stats.myInitiations}/{data.stats.theirInitiations}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Initiations</div>
                </div>
                <div className="rounded-lg p-2 bg-muted/30" title="First half → second half median response time">
                  <div className="text-sm font-semibold tabular-nums">
                    {formatMs(data.stats.firstHalfMedianResponseMs)} → {formatMs(data.stats.secondHalfMedianResponseMs)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Response time</div>
                </div>
              </div>
            )}

            {data.isGroup && (
              <p className="text-[10px] text-muted-foreground italic text-center">
                Group conversations are scored against the primary counterpart.
              </p>
            )}

            {/* Refresh */}
            <button
              onClick={fetchHealth}
              disabled={loading}
              className="w-full text-xs text-muted-foreground hover:text-[var(--wasl-green)] flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Loader2 className={cn('w-3 h-3', loading && 'animate-spin')} />
              Recompute
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
