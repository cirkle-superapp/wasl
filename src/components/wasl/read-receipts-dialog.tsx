'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { CheckCheck, Loader2 } from 'lucide-react'
import { WaslAvatar } from './wasl-avatar'
import { formatChatTimestamp, formatLastSeen } from '@/lib/time'
import { useWaslStore } from '@/lib/store'

type ReadBy = {
  userId: string
  name: string
  username: string
  avatar: string | null
  avatarColor: string | null
  online: boolean
  lastSeen: string
  readAt: string
}

export function ReadReceiptsDialog({
  open,
  onOpenChange,
  messageId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  messageId: string | null
}) {
  const [readBy, setReadBy] = useState<ReadBy[]>([])
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [loading, setLoading] = useState(false)
  const onlineUserIds = useWaslStore((s) => s.onlineUserIds)

  const load = useCallback(async () => {
    if (!messageId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/messages/${messageId}/read-receipts`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        setReadBy([])
        return
      }
      const data = await res.json()
      setReadBy(data.readBy || [])
      setTotalParticipants(data.totalParticipants || 0)
    } catch {
      setReadBy([])
    } finally {
      setLoading(false)
    }
  }, [messageId])

  useEffect(() => {
    if (open) {
      load()
    }
  }, [open, load])

  const unreadCount = Math.max(0, totalParticipants - readBy.length)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCheck className="w-5 h-5 text-sky-500" />
            Read by
          </DialogTitle>
          <DialogDescription>
            {totalParticipants > 0
              ? `${readBy.length} of ${totalParticipants} recipient${totalParticipants === 1 ? '' : 's'} read this message`
              : 'Read receipts for this message'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto wasl-scroll -mx-2 px-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : readBy.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-sky-500/10 flex items-center justify-center mb-3">
                <CheckCheck className="w-7 h-7 text-sky-400" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                Not read yet
              </p>
              <p className="text-xs max-w-[220px]">
                {totalParticipants > 0
                  ? `Waiting for ${unreadCount} recipient${unreadCount === 1 ? '' : 's'} to read this message.`
                  : 'No recipients in this conversation.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Read section header */}
              {readBy.length > 0 && (
                <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-500 px-2 py-1.5 flex items-center gap-1">
                  <CheckCheck className="w-3 h-3" /> Read
                </div>
              )}
              {readBy.map((p) => {
                const isOnline = onlineUserIds.has(p.userId) || p.online
                return (
                  <div
                    key={p.userId}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <WaslAvatar
                      name={p.name}
                      src={p.avatar}
                      color={p.avatarColor}
                      size={36}
                      online={isOnline}
                      showStatus
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate text-foreground">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        Read {formatChatTimestamp(p.readAt)}
                      </div>
                    </div>
                    <CheckCheck className="w-4 h-4 text-sky-500 shrink-0" />
                  </div>
                )
              })}

              {/* Unread section */}
              {unreadCount > 0 && (
                <>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-2 py-1.5 mt-2 border-t border-border/40">
                    Remaining ({unreadCount})
                  </div>
                  <p className="text-xs text-muted-foreground px-2 py-2 italic">
                    {unreadCount} recipient{unreadCount === 1 ? '' : 's'} hasn&apos;t read this message yet.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
