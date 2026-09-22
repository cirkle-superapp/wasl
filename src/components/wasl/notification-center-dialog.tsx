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
import { Loader2, Bell, Users, Megaphone, Clock, GraduationCap, MessageSquare, CheckCheck } from 'lucide-react'
import { useWaslStore } from '@/lib/store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { WaslAvatar } from './wasl-avatar'

type NotificationItem = {
  id: string
  type: 'unread_message' | 'service_provider_announcement' | 'scheduled_due' | 'school_connect'
  at: string
  title: string
  subtitle: string
  conversationId?: string
  unreadCount?: number
  avatarColor?: string | null
  isGroup?: boolean
  providerType?: string
  priority?: number
  whenLabel?: string
}

export function NotificationCenterDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const { setActiveConversation } = useWaslStore()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items || [])
      setUnreadCount(data.unreadCount || 0)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  function openConversation(convId?: string) {
    if (!convId) return
    setActiveConversation(convId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-[var(--wasl-green)]" />
            Notifications
            {unreadCount > 0 && (
              <span className="text-[10px] uppercase tracking-wide bg-[var(--wasl-green)]/15 text-[var(--wasl-green)] px-2 py-0.5 rounded-full font-semibold">
                {unreadCount} unread
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Recent activity across your conversations, schools, and announcements.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto wasl-scroll">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mb-2" />
              <span className="text-sm">Loading notifications…</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center text-center py-12 px-4">
              <div className="h-12 w-12 rounded-full bg-[var(--wasl-green)]/10 flex items-center justify-center mb-3">
                <CheckCheck className="h-6 w-6 text-[var(--wasl-green)]" />
              </div>
              <h3 className="text-sm font-semibold">All caught up</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-[260px]">
                No new notifications. You&apos;ll see unread messages, scheduled reminders, and school activity here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openConversation(item.conversationId)}
                    className={cn(
                      'w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition text-left',
                      'disabled:cursor-default disabled:opacity-100'
                    )}
                    disabled={!item.conversationId}
                  >
                    {/* Icon / avatar */}
                    <div className="shrink-0 mt-0.5">
                      {item.type === 'unread_message' ? (
                        <div
                          className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: item.avatarColor || '#075E54' }}
                        >
                          {item.isGroup ? <Users className="h-4 w-4" /> : (item.title || '?').charAt(0).toUpperCase()}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            'h-9 w-9 rounded-full flex items-center justify-center text-white',
                            typeIconClass(item.type, item.priority)
                          )}
                          style={item.type === 'service_provider_announcement' && item.avatarColor ? { background: item.avatarColor } : undefined}
                        >
                          {typeIcon(item.type)}
                        </div>
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate flex-1 min-w-0">{item.title}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{formatRelative(item.at)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.subtitle}</div>
                      {item.unreadCount && item.unreadCount > 0 && (
                        <span className="inline-flex items-center mt-1 text-[10px] uppercase tracking-wide bg-[var(--wasl-green)]/15 text-[var(--wasl-green)] px-1.5 py-0.5 rounded-full font-semibold">
                          {item.unreadCount} unread
                        </span>
                      )}
                      {item.whenLabel && (
                        <span className="inline-flex items-center mt-1 text-[10px] uppercase tracking-wide bg-amber-500/10 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-semibold">
                          <Clock className="h-3 w-3 mr-1" />
                          {item.whenLabel}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!loading && items.length > 0 && (
          <div className="border-t border-border px-4 py-2 text-center">
            <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => onOpenChange(false)}>
              Mark all as read by visiting each conversation
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function typeIcon(type: string): React.ReactNode {
  switch (type) {
    case 'service_provider_announcement':
      return <Megaphone className="h-4 w-4" />
    case 'scheduled_due':
      return <Clock className="h-4 w-4" />
    case 'school_connect':
      return <GraduationCap className="h-4 w-4" />
    default:
      return <MessageSquare className="h-4 w-4" />
  }
}

function typeIconClass(type: string, priority?: number): string {
  if (type === 'service_provider_announcement') {
    return priority && priority >= 7
      ? 'bg-amber-500'
      : 'bg-[var(--wasl-green)]'
  }
  if (type === 'scheduled_due') return 'bg-amber-500'
  if (type === 'school_connect') return 'bg-[var(--wasl-green)]'
  return 'bg-muted'
}

function formatRelative(at: string): string {
  const date = new Date(at)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay}d`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
