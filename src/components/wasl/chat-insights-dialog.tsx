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
  Loader2,
  MessageSquare,
  Clock,
  TrendingUp,
  Activity,
  Sparkles,
  Users,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Insights = {
  conversationName: string | null
  isGroup: boolean
  totalMessages: number
  myMessages: number
  theirMessages: number
  myPercentage: number
  avgMessageLength: number
  avgResponseTimeMs: number
  avgResponseTimeLabel: string
  topActiveHours: string[]
  messageTypeBreakdown: Record<string, number>
  senderBreakdown: { name: string; count: number }[]
  daySpan: number
  messagesPerDay: number
  aiInsights: string | null
}

export function ChatInsightsDialog({
  open,
  onOpenChange,
  conversationId,
  conversationName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  conversationId: string
  conversationName?: string
}) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Insights | null>(null)

  const load = useCallback(async () => {
    if (!open || !conversationId) return
    setLoading(true)
    try {
      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      })
      if (res.ok) {
        const d = await res.json()
        setData(d)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [open, conversationId])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[var(--wasl-green)]" />
            Chat Insights
          </DialogTitle>
          <DialogDescription>
            AI-powered analytics for {conversationName || 'this conversation'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto wasl-scroll px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mb-3" />
              <span className="text-sm">Analyzing conversation…</span>
            </div>
          ) : !data ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No data available.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Message stats grid */}
              <div className="grid grid-cols-2 gap-3">
                <StatBox
                  icon={<MessageSquare className="h-4 w-4" />}
                  label="Total Messages"
                  value={data.totalMessages}
                />
                <StatBox
                  icon={<Activity className="h-4 w-4" />}
                  label="Per Day"
                  value={data.messagesPerDay}
                />
                <StatBox
                  icon={<Clock className="h-4 w-4" />}
                  label="Avg Response"
                  value={data.avgResponseTimeLabel}
                />
                <StatBox
                  icon={<TrendingUp className="h-4 w-4" />}
                  label="Avg Length"
                  value={`${data.avgMessageLength} chars`}
                />
              </div>

              {/* Participation split */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Participation
                </div>
                <div className="flex h-6 rounded-full overflow-hidden border border-border">
                  <div
                    className="bg-[var(--wasl-green)] flex items-center justify-center text-[10px] text-white font-semibold"
                    style={{ width: `${data.myPercentage}%` }}
                  >
                    {data.myPercentage > 15 ? `You ${data.myPercentage}%` : ''}
                  </div>
                  <div
                    className="bg-amber-500/70 flex items-center justify-center text-[10px] text-white font-semibold"
                    style={{ width: `${100 - data.myPercentage}%` }}
                  >
                    {100 - data.myPercentage > 15 ? `Them ${100 - data.myPercentage}%` : ''}
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>You: {data.myMessages}</span>
                  <span>Them: {data.theirMessages}</span>
                </div>
              </div>

              {/* Top active hours */}
              {data.topActiveHours.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Most Active Hours
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.topActiveHours.map((h, i) => (
                      <span
                        key={i}
                        className={cn(
                          'text-[11px] px-2.5 py-1 rounded-full font-medium',
                          i === 0
                            ? 'bg-[var(--wasl-green)]/15 text-[var(--wasl-green)]'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sender breakdown (groups) */}
              {data.isGroup && data.senderBreakdown.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                    <Users className="h-3 w-3" /> Member Activity
                  </div>
                  <div className="space-y-1.5">
                    {data.senderBreakdown
                      .sort((a, b) => b.count - a.count)
                      .map((s, i) => {
                        const pct = Math.round((s.count / data.totalMessages) * 100)
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs font-medium w-20 truncate">{s.name}</span>
                            <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-[var(--wasl-green)]/60 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground w-12 text-right">{s.count} msgs</span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              {/* Message type breakdown */}
              {Object.keys(data.messageTypeBreakdown).length > 1 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Message Types
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(data.messageTypeBreakdown).map(([type, count]) => (
                      <span key={type} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                        {type}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Insights */}
              {data.aiInsights && (
                <div className="rounded-xl border border-[var(--wasl-green)]/20 bg-[var(--wasl-green)]/5 p-3 wasl-anim-slide-up">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="h-4 w-4 text-[var(--wasl-green)]" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--wasl-green)]">
                      AI Insights
                    </span>
                  </div>
                  <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                    {data.aiInsights}
                  </p>
                </div>
              )}

              {/* Day span */}
              <div className="text-center text-[10px] text-muted-foreground">
                Analyzed {data.totalMessages} messages over {data.daySpan} day{data.daySpan === 1 ? '' : 's'}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StatBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
}) {
  return (
    <div className="wasl-stat-card">
      <div className="wasl-stat-icon">{icon}</div>
      <div>
        <div className="wasl-stat-value">{value}</div>
        <div className="wasl-stat-label">{label}</div>
      </div>
    </div>
  )
}
