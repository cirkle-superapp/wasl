'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Star, Lock, X, Loader2, MessageSquare, ArrowDown } from 'lucide-react'
import { WaslAvatar } from './wasl-avatar'
import { formatChatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'

type StarredMessage = {
  id: string
  starredAt: string
  message: {
    id: string
    content: string
    type: string
    createdAt: string
    senderId: string
    replyToId: string | null
    protected: boolean | null
    sender: {
      id: string
      name: string
      username: string
      avatar: string | null
      avatarColor: string | null
    } | null
  }
}

export function StarredMessagesDialog({
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
  const [starred, setStarred] = useState<StarredMessage[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!conversationId) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/starred`,
        { cache: 'no-store' }
      )
      if (!res.ok) {
        setStarred([])
        return
      }
      const data = await res.json()
      setStarred(data.starred || [])
    } catch {
      setStarred([])
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    if (open) {
      load()
    }
  }, [open, load])

  // Jump to a starred message in the chat — dispatches a custom window event
  // that the ChatWindow listens for, then closes the dialog.
  function jumpToMessage(messageId: string) {
    window.dispatchEvent(new CustomEvent('wasl:jump-to-message', { detail: messageId }))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            Starred messages
          </DialogTitle>
          <DialogDescription>
            {conversationName
              ? `Messages you've starred in ${conversationName}`
              : "Messages you've starred in this chat"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto wasl-scroll -mx-2 px-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : starred.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
                <Star className="w-7 h-7 text-amber-400" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                No starred messages yet
              </p>
              <p className="text-xs max-w-[240px]">
                Star a message by tapping the star icon in the hover toolbar or
                right-clicking a message.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {starred.map((s) => {
                const sender = s.message.sender
                const isImage = s.message.type === 'image'
                return (
                  <div
                    key={s.id}
                    className="rounded-lg border border-border bg-white/70 dark:bg-white/5 p-3 space-y-2 hover:border-[var(--wasl-green)]/40 hover:bg-[var(--wasl-green)]/5 transition-colors cursor-pointer group/star"
                    onClick={() => jumpToMessage(s.message.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        jumpToMessage(s.message.id)
                      }
                    }}
                  >
                    {/* Sender header */}
                    {sender && (
                      <div className="flex items-center gap-2">
                        <WaslAvatar
                          name={sender.name}
                          src={sender.avatar}
                          color={sender.avatarColor}
                          size={24}
                        />
                        <span className="text-xs font-medium text-foreground">
                          {sender.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatChatTimestamp(s.message.createdAt)}
                        </span>
                        {s.message.protected && (
                          <Lock className="w-3 h-3 text-[var(--wasl-green)] ml-auto" />
                        )}
                      </div>
                    )}
                    {/* Message content */}
                    <div className="text-sm text-foreground break-words whitespace-pre-wrap">
                      {isImage ? (
                        <div className="rounded-lg overflow-hidden max-w-[200px]">
                          <img
                            src={s.message.content}
                            alt="starred"
                            className="w-full h-auto"
                          />
                        </div>
                      ) : (
                        s.message.content
                      )}
                    </div>
                    {/* Footer: starred time + jump button */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        Starred {formatChatTimestamp(s.starredAt)}
                      </div>
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] opacity-0 group-hover/star:opacity-100 transition-opacity">
                        <ArrowDown className="w-3 h-3" />
                        Jump to message
                      </span>
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
