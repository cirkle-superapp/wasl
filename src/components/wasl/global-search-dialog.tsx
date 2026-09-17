'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Search,
  Loader2,
  ArrowDown,
  Users as UsersIcon,
  MessageCircle,
} from 'lucide-react'
import { WaslAvatar, WaslGroupAvatar } from './wasl-avatar'
import { formatChatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useWaslStore } from '@/lib/store'
import { Input } from '@/components/ui/input'

// Shape returned by `GET /api/search`.
type GlobalSearchResult = {
  messageId: string
  content: string
  type: string
  createdAt: string
  senderId: string
  senderName: string
  conversationId: string
  conversationName: string
  conversationAvatar: string | null
  conversationAvatarColor: string
  isGroup: boolean
}

// How long to keep retrying the jump-to-message dispatch after switching
// the active conversation. The chat window loads messages asynchronously,
// so the target bubble may not exist in the DOM immediately — we poll
// until it does (same pattern as GlobalStarredDialog).
const JUMP_RETRY_MS = 1500
const JUMP_POLL_INTERVAL_MS = 100

// Maximum number of characters of message content to show in a search
// result row before truncating with an ellipsis. Long messages would
// otherwise push the conversation header out of view and make the list
// feel dense.
const MAX_CONTENT_CHARS = 220

// Render the message content with the (first occurrence of the) search
// query wrapped in a <mark> tag. We match case-insensitively and only
// highlight the first occurrence to keep the snippet readable.
function HighlightedContent({
  content,
  query,
  isImage,
}: {
  content: string
  query: string
  isImage: boolean
}) {
  // Image messages store the image URL in `content`. Render a thumbnail
  // rather than the raw URL.
  if (isImage) {
    return (
      <div className="rounded-lg overflow-hidden max-w-[200px]">
        <img
          src={content}
          alt="search result"
          className="w-full h-auto"
          referrerPolicy="no-referrer"
        />
      </div>
    )
  }

  const q = query.trim()
  if (!q) {
    return <span className="whitespace-pre-wrap break-words">{content}</span>
  }

  const idx = content.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) {
    return <span className="whitespace-pre-wrap break-words">{content}</span>
  }

  const before = content.slice(0, idx)
  const match = content.slice(idx, idx + q.length)
  const after = content.slice(idx + q.length)

  return (
    <span className="whitespace-pre-wrap break-words">
      {before}
      <mark className="bg-yellow-200 dark:bg-yellow-900/70 text-foreground rounded px-0.5">
        {match}
      </mark>
      {after}
    </span>
  )
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
  initialQuery = '',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  // Optional initial query — when the dialog is opened from the sidebar
  // search box (user pressed Enter), the typed text is forwarded here so
  // the global search dialog starts with that query.
  initialQuery?: string
}) {
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState(initialQuery)
  // Debounced query — actually sent to the API. We keep `query` for the
  // input so typing feels responsive, and `debouncedQ` for the fetch.
  const [debouncedQ, setDebouncedQ] = useState(initialQuery)
  // Total + conversationCount come from the API; total mirrors
  // `results.length` but we keep it as a separate state for clarity.
  const [total, setTotal] = useState(0)
  const [conversationCount, setConversationCount] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { setActiveConversation } = useWaslStore()

  const load = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      const res = await fetch(`/api/search?${params.toString()}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        setResults([])
        setTotal(0)
        setConversationCount(0)
        return
      }
      const data = await res.json()
      setResults(data.results || [])
      setTotal(data.total || 0)
      setConversationCount(data.conversationCount || 0)
    } catch {
      setResults([])
      setTotal(0)
      setConversationCount(0)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reset + seed state when the dialog opens. `initialQuery` lets the
  // sidebar forward whatever the user typed in the conversation search
  // box so the global search starts with that text.
  useEffect(() => {
    if (open) {
      setQuery(initialQuery)
      setDebouncedQ(initialQuery)
      // Focus the input on next tick so the dialog has a chance to mount.
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, initialQuery])

  // Run the search whenever the dialog is open AND the debounced query
  // changes. We always run a fetch on open even for an empty query —
  // the API short-circuits to `{ results: [], total: 0 }` and the UI
  // shows the "Type to search…" empty state.
  useEffect(() => {
    if (open) {
      load(debouncedQ)
    }
  }, [open, debouncedQ, load])

  // Debounce the search input so we don't fire a request on every
  // keystroke. 250ms matches the per-conversation search dialog and
  // feels responsive without thrashing the API.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(query.trim())
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Group results by conversationId, preserving the order conversations
  // first appear in (since `results` is already sorted by createdAt desc,
  // the first time we see a conversationId is its "newest message" time —
  // groups are therefore implicitly sorted by most-recent match).
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        conversationId: string
        conversationName: string
        conversationAvatar: string | null
        conversationAvatarColor: string
        isGroup: boolean
        messages: GlobalSearchResult[]
      }
    >()
    for (const r of results) {
      let g = map.get(r.conversationId)
      if (!g) {
        g = {
          conversationId: r.conversationId,
          conversationName: r.conversationName,
          conversationAvatar: r.conversationAvatar,
          conversationAvatarColor: r.conversationAvatarColor,
          isGroup: r.isGroup,
          messages: [],
        }
        map.set(r.conversationId, g)
      }
      g.messages.push(r)
    }
    return Array.from(map.values())
  }, [results])

  // Switch to the message's conversation, then dispatch the existing
  // `wasl:jump-to-message` event so the chat window scrolls to + flashes
  // the bubble. We retry the dispatch on a short interval because the
  // target conversation's messages are loaded asynchronously after we
  // set it active, so the DOM element may not exist on the first try.
  // (Same retry-poll pattern as GlobalStarredDialog.)
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

  const trimmedQuery = query.trim()
  const hasQuery = trimmedQuery.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col gap-0">
        <DialogHeader className="space-y-0">
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]" />
            Search messages
          </DialogTitle>
          <DialogDescription>
            {hasQuery && !loading && total > 0
              ? `${total} result${total === 1 ? '' : 's'} in ${conversationCount} conversation${conversationCount === 1 ? '' : 's'}`
              : 'Search across all your conversations'}
          </DialogDescription>
        </DialogHeader>

        {/* Search bar — auto-focus on open */}
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                // Force an immediate (non-debounced) search on Enter so
                // the user gets instant feedback when they hit return.
                if (debounceRef.current) clearTimeout(debounceRef.current)
                setDebouncedQ(query.trim())
              }
            }}
            placeholder="Search across all chats…"
            className="pl-9 pr-3 bg-muted/50 border-0 h-9 rounded-full"
          />
        </div>

        <div className="max-h-96 overflow-y-auto wasl-scroll -mx-2 px-2 mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Searching…
            </div>
          ) : !hasQuery ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-[var(--wasl-green)]/10 flex items-center justify-center mb-3">
                <MessageCircle className="w-7 h-7 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                Type to search across all your conversations.
              </p>
              <p className="text-xs max-w-[260px]">
                Results will be grouped by conversation so you can quickly
                jump to the right chat.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
                <Search className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                No messages found for &ldquo;{trimmedQuery}&rdquo;.
              </p>
              <p className="text-xs max-w-[260px]">
                Try a different keyword or check the spelling.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Result count line — gives the user a quick summary before
                  diving into the groups. */}
              <div className="px-1 text-[11px] font-medium text-muted-foreground">
                {total} result{total === 1 ? '' : 's'} in{' '}
                {conversationCount} conversation
                {conversationCount === 1 ? '' : 's'}
              </div>

              {grouped.map((g) => (
                <div key={g.conversationId} className="space-y-1.5">
                  {/* Conversation header — avatar + name + group icon */}
                  <div className="flex items-center gap-2 px-1 sticky top-0 bg-background/95 backdrop-blur-sm py-1 z-10">
                    {g.isGroup ? (
                      <WaslGroupAvatar
                        name={g.conversationName}
                        src={g.conversationAvatar}
                        size={22}
                      />
                    ) : (
                      <WaslAvatar
                        name={g.conversationName}
                        src={g.conversationAvatar}
                        color={g.conversationAvatarColor}
                        size={22}
                      />
                    )}
                    <span className="text-xs font-semibold text-foreground truncate">
                      {g.conversationName}
                    </span>
                    {g.isGroup && (
                      <UsersIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                      {g.messages.length} match
                      {g.messages.length === 1 ? '' : 'es'}
                    </span>
                  </div>

                  {/* Messages under this conversation */}
                  <div className="space-y-1.5">
                    {g.messages.map((m) => {
                      const isImage = m.type === 'image'
                      const isMine =
                        m.senderId === useWaslStore.getState().user?.id
                      // Truncate very long message bodies so the row
                      // stays compact and scannable.
                      const truncatedContent =
                        !isImage && m.content.length > MAX_CONTENT_CHARS
                          ? m.content.slice(0, MAX_CONTENT_CHARS) + '…'
                          : m.content
                      return (
                        <div
                          key={m.messageId}
                          className={cn(
                            'wasl-msg-in rounded-lg border border-border bg-white/70 dark:bg-white/5 p-2.5 space-y-1',
                            'hover:border-[var(--wasl-green)]/40 hover:bg-[var(--wasl-green)]/5 transition-colors cursor-pointer group/msg'
                          )}
                          onClick={() =>
                            jumpToMessage(g.conversationId, m.messageId)
                          }
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              jumpToMessage(g.conversationId, m.messageId)
                            }
                          }}
                        >
                          {/* Sender + timestamp row */}
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-foreground">
                              {isMine ? 'You' : m.senderName}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatChatTimestamp(m.createdAt)}
                            </span>
                            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] opacity-0 group-hover/msg:opacity-100 transition-opacity">
                              <ArrowDown className="w-3 h-3" />
                              Jump
                            </span>
                          </div>
                          {/* Message content with highlighted match */}
                          <div className="text-sm text-foreground pl-1 border-l-2 border-[var(--wasl-green)]/30">
                            <HighlightedContent
                              content={truncatedContent}
                              query={trimmedQuery}
                              isImage={isImage}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
