'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Wand2, Loader2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const TONES = [
  { key: 'professional', label: 'Professional', emoji: '💼' },
  { key: 'casual', label: 'Casual', emoji: '😎' },
  { key: 'friendly', label: 'Friendly', emoji: '😊' },
  { key: 'concise', label: 'Concise', emoji: '✂️' },
  { key: 'formal', label: 'Formal', emoji: '🎩' },
]

export function ToneAdjusterDialog({ open, onOpenChange, initialContent, onApply }: {
  open: boolean; onOpenChange: (v: boolean) => void
  initialContent: string; onApply: (content: string) => void
}) {
  const [original, setOriginal] = useState(initialContent)
  const [adjusted, setAdjusted] = useState('')
  const [tone, setTone] = useState('professional')
  const [loading, setLoading] = useState(false)

  async function adjust() {
    if (!original.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/ai/tone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: original, tone }),
      })
      const data = await res.json()
      if (res.ok) setAdjusted(data.adjusted)
    } catch {} finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="w-4 h-4 text-[var(--wasl-green)]" /> AI Tone Adjuster</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {TONES.map(t => (
              <button key={t.key} type="button" onClick={() => setTone(t.key)}
                className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs border transition-colors',
                  tone === t.key ? 'border-[var(--wasl-green)] bg-[var(--wasl-green)]/10' : 'border-border hover:bg-muted/50')}>
                <span className="block">{t.emoji}</span>
                <span className="block mt-0.5">{t.label}</span>
              </button>
            ))}
          </div>
          <Textarea value={original} onChange={e => setOriginal(e.target.value)} placeholder="Type your message..." rows={3} />
          <Button onClick={adjust} disabled={loading || !original.trim()} size="sm" className="w-full bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white">
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
            Adjust Tone
          </Button>
          {adjusted && (
            <div className="space-y-2">
              <div className="rounded-lg bg-[var(--wasl-green)]/10 border border-[var(--wasl-green)]/30 p-3 text-sm">{adjusted}</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { onApply(adjusted); onOpenChange(false) }} className="flex-1">Apply</Button>
                <Button variant="ghost" size="sm" onClick={async () => { await navigator.clipboard.writeText(adjusted); toast.success('Copied') }}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
