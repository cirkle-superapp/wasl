'use client'

import { useState, useEffect } from 'react'
import {
  ShieldCheck,
  Check,
  Clock,
  Loader2,
  Hash,
  Calendar,
  Coins,
  AlertCircle,
  CheckCircle2,
  Copy,
} from 'lucide-react'
import { useWaslStore, type Commit } from '@/lib/store'
import { WaslAvatar } from './wasl-avatar'
import { getSocket } from '@/lib/socket'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { formatChatTimestamp } from '@/lib/time'

export function CommitCard({
  commitId,
  conversationId,
  createdAt,
}: {
  commitId: string
  conversationId: string
  createdAt: string
}) {
  const {
    user,
    commitsByConversation,
    upsertCommit,
  } = useWaslStore()
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<'sign' | 'complete' | null>(null)

  const commit = commitsByConversation[conversationId]?.find(
    (c) => c.id === commitId
  )

  // Load commit on mount + join socket room updates handled by chat-window.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!commitId) return
      if (commit) return // already in store
      setLoading(true)
      try {
        const res = await fetch(`/api/commits/${commitId}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.commit) {
          upsertCommit(data.commit)
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
     
  }, [commitId])

  async function refresh() {
    if (!commitId) return
    try {
      const res = await fetch(`/api/commits/${commitId}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (data.commit) upsertCommit(data.commit)
    } catch {
      // ignore
    }
  }

  async function sign() {
    if (!commitId) return
    setAction('sign')
    try {
      const res = await fetch(`/api/commits/${commitId}/sign`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to sign')
        return
      }
      if (data.commit) upsertCommit(data.commit)
      try {
        getSocket().emit('commit:updated', {
          conversationId: data.commit?.conversationId || conversationId,
          commitId,
        })
      } catch {}
      toast.success('Commit signed')
    } catch {
      toast.error('Network error')
    } finally {
      setAction(null)
    }
  }

  async function complete() {
    if (!commitId) return
    setAction('complete')
    try {
      const res = await fetch(`/api/commits/${commitId}/complete`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to complete')
        return
      }
      if (data.commit) upsertCommit(data.commit)
      try {
        getSocket().emit('commit:updated', {
          conversationId: data.commit?.conversationId || conversationId,
          commitId,
        })
      } catch {}
      toast.success('Commit completed')
    } catch {
      toast.error('Network error')
    } finally {
      setAction(null)
    }
  }

  async function copyHash() {
    if (!commit?.hash) return
    await navigator.clipboard.writeText(commit.hash)
    toast.success('Hash copied')
  }

  if (loading && !commit) {
    return (
      <div className="wasl-commit-card p-4 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading commit…
      </div>
    )
  }

  if (!commit) {
    return (
      <div className="wasl-commit-card p-4 flex items-center gap-2 text-muted-foreground text-sm">
        <AlertCircle className="w-4 h-4" />
        Commit unavailable
      </div>
    )
  }

  const mine = commit.creator.id === user?.id
  const isCounterparty = commit.counterparty.id === user?.id
  const bothSigned = commit.creatorSigned && commit.counterpartySigned
  const canSign =
    isCounterparty && !commit.counterpartySigned && commit.status === 'pending'
  const canComplete =
    (mine || isCounterparty) &&
    commit.status === 'active' &&
    bothSigned

  const statusLabel =
    commit.status === 'pending'
      ? 'Pending signature'
      : commit.status === 'active'
      ? 'Active'
      : commit.status === 'completed'
      ? 'Completed'
      : 'Disputed'

  return (
    <div
      className={cn(
        'wasl-commit-card p-3.5 shadow-sm max-w-md',
        mine ? 'ml-auto' : 'mr-auto'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">{commit.typeEmoji}</span>
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight truncate">
              {commit.title}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {commit.typeLabel} · Commit
            </div>
          </div>
        </div>
        <span
          className={cn(
            'wasl-commit-status-pill wasl-commit-status-' + commit.status
          )}
        >
          {statusLabel}
        </span>
      </div>

      {/* Description */}
      {commit.description && (
        <p className="text-xs text-foreground/80 mb-2 leading-relaxed">
          {commit.description}
        </p>
      )}

      {/* Amount + deadline chips */}
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {commit.amount > 0 && (
          <div className="inline-flex items-center gap-1 text-xs bg-white/70 dark:bg-white/5 border border-border rounded-full px-2 py-0.5">
            <Coins className="w-3 h-3 text-[var(--wasl-green)]" />
            <span className="font-semibold">
              {commit.amount.toLocaleString()} {commit.currency}
            </span>
          </div>
        )}
        {commit.deadline && (
          <div className="inline-flex items-center gap-1 text-xs bg-white/70 dark:bg-white/5 border border-border rounded-full px-2 py-0.5">
            <Calendar className="w-3 h-3 text-muted-foreground" />
            {commit.deadline}
          </div>
        )}
        <div className="inline-flex items-center gap-1 text-xs bg-white/70 dark:bg-white/5 border border-border rounded-full px-2 py-0.5">
          <ShieldCheck className="w-3 h-3 text-[var(--wasl-green)]" />
          Fairness {commit.fairnessScore}
        </div>
      </div>

      {/* Conditions */}
      {commit.conditions.length > 0 && (
        <ul className="text-xs text-foreground/75 space-y-1 mb-2.5 pl-1">
          {commit.conditions.map((c, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <Check className="w-3 h-3 text-[var(--wasl-green)] mt-0.5 shrink-0" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Parties / signatures */}
      <div className="flex items-center gap-3 mb-2.5">
        <Party
          name={commit.creator.name}
          avatar={commit.creator.avatar}
          color={commit.creator.avatarColor}
          signed={commit.creatorSigned}
        />
        <div className="flex-1 h-px bg-border/60" />
        <Party
          name={commit.counterparty.name}
          avatar={commit.counterparty.avatar}
          color={commit.counterparty.avatarColor}
          signed={commit.counterpartySigned}
        />
      </div>

      {/* Fairness note */}
      {commit.fairnessNote && (
        <p className="text-[11px] text-muted-foreground italic mb-2.5 leading-relaxed">
          {commit.fairnessNote}
        </p>
      )}

      {/* Hash */}
      <button
        type="button"
        onClick={copyHash}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mb-2.5"
        title="Click to copy"
      >
        <Hash className="w-3 h-3" />
        <code className="font-mono truncate max-w-[180px]">
          {commit.hash.slice(0, 18)}…{commit.hash.slice(-6)}
        </code>
        <Copy className="w-3 h-3 ml-1" />
      </button>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {canSign && (
          <Button
            type="button"
            size="sm"
            onClick={sign}
            disabled={action !== null}
            className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white h-8"
          >
            {action === 'sign' ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            )}
            Sign commit
          </Button>
        )}
        {canComplete && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={complete}
            disabled={action !== null}
            className="h-8"
          >
            {action === 'complete' ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            )}
            Mark completed
          </Button>
        )}
        {!canSign && !canComplete && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {commit.status === 'completed' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--wasl-green)]" />
                Agreement completed
              </>
            ) : commit.status === 'active' ? (
              <>
                <Clock className="w-3.5 h-3.5" />
                Active — both parties signed
              </>
            ) : !commit.counterpartySigned ? (
              <>
                <Clock className="w-3.5 h-3.5" />
                Awaiting counterparty signature
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5" />
                {statusLabel}
              </>
            )}
          </div>
        )}
      </div>

      {/* Timestamp footer */}
      <div className="text-[10px] text-muted-foreground text-right mt-2">
        {formatChatTimestamp(createdAt)}
      </div>
    </div>
  )
}

function Party({
  name,
  avatar,
  color,
  signed,
}: {
  name: string
  avatar: string | null
  color: string | null
  signed: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <div className="relative">
        <WaslAvatar name={name} src={avatar} color={color} size={32} />
        {signed && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[var(--wasl-green)] border-2 border-white dark:border-[var(--wasl-sidebar-bg)] flex items-center justify-center">
            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
          </div>
        )}
      </div>
      <span className="text-[10px] font-medium truncate max-w-[80px]">
        {name.split(' ')[0]}
      </span>
    </div>
  )
}
