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
  Users,
  Loader2,
  RefreshCw,
  GitMerge,
  Phone,
  User,
  SkipForward,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type ContactForDedup = {
  id: string
  name: string
  phone: string | null
  username?: string | null
  userId?: string | null
}

type DuplicatePair = {
  contactA: ContactForDedup
  contactB: ContactForDedup
  score: number
  signals: {
    nameSimilarity: number
    phoneSimilarity: number
    usernameSimilarity: number
  }
  primarySignal: 'name' | 'phone' | 'username'
}

type DuplicatesResponse = {
  totalContacts: number
  duplicatePairs: number
  duplicateGroups: number
  pairs: DuplicatePair[]
  groups: Array<{
    contacts: ContactForDedup[]
    bestScore: number
  }>
}

export function ContactDuplicatesDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [data, setData] = useState<DuplicatesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [merging, setMerging] = useState<string | null>(null)
  const [skippedPairs, setSkippedPairs] = useState<Set<string>>(new Set())

  const fetchDuplicates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/contacts/duplicates', { cache: 'no-store' })
      if (!res.ok) { toast.error('Failed'); return }
      const json = await res.json()
      setData(json)
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchDuplicates()
    else {
      setData(null)
      setSkippedPairs(new Set())
    }
  }, [open, fetchDuplicates])

  async function handleMerge(primaryId: string, secondaryId: string) {
    setMerging(`${primaryId}|${secondaryId}`)
    try {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryId, secondaryId }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json?.error || 'Merge failed'); return }
      toast.success('Contacts merged')
      await fetchDuplicates()
    } catch {
      toast.error('Network error')
    } finally {
      setMerging(null)
    }
  }

  function handleSkip(pairKey: string) {
    setSkippedPairs((prev) => new Set(prev).add(pairKey))
  }

  const visiblePairs = data?.pairs.filter((p) => !skippedPairs.has(`${p.contactA.id}|${p.contactB.id}`)) ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto wasl-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-[var(--wasl-green)]" />
            Duplicate Contacts
          </DialogTitle>
          <DialogDescription>
            Smart fuzzy matching finds contacts that look like the same person.
            Built from scratch with Jaro-Winkler + E.164 phone normalization.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[var(--wasl-green)]" />
            <p className="text-xs text-muted-foreground">
              Running O(n²) Jaro-Winkler + E.164 phone matching on all contacts…
            </p>
          </div>
        ) : !data ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No data</div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="Total contacts" value={data.totalContacts} />
              <StatBox label="Duplicate pairs" value={data.duplicatePairs} color="text-amber-500" />
              <StatBox label="Merge groups" value={data.duplicateGroups} color="text-[var(--wasl-green)]" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {visiblePairs.length} reviewable pair{visiblePairs.length === 1 ? '' : 's'}
              </span>
              <Button
                onClick={fetchDuplicates}
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
              >
                <RefreshCw className={cn('w-3 h-3 mr-1', loading && 'animate-spin')} />
                Rescan
              </Button>
            </div>

            {visiblePairs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <div className="wasl-empty-orb mb-3 flex items-center justify-center" style={{ width: 64, height: 64 }}>
                  <Check className="w-8 h-8 text-[var(--wasl-green)]" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-medium">No duplicates found</p>
                <p className="text-[11px] mt-1 max-w-[280px]">
                  Your contacts are clean. Smart matching checked every pair against
                  name (Jaro-Winkler), phone (E.164 + last-7-digits), and username.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {visiblePairs.map((pair) => {
                  const key = `${pair.contactA.id}|${pair.contactB.id}`
                  return (
                    <DuplicatePairCard
                      key={key}
                      pair={pair}
                      onMerge={() => handleMerge(pair.contactA.id, pair.contactB.id)}
                      onSkip={() => handleSkip(key)}
                      isMerging={merging === key}
                    />
                  )
                })}
              </div>
            )}

            {/* Algorithm footer */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[10px] text-muted-foreground">
              <strong>Algorithm:</strong> For each pair, computes Jaro-Winkler similarity
              on normalized names (lowercased, diacritics stripped, name tokens sorted),
              E.164 phone normalization (last-7-digits match = 0.9, exact = 1.0), and
              exact username match. Final score = weighted max with multi-signal bonus.
              Threshold for "duplicate": ≥ 0.85. Connected-component grouping via union-find.
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2 text-center">
      <div className={cn('text-lg font-bold tabular-nums', color || 'text-foreground')}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  )
}

function DuplicatePairCard({ pair, onMerge, onSkip, isMerging }: {
  pair: DuplicatePair
  onMerge: () => void
  onSkip: () => void
  isMerging: boolean
}) {
  const scorePercent = Math.round(pair.score * 100)
  const scoreColor = scorePercent >= 95 ? 'text-[var(--wasl-green)]' :
                     scorePercent >= 90 ? 'text-amber-500' :
                     'text-rose-500'

  return (
    <div className="rounded-lg border border-border p-3 wasl-anim-slide-up">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-muted-foreground">
          {scorePercent}% match
        </span>
        <span className={cn('text-sm font-bold', scoreColor)}>{scorePercent}%</span>
      </div>

      {/* Progress bar for score */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
        <div
          className={cn(
            'h-full rounded-full',
            scorePercent >= 95 ? 'bg-[var(--wasl-green)]' :
            scorePercent >= 90 ? 'bg-amber-500' :
            'bg-rose-500',
          )}
          style={{ width: `${scorePercent}%` }}
        />
      </div>

      {/* Both contacts side by side */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <ContactMini contact={pair.contactA} />
        <ContactMini contact={pair.contactB} />
      </div>

      {/* Signal breakdown */}
      <div className="grid grid-cols-3 gap-1.5 mb-3 text-center">
        <SignalBar label="Name" value={pair.signals.nameSimilarity} highlighted={pair.primarySignal === 'name'} />
        <SignalBar label="Phone" value={pair.signals.phoneSimilarity} highlighted={pair.primarySignal === 'phone'} icon={Phone} />
        <SignalBar label="Username" value={pair.signals.usernameSimilarity} highlighted={pair.primarySignal === 'username'} icon={User} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          onClick={onMerge}
          disabled={isMerging}
          size="sm"
          className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white flex-1"
        >
          {isMerging ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <GitMerge className="w-3.5 h-3.5 mr-1" />}
          Merge → A
        </Button>
        <Button
          onClick={onSkip}
          size="sm"
          variant="outline"
        >
          <SkipForward className="w-3.5 h-3.5 mr-1" />
          Skip
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
        Merging will copy missing fields from B into A and delete B. No data is overwritten.
      </p>
    </div>
  )
}

function ContactMini({ contact }: { contact: ContactForDedup }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="text-sm font-medium truncate">{contact.name || '(no name)'}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
        <Phone className="w-2.5 h-2.5" />
        {contact.phone || '—'}
      </div>
      {contact.username && (
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <User className="w-2.5 h-2.5" />
          @{contact.username}
        </div>
      )}
    </div>
  )
}

function SignalBar({ label, value, highlighted, icon: Icon }: {
  label: string
  value: number
  highlighted?: boolean
  icon?: typeof Phone
}) {
  const percent = Math.round(value * 100)
  const color = percent >= 90 ? 'bg-[var(--wasl-green)]' :
                percent >= 50 ? 'bg-amber-500' :
                'bg-muted-foreground/40'
  return (
    <div className={cn(
      'rounded-md p-1.5 border transition-colors',
      highlighted ? 'border-[var(--wasl-green)]/40 bg-[var(--wasl-green)]/5' : 'border-border/40',
    )}>
      <div className="flex items-center justify-center gap-0.5 mb-1">
        {Icon && <Icon className="w-2.5 h-2.5 text-muted-foreground" />}
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="text-[11px] font-bold tabular-nums">{percent}%</div>
      <div className="h-1 rounded-full bg-muted overflow-hidden mt-1">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
