'use client'

import { useState, useEffect, useCallback } from 'react'
import { BarChart3, Loader2, Users, Check } from 'lucide-react'
import { useWaslStore } from '@/lib/store'
import { getSocket } from '@/lib/socket'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { formatChatTimestamp } from '@/lib/time'

type PollData = {
  id: string
  conversationId: string
  question: string
  options: { id: string; text: string; votes: number }[]
  totalVotes: number
  multiChoice: boolean
  anonymous: boolean
  createdBy: string
  myVotes: string[]
  createdAt: string
}

export function PollCard({
  pollId,
  conversationId,
  createdAt,
}: {
  pollId: string
  conversationId: string
  createdAt: string
}) {
  const { user } = useWaslStore()
  const [poll, setPoll] = useState<PollData | null>(null)
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/polls?conversationId=${conversationId}`, {
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = await res.json()
      const found = (data.polls || []).find((p: PollData) => p.id === pollId)
      if (found) setPoll(found)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [conversationId, pollId])

  useEffect(() => {
    load()
  }, [load])

  async function vote(optionId: string) {
    if (!poll || voting) return
    setVoting(optionId)
    try {
      const res = await fetch(`/api/polls/${poll.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId }),
      })
      if (!res.ok) {
        toast.error('Failed to vote')
        return
      }
      getSocket().emit('commit:updated', { conversationId, commitId: poll.id })
      await load()
    } catch {
      toast.error('Network error')
    } finally {
      setVoting(null)
    }
  }

  if (loading) {
    return (
      <div className="wasl-poll-card p-4 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading poll…
      </div>
    )
  }

  if (!poll) {
    return (
      <div className="wasl-poll-card p-4 text-muted-foreground text-sm">
        Poll unavailable
      </div>
    )
  }

  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes, 0)
  const hasVoted = poll.myVotes.length > 0
  const isCreator = poll.createdBy === user?.id

  return (
    <div className="wasl-poll-card p-3 shadow-sm max-w-md">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-4 h-4 text-[var(--wasl-green)] shrink-0" />
        <div className="font-semibold text-sm truncate">{poll.question}</div>
      </div>

      {/* Options */}
      <div className="space-y-1.5 mb-2">
        {poll.options.map((opt) => {
          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0
          const myVoted = poll.myVotes.includes(opt.id)
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => vote(opt.id)}
              disabled={voting !== null}
              className={cn(
                'relative w-full text-left rounded-lg border px-2.5 py-1.5 text-xs transition-colors overflow-hidden',
                myVoted
                  ? 'border-[var(--wasl-green)]/50 bg-[var(--wasl-green)]/5'
                  : 'border-border hover:border-foreground/30 hover:bg-muted/50'
              )}
            >
              {/* Progress bar background */}
              {hasVoted && (
                <div
                  className="absolute inset-0 bg-[var(--wasl-green)]/10"
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 truncate">
                  {myVoted && <Check className="w-3 h-3 text-[var(--wasl-green)] shrink-0" />}
                  <span className="truncate">{opt.text}</span>
                </span>
                {hasVoted && (
                  <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                    {pct}%
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          {totalVotes} vote{totalVotes === 1 ? '' : 's'}
          {poll.multiChoice && ' · multiple'}
        </span>
        <span>{formatChatTimestamp(createdAt)}</span>
      </div>
    </div>
  )
}
