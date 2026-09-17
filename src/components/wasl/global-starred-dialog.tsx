'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Star,
  Lock,
  Search,
  Loader2,
  ArrowDown,
  Users as UsersIcon,
} from 'lucide-react'
import { WaslAvatar, WaslGroupAvatar } from './wasl-avatar'
import { formatChatTimestamp, formatRelative } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useWaslStore } from '@/lib/store'
import { Input } from '@/components/ui/input'

type GlobalStarredMessage = {
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
  conversation: {
    id: string
    name: string
    avatar: string | null
    avatarColor: string | null
    isGroup: boolean
  } | null
}

// How long to keep retrying the jump-to-message dispatch after switching the
// active conversation. The chat window loads messages asynchronously, so the
// target bubble may not exist in the DOM immediately — we poll until it does.
const JUMP_RETRY_MS = 1500
const JUMP_POLL_INTERVAL_MS = 100

export function GlobalStarredDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [starred, setStarred] = useState<GlobalStarredMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  // Debounced query — actually sent to the API. We keep `query` for the input
  // so typing feels responsive, and `debouncedQ` for the fetch.
  const [debouncedQ, setDebouncedQ] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { setActiveConversation } = useWaslStore()

  const load = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const url = q
        ? `/api/starred?q=${encodeURIComponent(q)}`
        : '/api/starred'
      const res = await fetch(url, { cache: 'no-store' })
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
  }, [])

  // Reload when the dialog opens, and whenever the debounced query changes.
  useEffect(() => {
    if (open) {
      load(debouncedQ)
    }
  }, [open, debouncedQ, load])

  // Debounce the search input so we don't fire a request on every keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(query.trim())
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Switch to the message's conversation, then dispatch the existing
  // `wasl:jump-to-message` event so the chat window scrolls to + flashes the
  // bubble. We retry the dispatch on a short interval because the target
  // conversation's messages are loaded asynchronously after we set it active,
  // so the DOM element may not exist on the first try.
  function jumpToMessage(conversationId: string, messageId: string) {
    setActiveConversation(conversationId)
    onOpenChange(false)

    const start = Date.now()
    function tryDispatch() {
      const exists =
        typeof document !== 'undefined' &&
        !!document.querySelector(`[data-message-id="${messageId}"]`)
      if (exists || Date.now() - start > JUMP_RETRY_MS) {
        window.dispatchEvent(
          new CustomEvent('wasl:jump-to-message', { detail: messageId })
        )
        return
      }
      setTimeout(tryDispatch, JUMP_POLL_INTERVAL_MS)
    }
    // Small initial delay so the chat window has a chance to mount + start
    // fetching messages before we begin polling the DOM.
    setTimeout(tryDispatch, 80)
  }

  const count = starred.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col gap-0">
        <DialogHeader className="space-y-0">
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            Starred messages
          </DialogTitle>
          <DialogDescription>
            {count === 0
              ? 'All your starred messages across every chat'
              : `${count} starred message${count === 1 ? '' : 's'}`}
          </DialogDescription>
        </DialogHeader>

        {/* Search bar */}
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search starred messages…"
            className="pl-9 pr-3 bg-muted/50 border-0 h-9 rounded-full"
          />
        </div>

        <div className="max-h-96 overflow-y-auto wasl-scroll -mx-2 px-2 mt-2">
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
                {query ? 'No matching starred messages' : 'No starred messages yet'}
              </p>
              <p className="text-xs max-w-[260px]">
                {query
                  ? 'Try a different keyword or clear the search.'
                  : 'Tap the star icon on any message to save it here.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {starred.map((s) => {
                const sender = s.message.sender
                const conv = s.conversation
                const isImage = s.message.type === 'image'
                const isMine = s.message.senderId === useWaslStore.getState().user?.id
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'rounded-lg border border-border bg-white/70 dark:bg-white/5 p-3 space-y-2',
                      'hover:border-amber-400/40 hover:bg-amber-500/5 transition-colors cursor-pointer group/star'
                    )}
                    onClick={() =>
                      conv && jumpToMessage(conv.id, s.message.id)
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (conv) jumpToMessage(conv.id, s.message.id)
                      }
                    }}
                  >
                    {/* Conversation badge (avatar + name) — small, top-left */}
                    {conv && (
                      <div className="flex items-center gap-2">
                        {conv.isGroup ? (
                          <WaslGroupAvatar
                            name={conv.name}
                            src={conv.avatar}
                            size={20}
                          />
                        ) : (
                          <WaslAvatar
                            name={conv.name}
                            src={conv.avatar}
                            color={conv.avatarColor}
                            size={20}
                          />
                        )}
                        <span className="text-[11px] font-medium text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] truncate">
                          {conv.name}
                        </span>
                        {conv.isGroup && (
                          <UsersIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                        )}
                        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                          Starred {formatRelative(s.starredAt)}
                        </span>
                      </div>
                    )}

                    {/* Sender header */}
                    {sender && (
                      <div className="flex items-center gap-2">
                        <WaslAvatar
                          name={sender.name}
                          src={sender.avatar}
                          color={sender.avatarColor}
                          size={20}
                        />
                        <span className="text-xs font-medium text-foreground">
                          {isMine ? 'You' : sender.name}
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
                    <div className="text-sm text-foreground break-words whitespace-pre-wrap pl-1 border-l-2 border-amber-400/30">
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

                    {/* Footer: starred timestamp + jump hint */}
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
