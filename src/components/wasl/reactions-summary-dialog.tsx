'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { SmilePlus, Loader2 } from 'lucide-react'
import { WaslAvatar } from './wasl-avatar'
import { formatChatTimestamp } from '@/lib/time'
import { useWaslStore } from '@/lib/store'

type ReactionUser = {
  id: string
  name: string
  username: string
  avatar: string | null
  avatarColor: string | null
  reactedAt: string
}

type ReactionSummary = {
  emoji: string
  count: number
  users: ReactionUser[]
}

export function ReactionsSummaryDialog({
  open,
  onOpenChange,
  conversationId,
  conversationName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  conversationId: string | null
  conversationName?: string
}) {
  const [reactions, setReactions] = useState<ReactionSummary[]>([])
  const [totalReactions, setTotalReactions] = useState(0)
  const [loading, setLoading] = useState(false)
  const [expandedEmoji, setExpandedEmoji] = useState<Set<string>>(new Set())
  const onlineUserIds = useWaslStore((s) => s.onlineUserIds)

  const load = useCallback(async () => {
    if (!conversationId) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/reactions-summary`,
        { cache: 'no-store' }
      )
      if (!res.ok) {
        setReactions([])
        return
      }
      const data = await res.json()
      setReactions(data.reactions || [])
      setTotalReactions(data.totalReactions || 0)
      // Auto-expand the first emoji
      if (data.reactions?.length > 0) {
        setExpandedEmoji(new Set([data.reactions[0].emoji]))
      }
    } catch {
      setReactions([])
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    if (open) {
      load()
    }
  }, [open, load])

  function toggleEmoji(emoji: string) {
    setExpandedEmoji((prev) => {
      const next = new Set(prev)
      if (next.has(emoji)) {
        next.delete(emoji)
      } else {
        next.add(emoji)
      }
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SmilePlus className="w-5 h-5 text-amber-500" />
            Reactions
          </DialogTitle>
          <DialogDescription>
            {totalReactions > 0
              ? `${totalReactions} reaction${totalReactions === 1 ? '' : 's'} in ${conversationName || 'this chat'}`
              : `No reactions in ${conversationName || 'this chat'} yet`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto wasl-scroll -mx-2 px-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : reactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
                <SmilePlus className="w-7 h-7 text-amber-400" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                No reactions yet
              </p>
              <p className="text-xs max-w-[240px]">
                React to a message by tapping the smiley icon in the hover
                toolbar or right-clicking a message.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {reactions.map((r) => {
                const isExpanded = expandedEmoji.has(r.emoji)
                return (
                  <div
                    key={r.emoji}
                    className="rounded-lg border border-border bg-white/70 dark:bg-white/5 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleEmoji(r.emoji)}
                      className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-muted/40 transition-colors"
                    >
                      <span className="text-2xl shrink-0">{r.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">
                          {r.count} reaction{r.count === 1 ? '' : 's'}
                        </div>
                        {/* Mini avatar stack */}
                        <div className="flex -space-x-1.5 mt-0.5">
                          {r.users.slice(0, 4).map((u, i) => (
                            <div
                              key={u.id}
                              className="ring-2 ring-white dark:ring-[var(--wasl-sidebar-bg)] rounded-full"
                              style={{ zIndex: 4 - i }}
                            >
                              <WaslAvatar
                                name={u.name}
                                src={u.avatar}
                                color={u.avatarColor}
                                size={20}
                              />
                            </div>
                          ))}
                          {r.users.length > 4 && (
                            <div className="w-5 h-5 rounded-full bg-muted ring-2 ring-white dark:ring-[var(--wasl-sidebar-bg)] flex items-center justify-center text-[9px] font-semibold text-muted-foreground">
                              +{r.users.length - 4}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {isExpanded ? 'Hide' : 'Show'}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border/60 bg-muted/20 p-2 space-y-1">
                        {r.users.map((u) => {
                          const isOnline = onlineUserIds.has(u.id)
                          return (
                            <div
                              key={u.id}
                              className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/40 transition-colors"
                            >
                              <WaslAvatar
                                name={u.name}
                                src={u.avatar}
                                color={u.avatarColor}
                                size={24}
                                online={isOnline}
                                showStatus
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate text-foreground">
                                  {u.name}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {formatChatTimestamp(u.reactedAt)}
                                </div>
                              </div>
                              <span className="text-base shrink-0">{r.emoji}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
