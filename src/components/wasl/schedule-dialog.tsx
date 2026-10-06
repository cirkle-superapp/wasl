'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Clock, Loader2, Repeat, Sparkles, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const REPEAT_OPTIONS = [
  { value: 'none', label: 'One-time', desc: 'Send once' },
  { value: 'daily', label: 'Daily', desc: 'Repeat every day' },
  { value: 'weekly', label: 'Weekly', desc: 'Repeat every week' },
  { value: 'monthly', label: 'Monthly', desc: 'Repeat every month' },
] as const

type SendTimeResponse = {
  hasData: boolean
  recommendedHour: number | null
  recommendedLabel: string | null
  recommendedTimeISO: string | null
  recommendedTimeLocal?: string
  confidence: 'low' | 'medium' | 'high'
  peakRatio?: number
  topHours: { hour: number; count: number; weight: number; label: string }[]
  totalMessages?: number
  reason?: string
}

export function ScheduleDialog({ open, onOpenChange, conversationId, content }: {
  open: boolean; onOpenChange: (v: boolean) => void
  conversationId: string | null; content: string
}) {
  const [scheduledFor, setScheduledFor] = useState('')
  const [repeat, setRepeat] = useState<string>('none')
  const [repeatUntil, setRepeatUntil] = useState('')
  const [sending, setSending] = useState(false)
  const [sendTime, setSendTime] = useState<SendTimeResponse | null>(null)
  const [sendTimeLoading, setSendTimeLoading] = useState(false)

  // Fetch send-time recommendation when the dialog opens
  useEffect(() => {
    if (!open || !conversationId) return
    setSendTimeLoading(true)
    setSendTime(null)
    fetch('/api/ai/send-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((json: SendTimeResponse) => setSendTime(json))
      .catch(() => { /* silent */ })
      .finally(() => setSendTimeLoading(false))
  }, [open, conversationId])

  function applyRecommendation() {
    if (!sendTime?.recommendedTimeISO) return
    // Format as datetime-local: "YYYY-MM-DDTHH:MM"
    const d = new Date(sendTime.recommendedTimeISO)
    const pad = (n: number) => n.toString().padStart(2, '0')
    const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    setScheduledFor(formatted)
    toast.success(`Scheduled for ${sendTime.recommendedLabel}`)
  }

  async function schedule() {
    if (!conversationId || !content.trim() || !scheduledFor) return
    setSending(true)
    try {
      const body: Record<string, unknown> = {
        conversationId,
        content,
        scheduledFor: new Date(scheduledFor).toISOString(),
        repeat,
      }
      if (repeat !== 'none' && repeatUntil) {
        body.repeatUntil = new Date(repeatUntil).toISOString()
      }
      const res = await fetch('/api/scheduled-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error || 'Failed'); return }
      const repeatLabel = repeat === 'none' ? '' : ` (${repeat})`
      toast.success(`Message scheduled for ${new Date(scheduledFor).toLocaleString()}${repeatLabel}`)
      onOpenChange(false)
      // Reset form
      setRepeat('none')
      setRepeatUntil('')
    } catch { toast.error('Network error') }
    finally { setSending(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Clock className="w-4 h-4 text-[var(--wasl-green)]" /> Schedule Message</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/50 p-2.5 text-sm border border-border">
            "{content.slice(0, 80)}{content.length > 80 ? '...' : ''}"
          </div>

          {/* Send-time optimizer card */}
          {sendTimeLoading ? (
            <div className="rounded-lg border border-[var(--wasl-green)]/30 bg-[var(--wasl-green)]/5 p-2.5 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--wasl-green)]" />
              <span className="text-[11px] text-muted-foreground">Analyzing recipient's activity pattern…</span>
            </div>
          ) : sendTime?.hasData && sendTime.recommendedLabel ? (
            <div className="rounded-lg border border-[var(--wasl-green)]/30 bg-gradient-to-br from-[var(--wasl-green)]/8 to-transparent p-2.5 wasl-anim-slide-up">
              <div className="flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[var(--wasl-green)] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-[var(--wasl-green)] flex items-center gap-1">
                    Optimal send time
                    <span className={cn(
                      'inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[9px] font-bold uppercase',
                      sendTime.confidence === 'high'
                        ? 'bg-[var(--wasl-green)]/20 text-[var(--wasl-green)]'
                        : sendTime.confidence === 'medium'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground',
                    )}>
                      <TrendingUp className="w-2 h-2" />
                      {sendTime.confidence} confidence
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-foreground mt-0.5">
                    {sendTime.recommendedLabel}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Based on {sendTime.totalMessages} messages of recipient activity
                  </div>
                  <button
                    onClick={applyRecommendation}
                    className="mt-1.5 text-[10px] font-medium text-[var(--wasl-green)] hover:text-[var(--wasl-green-dark)] flex items-center gap-1"
                  >
                    <Clock className="w-2.5 h-2.5" />
                    Use this time →
                  </button>
                </div>
              </div>
              {sendTime.topHours.length > 1 && (
                <div className="mt-2 pt-2 border-t border-[var(--wasl-green)]/20 flex flex-wrap gap-1">
                  {sendTime.topHours.slice(0, 3).map((h, i) => (
                    <span
                      key={h.hour}
                      className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded-full',
                        i === 0
                          ? 'bg-[var(--wasl-green)] text-white font-semibold'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {h.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : sendTime && !sendTime.hasData ? (
            <div className="rounded-lg border border-border bg-muted/30 p-2 text-[10px] text-muted-foreground">
              {sendTime.reason || 'No activity pattern yet — pick any time.'}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="sched-time">Send at</Label>
            <Input id="sched-time" type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} />
          </div>
          {/* Recurring schedule section */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Repeat className="w-3.5 h-3.5 text-[var(--wasl-green)]" />
              Repeat
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {REPEAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRepeat(opt.value)}
                  className={`text-left p-2 rounded-lg border text-sm transition-colors ${
                    repeat === opt.value
                      ? 'border-[var(--wasl-green)] bg-[var(--wasl-green)]/10 text-foreground'
                      : 'border-border hover:border-[var(--wasl-green)]/40 hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          {/* End date for recurring messages */}
          {repeat !== 'none' && (
            <div className="space-y-2">
              <Label htmlFor="sched-until">End date (optional)</Label>
              <Input
                id="sched-until"
                type="date"
                value={repeatUntil}
                onChange={e => setRepeatUntil(e.target.value)}
                min={scheduledFor ? scheduledFor.split('T')[0] : undefined}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave empty to repeat indefinitely until you cancel it.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={schedule} disabled={sending || !scheduledFor} className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white">
            {sending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {repeat === 'none' ? 'Schedule' : 'Schedule Recurring'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
