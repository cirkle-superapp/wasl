'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, ListChecks, Clock, Send, DollarSign, GitBranch } from 'lucide-react'

const TYPE_ICONS: Record<string, typeof ListChecks> = {
  todo: ListChecks,
  schedule: Clock,
  action: Send,
  finance: DollarSign,
  decision: GitBranch,
}

export function ActionItemsDialog({ open, onOpenChange, conversationId }: {
  open: boolean; onOpenChange: (v: boolean) => void; conversationId: string | null
}) {
  const [items, setItems] = useState<{text:string;type:string;sender:string}[]>([])
  const [loading, setLoading] = useState(false)

  async function extract() {
    if (!conversationId) return
    setLoading(true)
    setItems([])
    try {
      const res = await fetch('/api/ai/action-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      })
      const data = await res.json()
      if (res.ok) setItems(data.items || [])
    } catch {} finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ListChecks className="w-4 h-4 text-[var(--wasl-green)]" /> AI Action Items</DialogTitle>
        </DialogHeader>
        {!items.length && !loading && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-4">Extract action items and tasks from your conversation.</p>
            <Button onClick={extract} className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white">
              <ListChecks className="w-4 h-4 mr-1" /> Extract Action Items
            </Button>
          </div>
        )}
        {loading && <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Analyzing...</div>}
        {items.length > 0 && (
          <div className="space-y-2 max-h-96 overflow-y-auto wasl-scroll">
            {items.map((item, i) => {
              const Icon = TYPE_ICONS[item.type] || ListChecks
              return (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg border border-border bg-muted/30">
                  <Icon className="w-4 h-4 mt-0.5 text-[var(--wasl-green)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{item.text}</p>
                    <span className="text-[10px] text-muted-foreground capitalize">{item.type} • {item.sender}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
