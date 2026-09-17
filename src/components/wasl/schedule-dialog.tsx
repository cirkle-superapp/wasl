'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Clock, Loader2, Repeat } from 'lucide-react'
import { toast } from 'sonner'

const REPEAT_OPTIONS = [
  { value: 'none', label: 'One-time', desc: 'Send once' },
  { value: 'daily', label: 'Daily', desc: 'Repeat every day' },
  { value: 'weekly', label: 'Weekly', desc: 'Repeat every week' },
  { value: 'monthly', label: 'Monthly', desc: 'Repeat every month' },
] as const

export function ScheduleDialog({ open, onOpenChange, conversationId, content }: {
  open: boolean; onOpenChange: (v: boolean) => void
  conversationId: string | null; content: string
}) {
  const [scheduledFor, setScheduledFor] = useState('')
  const [repeat, setRepeat] = useState<string>('none')
  const [repeatUntil, setRepeatUntil] = useState('')
  const [sending, setSending] = useState(false)

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
