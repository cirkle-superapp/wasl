'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  AtSign,
  HelpCircle,
  Clock,
  RefreshCw,
  Users,
  Calendar,
  TrendingUp,
  ArrowRight,
} from 'lucide-react'
import { useWaslStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ═══════════════════════════════════════════════════════════════════════
// DailyBriefingDialog (Task 97) — Proactive AI personal assistant
// ═══════════════════════════════════════════════════════════════════════
//
// NO competitor has this. Every morning (or on-demand), the AI scans ALL
// the user's conversations and generates a personal digest:
//   1. AI summary — natural-language "good morning" digest
//   2. Priority unread — messages that need attention (urgent/mention/question)
//   3. Follow-ups — someone asked you something, you haven't replied
//   4. Stale relationships — "you haven't talked to Mom in 8 days"
//   5. Scheduled messages — what's going out today
//   6. Stats — total convos, messages today, day progress

type PriorityMsg = {
  conversationId: string
  conversationName: string
  messageId: string
  content: string
  senderName: string
  reason: string
}
type FollowUp = {
  conversationId: string
  conversationName: string
  senderName: string
  content: string
  sentAt: string
  hoursAgo: number
}
type StaleConv = {
  conversationId: string
  conversationName: string
  daysSince: number
}
type ScheduledItem = {
  id: string
  content: string
  scheduledFor: string
}

type BriefingData = {
  empty?: boolean
  message?: string
  generatedAt: string
  aiSummary: string | null
  priorityUnread: PriorityMsg[]
  followUps: FollowUp[]
  staleRelationships: StaleConv[]
  scheduledToday: ScheduledItem[]
  stats: {
    totalConversations: number
    totalMessagesToday: number
    myMessages: number
    theirMessages: number
    dayProgress: number
  }
}

const REASON_META: Record<string, { icon: typeof AlertTriangle; color: string }> = {
  'Urgent': { icon: AlertTriangle, color: 'text-amber-500 bg-amber-500/10' },
  'Mentions you': { icon: AtSign, color: 'text-rose-500 bg-rose-500/10' },
  'Question': { icon: HelpCircle, color: 'text-[var(--wasl-green)] bg-[var(--wasl-green)]/10' },
}

export function DailyBriefingDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [data, setData] = useState<BriefingData | null>(null)
  const [loading, setLoading] = useState(false)
  const setActiveConversation = useWaslStore((s) => s.setActiveConversation)

  const fetchBriefing = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ range: 'today' }),
        cache: 'no-store',
      })
      if (!res.ok) { toast.error('Failed to generate briefing'); return }
      const json = await res.json()
      setData(json.briefing)
    } catch { toast.error('Network error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (open) fetchBriefing()
    else setData(null)
  }, [open, fetchBriefing])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto wasl-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--wasl-green)]" />
            Daily Briefing
            <Button onClick={fetchBriefing} size="sm" variant="ghost" className="ml-auto h-7" disabled={loading}>
              <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
            </Button>
          </DialogTitle>
          <DialogDescription>
            Your personal AI assistant scanned all conversations for you.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[var(--wasl-green)]" />
            <p className="text-xs text-muted-foreground">Scanning your conversations…</p>
          </div>
        ) : !data ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No data</div>
        ) : data.empty ? (
          <div className="p-4 text-center text-sm text-muted-foreground">{data.message}</div>
        ) : (
          <div className="space-y-4">
            {/* AI summary */}
            {data.aiSummary && (
              <div className="rounded-lg p-3 bg-gradient-to-br from-[var(--wasl-green)]/8 to-transparent border border-[var(--wasl-green)]/20 wasl-anim-slide-up">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--wasl-green)] mb-1">
                  <Sparkles className="w-3 h-3" /> AI Summary
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{data.aiSummary}</p>
              </div>
            )}

            {/* Stats bar */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <StatBox label="Convos" value={data.stats.totalConversations} />
              <StatBox label="Msgs today" value={data.stats.totalMessagesToday} />
              <StatBox label="My msgs" value={data.stats.myMessages} color="text-[var(--wasl-green)]" />
              <StatBox label="Day" value={`${data.stats.dayProgress}%`} />
            </div>

            {/* Priority unread */}
            {data.priorityUnread.length > 0 && (
              <Section title="Needs your attention" count={data.priorityUnread.length} icon={AlertTriangle} color="text-amber-500">
                {data.priorityUnread.map((msg, i) => {
                  const meta = REASON_META[msg.reason] || REASON_META['Question']
                  const Icon = meta.icon
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setActiveConversation(msg.conversationId)
                        onOpenChange(false)
                      }}
                      className="w-full flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left wasl-anim-slide-up"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <span className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium shrink-0', meta.color)}>
                        <Icon className="w-2.5 h-2.5" />
                        {msg.reason}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{msg.senderName}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{msg.content}</div>
                      </div>
                      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0 mt-1" />
                    </button>
                  )
                })}
              </Section>
            )}

            {/* Follow-ups */}
            {data.followUps.length > 0 && (
              <Section title="Awaiting your reply" count={data.followUps.length} icon={Clock} color="text-blue-500">
                {data.followUps.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveConversation(f.conversationId)
                      onOpenChange(false)
                    }}
                    className="w-full flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left wasl-anim-slide-up"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{f.senderName}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{f.content}</div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{f.hoursAgo}h ago</span>
                  </button>
                ))}
              </Section>
            )}

            {/* Stale relationships */}
            {data.staleRelationships.length > 0 && (
              <Section title="Reconnect" count={data.staleRelationships.length} icon={Users} color="text-rose-500">
                {data.staleRelationships.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveConversation(s.conversationId)
                      onOpenChange(false)
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left wasl-anim-slide-up"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <Users className="w-3 h-3 text-rose-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">{s.conversationName}</span>
                      <span className="text-[11px] text-muted-foreground ml-2">
                        {s.daysSince} day{s.daysSince === 1 ? '' : 's'} ago
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--wasl-green)] font-medium shrink-0">Say hi →</span>
                  </button>
                ))}
              </Section>
            )}

            {/* Scheduled messages */}
            {data.scheduledToday.length > 0 && (
              <Section title="Going out today" count={data.scheduledToday.length} icon={Calendar} color="text-[var(--wasl-green)]">
                {data.scheduledToday.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 text-left">
                    <Calendar className="w-3 h-3 text-[var(--wasl-green)] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate">{s.content}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(s.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Footer */}
            <div className="text-[10px] text-muted-foreground text-center pt-2 border-t border-border">
              Generated at {new Date(data.generatedAt).toLocaleTimeString()} · scans up to 100 conversations + 500 messages
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatBox({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2">
      <div className={cn('text-sm font-bold tabular-nums', color || 'text-foreground')}>{value}</div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  )
}

function Section({ title, count, icon: Icon, color, children }: {
  title: string
  count: number
  icon: typeof AlertTriangle
  color: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className={cn('flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold', color)}>
        <Icon className="w-3 h-3" />
        {title}
        <span className="ml-auto text-muted-foreground normal-case tracking-normal">{count}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}
