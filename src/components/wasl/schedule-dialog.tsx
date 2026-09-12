'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function ScheduleDialog({ open, onOpenChange, conversationId, content }: {
  open: boolean; onOpenChange: (v: boolean) => void
  conversationId: string | null; content: string
}) {
  const [scheduledFor, setScheduledFor] = useState('')
  const [sending, setSending] = useState(false)

  async function schedule() {
    if (!conversationId || !content.trim() || !scheduledFor) return
    setSending(true)
    try {
      const res = await fetch('/api/scheduled-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, content, scheduledFor: new Date(scheduledFor).toISOString() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error || 'Failed'); return }
      toast.success(`Message scheduled for ${new Date(scheduledFor).toLocaleString()}`)
      onOpenChange(false)
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={schedule} disabled={sending || !scheduledFor} className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white">
            {sending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
