'use client'

import { useState } from 'react'
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  AtSign,
  Link2,
  HelpCircle,
  CheckCircle2,
  ListTodo,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type CatchUpResponse = {
  conversationId: string
  messageCount: number
  tldr: string
  decisions: { text: string }[]
  actionItems: { text: string; ownerName?: string }[]
  mentionsOfYou: { messageId: string; senderName: string; snippet: string }[]
  links: { url: string; senderName: string; messageId: string }[]
  questions: { messageId: string; senderName: string; snippet: string }[]
}

export function CatchUpBanner({
  conversationId,
  unreadCount,
  onJumpToMessage,
  onDismiss,
}: {
  conversationId: string
  unreadCount: number
  onJumpToMessage?: (messageId: string) => void
  onDismiss?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<CatchUpResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/catch-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, unreadCount }),
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setOpen(true)
    } catch (e: any) {
      setError(e?.message || 'Failed to generate digest')
      toast.error('Could not generate catch-up digest')
    } finally {
      setLoading(false)
    }
  }

  if (unreadCount < 8) return null

  return (
    <>
      {/* Inline banner button (above the messages) */}
      <div className="wasl-catchup-banner px-3 py-2 border-b border-[var(--wasl-green)]/20 bg-gradient-to-r from-[var(--wasl-green)]/10 via-[var(--wasl-green)]/5 to-transparent flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[var(--wasl-green)] shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-foreground">
            {unreadCount} new message{unreadCount === 1 ? '' : 's'} to catch up on
          </span>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="text-[11px] font-medium text-[var(--wasl-green)] hover:text-[var(--wasl-green-dark)] flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--wasl-green)]/10 hover:bg-[var(--wasl-green)]/20 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              Catch me up
            </>
          )}
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Dismiss catch-up banner"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Expanded digest panel */}
      {open && data && (
        <div className="wasl-catchup-panel border-b border-border bg-gradient-to-b from-[var(--wasl-green)]/5 to-transparent max-h-[60vh] overflow-y-auto wasl-scroll">
          <div className="px-3 py-3 space-y-3">
            {/* Header with collapse */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-[var(--wasl-green)]" />
                Catch-up digest · {data.messageCount} messages
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setOpen(false)}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                >
                  Collapse <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => { setOpen(false); onDismiss?.() }}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Close digest"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* TL;DR */}
            <div className="rounded-lg p-2.5 bg-white/60 dark:bg-white/5 border border-[var(--wasl-green)]/20">
              <div className="text-[10px] uppercase tracking-wide text-[var(--wasl-green)] mb-1 font-semibold">TL;DR</div>
              <p className="text-xs leading-relaxed text-foreground/90">{data.tldr}</p>
            </div>

            {/* Decisions */}
            {data.decisions.length > 0 && (
              <Section icon={CheckCircle2} title="Decisions" color="text-[var(--wasl-green)]">
                {data.decisions.map((d, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <span className="text-[var(--wasl-green)] mt-0.5">•</span>
                    <span>{d.text}</span>
                  </li>
                ))}
              </Section>
            )}

            {/* Action items */}
            {data.actionItems.length > 0 && (
              <Section icon={ListTodo} title="Action items" color="text-amber-500">
                {data.actionItems.map((a, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <span className="text-amber-500 mt-0.5">•</span>
                    <span>
                      {a.text}
                      {a.ownerName && (
                        <span className="text-muted-foreground"> — {a.ownerName}</span>
                      )}
                    </span>
                  </li>
                ))}
              </Section>
            )}

            {/* Mentions of you */}
            {data.mentionsOfYou.length > 0 && (
              <Section icon={AtSign} title={`Mentions you (${data.mentionsOfYou.length})`} color="text-rose-500">
                {data.mentionsOfYou.map((m, i) => (
                  <li key={i}>
                    <button
                      onClick={() => onJumpToMessage?.(m.messageId)}
                      className="w-full text-left rounded-md hover:bg-muted/60 p-1.5 transition-colors"
                    >
                      <div className="text-[10px] text-muted-foreground mb-0.5">{m.senderName}</div>
                      <div className="text-xs line-clamp-2">{m.snippet}</div>
                    </button>
                  </li>
                ))}
              </Section>
            )}

            {/* Open questions */}
            {data.questions.length > 0 && (
              <Section icon={HelpCircle} title={`Open questions (${data.questions.length})`} color="text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]">
                {data.questions.map((q, i) => (
                  <li key={i}>
                    <button
                      onClick={() => onJumpToMessage?.(q.messageId)}
                      className="w-full text-left rounded-md hover:bg-muted/60 p-1.5 transition-colors"
                    >
                      <div className="text-[10px] text-muted-foreground mb-0.5">{q.senderName}</div>
                      <div className="text-xs italic line-clamp-2">{q.snippet}</div>
                    </button>
                  </li>
                ))}
              </Section>
            )}

            {/* Links shared */}
            {data.links.length > 0 && (
              <Section icon={Link2} title={`Links shared (${data.links.length})`} color="text-blue-500">
                {data.links.map((l, i) => {
                  let display = l.url
                  try {
                    const u = new URL(l.url)
                    display = u.hostname.replace(/^www\./, '') + (u.pathname && u.pathname !== '/' ? u.pathname.slice(0, 30) : '')
                  } catch { /* keep raw */ }
                  return (
                    <li key={i} className="text-xs">
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline truncate block"
                      >
                        {display}
                      </a>
                      <span className="text-[10px] text-muted-foreground">shared by {l.senderName}</span>
                    </li>
                  )
                })}
              </Section>
            )}

            {/* If all empty (rare) */}
            {data.decisions.length === 0 && data.actionItems.length === 0 && data.mentionsOfYou.length === 0 && data.questions.length === 0 && data.links.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No specific items detected — read the messages at your own pace.
              </p>
            )}
          </div>
        </div>
      )}

      {error && !open && (
        <div className="px-3 py-1 text-[10px] text-rose-500">{error}</div>
      )}
    </>
  )
}

function Section({
  icon: Icon,
  title,
  color,
  children,
}: {
  icon: typeof Sparkles
  title: string
  color: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5 wasl-anim-slide-up">
      <div className={cn('flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold', color)}>
        <Icon className="w-3 h-3" />
        {title}
      </div>
      <ul className="space-y-1">{children}</ul>
    </div>
  )
}
