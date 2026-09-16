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
  Loader2, Landmark, ShieldCheck, Megaphone, AlertCircle, Info, Bell,
  CheckCircle2, X,
} from 'lucide-react'
import { WaslAvatar } from './wasl-avatar'
import { formatChatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'

type Announcement = {
  id: string
  title: string
  content: string
  type: string
  imagePath: string | null
  priority: number
  createdAt: string
  read: boolean
  dismissed: boolean
  provider: {
    id: string
    name: string
    type: string
    avatarPath: string | null
    avatarColor: string | null
    verified: boolean
  }
}

const TYPE_ICONS: Record<string, typeof Megaphone> = {
  announcement: Megaphone,
  alert: AlertCircle,
  notice: Info,
  update: Bell,
}

export function AnnouncementsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/service-providers/announcements', { cache: 'no-store' })
      if (!res.ok) {
        setAnnouncements([])
        return
      }
      const data = await res.json()
      setAnnouncements(data.announcements || [])
    } catch {
      setAnnouncements([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  // Count unread
  const unreadCount = announcements.filter(a => !a.read && !a.dismissed).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-[var(--wasl-green)]" />
            Official Announcements
            {unreadCount > 0 && (
              <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-[var(--wasl-green)] text-white font-semibold">
                {unreadCount} new
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Official messages from verified banks, government ministries, and service providers.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto wasl-scroll -mx-2 px-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : announcements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-[var(--wasl-green)]/10 flex items-center justify-center mb-3">
                <Megaphone className="w-7 h-7 text-[var(--wasl-green)]" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">No official announcements</p>
              <p className="text-xs max-w-[240px]">
                When verified government ministries, banks, or utility providers send announcements, they will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {announcements.map((a) => {
                const Icon = TYPE_ICONS[a.type] || Megaphone
                return (
                  <div
                    key={a.id}
                    className={cn(
                      'rounded-lg border p-3 space-y-2',
                      a.priority > 5
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-border bg-muted/20',
                      !a.read && 'ring-1 ring-[var(--wasl-green)]/20'
                    )}
                  >
                    {/* Provider header */}
                    <div className="flex items-center gap-2">
                      <WaslAvatar
                        name={a.provider.name}
                        src={a.provider.avatarPath}
                        color={a.provider.avatarColor}
                        size={28}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate flex items-center gap-1">
                          {a.provider.name}
                          {a.provider.verified && (
                            <ShieldCheck className="w-3 h-3 text-[var(--wasl-green)] shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground capitalize">
                          {a.provider.type} · {formatChatTimestamp(a.createdAt)}
                        </div>
                      </div>
                      <Icon className={cn(
                        'w-4 h-4 shrink-0',
                        a.type === 'alert' ? 'text-amber-500' : 'text-muted-foreground'
                      )} />
                    </div>
                    {/* Announcement content */}
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-foreground">{a.title}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {a.content}
                      </div>
                      {a.imagePath && (
                        <img src={a.imagePath} alt="" className="rounded-lg max-w-full max-h-48 object-cover mt-1" />
                      )}
                    </div>
                    {/* Status footer */}
                    <div className="flex items-center justify-between pt-1 border-t border-border/40">
                      {a.read ? (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Read
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--wasl-green)] font-medium">
                          New
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] px-2"
                        onClick={async () => {
                          // Mark as read + dismissed
                          try {
                            await fetch(`/api/service-providers/announcements/${a.id}/read`, { method: 'POST' })
                            await fetch(`/api/service-providers/announcements/${a.id}/dismiss`, { method: 'POST' })
                            setAnnouncements(prev => prev.filter(x => x.id !== a.id))
                          } catch {}
                        }}
                      >
                        <X className="w-3 h-3 mr-1" /> Dismiss
                      </Button>
                    </div>
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
