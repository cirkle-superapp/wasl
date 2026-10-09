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
  ShieldCheck,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Link2,
  CheckCircle2,
  AlertTriangle,
  Hash,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type ChainEntry = {
  id: string
  messageId: string
  chainHash: string
  prevChainHash: string
  recomputedHash: string
  isIntact: boolean
  createdAt: string
}

type VerificationResult = {
  totalEntries: number
  verified: number
  tampered: number
  tamperedIndexes: number[]
  isIntact: boolean
  entries: ChainEntry[]
}

export function IntegrityVerificationDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [loading, setLoading] = useState(false)

  const verify = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/integrity/verify', { cache: 'no-store' })
      if (!res.ok) { toast.error('Verification failed'); return }
      const data: VerificationResult = await res.json()
      setResult(data)
      if (data.isIntact) toast.success('Chain is intact')
      else toast.error(`Tampering detected: ${data.tampered} entr${data.tampered === 1 ? 'y' : 'ies'}`)
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) verify()
    else setResult(null)
  }, [open, verify])

  const firstTamperedIdx = result?.tamperedIndexes[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto wasl-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[var(--wasl-green)]" />
            Message Integrity Chain
          </DialogTitle>
          <DialogDescription>
            Cryptographic proof that your message history hasn't been tampered with.
            Every message you send is appended to a SHA-256 hash chain.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[var(--wasl-green)]" />
            <p className="text-xs text-muted-foreground">
              Recomputing SHA-256 hashes + walking the chain…
            </p>
          </div>
        ) : !result ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No data</div>
        ) : (
          <>
            {/* Big status banner */}
            <div className={cn(
              'rounded-lg p-4 border-2 transition-colors wasl-anim-slide-up',
              result.isIntact
                ? 'border-[var(--wasl-green)]/30 bg-[var(--wasl-green)]/5'
                : 'border-rose-500/40 bg-rose-500/5',
            )}>
              <div className="flex items-center gap-3">
                {result.isIntact ? (
                  <ShieldCheck className="w-7 h-7 text-[var(--wasl-green)] shrink-0" />
                ) : (
                  <ShieldAlert className="w-7 h-7 text-rose-500 shrink-0" />
                )}
                <div className="flex-1">
                  <div className={cn(
                    'text-base font-semibold',
                    result.isIntact ? 'text-[var(--wasl-green)]' : 'text-rose-500',
                  )}>
                    {result.isIntact ? 'Chain intact' : 'Tampering detected'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {result.totalEntries} entr{result.totalEntries === 1 ? 'y' : 'ies'} ·
                    {' '}{result.verified} verified ·
                    {' '}{result.tampered} tampered
                  </div>
                </div>
                <Button
                  onClick={verify}
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  title="Re-verify"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                </Button>
              </div>
            </div>

            {/* Algorithm explanation */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[10px] text-muted-foreground">
              <strong>How it works:</strong> Each entry's <code>chainHash</code> = SHA-256(
              prevHash + messageId + conversationId + senderId + content + createdAt).
              Modifying any message invalidates that entry's hash AND every
              subsequent entry (because each depends on the previous one).
              This is the same principle as a blockchain.
            </div>

            {/* Chain visualization */}
            {result.entries.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Chain entries (newest last)
                </div>
                <div className="max-h-72 overflow-y-auto wasl-scroll rounded-lg border border-border">
                  {result.entries.map((e, i) => {
                    const isTampered = !e.isIntact
                    const isBreakpoint = i === firstTamperedIdx
                    return (
                      <div
                        key={e.id}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 border-b border-border/40 last:border-b-0 transition-colors',
                          isTampered
                            ? 'bg-rose-500/5 hover:bg-rose-500/10'
                            : 'hover:bg-muted/40',
                        )}
                      >
                        {/* Status icon */}
                        {isTampered ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--wasl-green)] shrink-0" />
                        )}

                        {/* Index */}
                        <span className={cn(
                          'shrink-0 w-6 text-[10px] font-mono tabular-nums text-right',
                          isTampered ? 'text-rose-500' : 'text-muted-foreground',
                        )}>
                          #{i + 1}
                        </span>

                        {/* Message ID + timestamp */}
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-mono truncate">
                            {e.messageId.slice(0, 25)}…
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(e.createdAt).toLocaleString()}
                          </div>
                        </div>

                        {/* Hash display (truncated) */}
                        <div className="shrink-0 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <Hash className="w-2.5 h-2.5 text-muted-foreground" />
                            <code className={cn(
                              'text-[10px] font-mono',
                              isTampered ? 'text-rose-500' : 'text-muted-foreground',
                            )}>
                              {e.chainHash.slice(0, 12)}…
                            </code>
                          </div>
                          {isTampered && (
                            <div className="text-[9px] text-rose-500 mt-0.5">
                              expected {e.recomputedHash.slice(0, 12)}…
                            </div>
                          )}
                        </div>

                        {isBreakpoint && (
                          <span className="shrink-0 text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-500">
                            Break
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <div className="wasl-empty-orb mb-3 flex items-center justify-center" style={{ width: 64, height: 64 }}>
                  <FileText className="w-8 h-8 text-[var(--wasl-green)]" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-medium">No messages in chain yet</p>
                <p className="text-[11px] mt-1 max-w-[280px]">
                  Send a message — it will be automatically appended to your hash chain,
                  creating a tamper-evident audit log.
                </p>
              </div>
            )}

            {/* Algorithmic transparency footer */}
            <div className="text-[10px] text-muted-foreground text-center pt-2 border-t border-border">
              Built entirely on node:crypto SHA-256 · no external crypto library · chain is per-user
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
