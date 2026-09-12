'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2 } from 'lucide-react'

export function ChatSummaryDialog({ open, onOpenChange, conversationId }: {
  open: boolean; onOpenChange: (v: boolean) => void; conversationId: string | null
}) {
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(false)

  async function generate() {
    if (!conversationId) return
    setLoading(true)
    setSummary('')
    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      })
      const data = await res.json()
      if (res.ok) setSummary(data.summary)
    } catch {}
    finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-[var(--wasl-green)]" /> AI Chat Summary</DialogTitle>
        </DialogHeader>
        {!summary && !loading && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-4">Generate an AI summary of your conversation.</p>
            <Button onClick={generate} className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white">
              <Sparkles className="w-4 h-4 mr-1" /> Generate Summary
            </Button>
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Analyzing conversation...
          </div>
        )}
        {summary && (
          <div className="space-y-3">
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed bg-muted/50 p-3 rounded-lg border border-border">{summary}</pre>
            <Button variant="outline" size="sm" onClick={generate} className="w-full">Regenerate</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
