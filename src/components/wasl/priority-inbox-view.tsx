'use client'

import { useState, useEffect } from 'react'
import { Zap, Loader2, RefreshCw, AlertTriangle, AtSign, Bell, Activity } from 'lucide-react'
import { useWaslStore, type Conversation } from '@/lib/store'
import { WaslAvatar, WaslGroupAvatar } from './wasl-avatar'
import { cn } from '@/lib/utils'

type PriorityItem = {
  conversationId: string
  name: string
  isGroup: boolean
  score: number
  signals: Record<string, number>
  reasons: string[]
  unreadCount: number
  otherUserOnline: boolean
  topSnippet?: string
}

const REASON_ICONS: Record<string, { icon: typeof AtSign; color: string }> = {
  'Mentions you': { icon: AtSign, color: 'text-rose-500 bg-rose-500/10' },
  'Time-sensitive': { icon: AlertTriangle, color: 'text-amber-500 bg-amber-500/10' },
  'Action needed': { icon: Activity, color: 'text-[var(--wasl-green)] bg-[var(--wasl-green)]/10' },
  'Frequent contact': { icon: Bell, color: 'text-[var(--wasl-teal)] bg-[var(--wasl-teal)]/10' },
  'Active thread': { icon: Zap, color: 'text-[var(--wasl-green)] bg-[var(--wasl-green)]/10' },
}

export function PriorityInboxView({ conversations }: { conversations: Conversation[] }) {
  const [items, setItems] = useState<PriorityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<number>(0)
  const setActiveConversation = useWaslStore((s) => s.setActiveConversation)
  const onlineUserIds = useWaslStore((s) => s.onlineUserIds)

  async function fetchPriority() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/priority-inbox', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      setItems(data.items || [])
      setLastFetch(Date.now())
    } catch (e: any) {
      setError(e?.message || 'Failed to load priority inbox')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPriority()
  }, [])

  // Auto-refresh every 60s while the tab is visible
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchPriority()
      }
    }, 60000)
    return () => clearInterval(id)
  }, [])

  // Build a quick lookup from conversation id → conversation object so we can
  // render avatars properly.
  const convoById = new Map(conversations.map((c) => [c.id, c]))

  if (loading && items.length === 0) {
    return (
      <div className="py-3 px-3 space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-3 p-2 wasl-anim-slide-up wasl-stagger-${i + 1}`}
          >
            <div className="wasl-skeleton wasl-skeleton-circle shrink-0" style={{ width: 44, height: 44 }} />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center gap-2">
                <div className="wasl-skeleton" style={{ width: 110, height: 12 }} />
                <div className="wasl-skeleton" style={{ width: 28, height: 8 }} />
              </div>
              <div className="wasl-skeleton mt-1.5" style={{ width: 160, height: 9 }} />
              <div className="wasl-skeleton mt-1.5" style={{ width: 70, height: 8 }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-500" />
        Could not load priority inbox.
        <button
          onClick={fetchPriority}
          className="mt-2 block mx-auto text-xs text-[var(--wasl-green)] hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center text-muted-foreground">
        <div className="wasl-empty-orb mb-4 flex items-center justify-center" style={{ width: 80, height: 80 }}>
          <Zap className="w-10 h-10 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium">Nothing urgent right now</p>
        <p className="text-[11px] mt-1 max-w-[220px]">
          You're all caught up. Priority items appear here when conversations need your attention.
        </p>
      </div>
    )
  }

  return (
    <div className="py-2">
      {/* Header strip */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-border/60 bg-gradient-to-r from-[var(--wasl-green)]/5 to-transparent">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Zap className="w-3 h-3 text-[var(--wasl-green)]" />
          <span>Top {items.length} priority conversations</span>
        </div>
        <button
          onClick={fetchPriority}
          disabled={loading}
          className="text-[10px] text-muted-foreground hover:text-[var(--wasl-green)] flex items-center gap-1 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
          {loading ? 'Updating' : 'Refresh'}
        </button>
      </div>

      {/* Ranked items */}
      {items.map((item, i) => {
        const convo = convoById.get(item.conversationId)
        const isGroup = item.isGroup
        const otherP = convo?.participants.find((p) => p.userId !== useWaslStore.getState().user?.id)
        const name = item.name
        const avatar = convo?.avatar
        const avatarColor = convo?.avatarColor || undefined
        const online = (otherP && onlineUserIds.has(otherP.userId)) || item.otherUserOnline

        return (
          <button
            key={item.conversationId}
            onClick={() => setActiveConversation(item.conversationId)}
            className={cn(
              'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors border-b border-border/30 wasl-anim-slide-up',
            )}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            {/* Rank badge */}
            <div className="shrink-0 flex flex-col items-center gap-1">
              <div
                className={cn(
                  'h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                  i === 0
                    ? 'bg-[var(--wasl-green)] text-white'
                    : i === 1
                      ? 'bg-[var(--wasl-teal)]/80 text-white'
                      : i === 2
                        ? 'bg-amber-500/80 text-white'
                        : 'bg-muted text-muted-foreground',
                )}
                title={`Priority rank #${i + 1}`}
              >
                {i + 1}
              </div>
              {isGroup ? (
                <WaslGroupAvatar
                  name={name}
                  src={avatar}
                  color={avatarColor}
                  size={40}
                />
              ) : (
                <WaslAvatar
                  name={name}
                  src={avatar}
                  color={avatarColor}
                  size={40}
                  online={online}
                  showStatus
                />
              )}
            </div>

            <div className="flex-1 min-w-0">
              {/* Name + unread badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate flex-1">{name}</span>
                {item.unreadCount > 0 && (
                  <span className="wasl-unread-badge shrink-0">
                    {item.unreadCount > 99 ? '99+' : item.unreadCount}
                  </span>
                )}
              </div>

              {/* Snippet */}
              {item.topSnippet && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {item.topSnippet}
                </p>
              )}

              {/* Reason badges */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {item.reasons.slice(0, 3).map((r) => {
                  const cfg = REASON_ICONS[r]
                  if (!cfg) {
                    return (
                      <span
                        key={r}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[9px] font-medium"
                      >
                        {r}
                      </span>
                    )
                  }
                  const Icon = cfg.icon
                  return (
                    <span
                      key={r}
                      className={cn(
                        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium',
                        cfg.color,
                      )}
                    >
                      <Icon className="w-2.5 h-2.5" />
                      {r}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Priority score bar (subtle, on the right) */}
            <div className="shrink-0 flex flex-col items-end gap-1 pt-1">
              <div className="w-1.5 h-12 rounded-full bg-muted relative overflow-hidden" title={`Priority score: ${Math.round(item.score * 100)}/100`}>
                <div
                  className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--wasl-green)] to-[var(--wasl-teal)] transition-all"
                  style={{ height: `${Math.max(8, Math.min(100, item.score * 100))}%` }}
                />
              </div>
            </div>
          </button>
        )
      })}

      {/* Algorithmic transparency footer */}
      <div className="px-3 py-2 text-[10px] text-muted-foreground/70 border-t border-border/30">
        Ranked by 7 signals: mentions, urgency, action items, unread volume,
        sender importance, thread engagement, time-of-day.
        {lastFetch > 0 && (
          <span className="block mt-0.5 opacity-60">
            Updated {new Date(lastFetch).toLocaleTimeString()} · auto-refreshes every 60s
          </span>
        )}
      </div>
    </div>
  )
}
