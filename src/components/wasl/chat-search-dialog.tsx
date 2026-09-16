'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Search, X, Loader2 } from 'lucide-react'
import { useWaslStore, type ChatMessage } from '@/lib/store'
import { WaslAvatar } from './wasl-avatar'
import { formatChatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'

// How long the search highlight stays visible after the user clicks a result.
// The highlight is then cleared so subsequent, non-search renders go back to
// the normal (markdown) rendering pipeline.
const HIGHLIGHT_TTL_MS = 4000

export function ChatSearchDialog({
  open,
  onOpenChange,
  conversationId,
  conversationName,
  conversationAvatar,
  conversationAvatarColor,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  conversationId: string | null
  conversationName?: string
  conversationAvatar?: string | null
  conversationAvatarColor?: string | null
}) {
  const { user } = useWaslStore()
  const setHighlightQuery = useWaslStore((s) => s.setHighlightQuery)
  const setHighlightedMessageId = useWaslStore((s) => s.setHighlightedMessageId)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  // Tracks the active "clear highlight" timer so we can cancel and restart
  // it whenever the user clicks a new result before the previous highlight
  // has faded. Kept in a ref (not state) because it never drives a render.
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
    }
  }, [open])

  // Cleanup any pending highlight-clear timer when the dialog unmounts so we
  // don't try to update unmounted store state (harmless but noisy).
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current)
        clearTimerRef.current = null
      }
    }
  }, [])

  const search = useCallback(async () => {
    if (!conversationId || !query.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/search?q=${encodeURIComponent(query.trim())}`,
        { cache: 'no-store' }
      )
      if (!res.ok) return
      const data = await res.json()
      setResults(data.results || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [conversationId, query])

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim()) void search()
      else setResults([])
    }, 250)
    return () => clearTimeout(t)
  }, [query, search])

  // When the user clicks a search result we:
  //   1. Persist the query + target message id into the global store so the
  //      MessageBubble can render a <mark> around the matched substring.
  //   2. Dispatch the existing `wasl:jump-to-message` window event so the
  //      chat window scrolls the target bubble into view and flashes it.
  //   3. Close the search dialog.
  //   4. Arm a timer to clear the highlight so the bubble eventually returns
  //      to its normal (markdown) rendering. The timer is cancelled/restarted
  //      if the user clicks another result before it fires.
  const handleResultClick = useCallback(
    (m: ChatMessage) => {
      const q = query.trim()
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current)
        clearTimerRef.current = null
      }
      setHighlightQuery(q)
      setHighlightedMessageId(m.id)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('wasl:jump-to-message', { detail: m.id })
        )
      }
      onOpenChange(false)
      clearTimerRef.current = setTimeout(() => {
        setHighlightQuery('')
        setHighlightedMessageId(null)
        clearTimerRef.current = null
      }, HIGHLIGHT_TTL_MS)
    },
    [query, setHighlightQuery, setHighlightedMessageId, onOpenChange]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WaslAvatar
              name={conversationName || 'Chat'}
              src={conversationAvatar}
              color={conversationAvatarColor}
              size={24}
            />
            <span className="text-base">Search · {conversationName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-96 overflow-y-auto wasl-scroll -mx-2 px-2">
          {loading && (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching…
            </div>
          )}
          {!loading && query.trim() && results.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">
              No messages found.
            </p>
          )}
          {!loading && !query.trim() && (
            <p className="text-center text-sm text-muted-foreground py-6">
              Type to search for messages in this conversation.
            </p>
          )}
          {results.map((m) => {
            const mine = m.senderId === user?.id
            // Highlight the query in the content
            const content = m.content
            const idx = content.toLowerCase().indexOf(query.toLowerCase())
            const before = idx > 0 ? content.slice(0, idx) : ''
            const match = idx >= 0 ? content.slice(idx, idx + query.length) : ''
            const after = idx >= 0 ? content.slice(idx + query.length) : content
            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => handleResultClick(m)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleResultClick(m)
                  }
                }}
                aria-label={`Jump to message: ${content.slice(0, 80)}`}
                className={cn(
                  'flex gap-2 px-2 py-2 rounded-lg hover:bg-muted/60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wasl-green)]/40',
                  mine && 'flex-row-reverse'
                )}
              >
                <div className={cn('max-w-[80%]', mine ? 'text-right' : 'text-left')}>
                  <div
                    className={cn(
                      'inline-block px-2.5 py-1.5 rounded-lg text-sm',
                      mine ? 'wasl-bubble-out' : 'wasl-bubble-in'
                    )}
                  >
                    {before}
                    <mark className="bg-amber-300/60 text-foreground rounded px-0.5">
                      {match}
                    </mark>
                    {after}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {formatChatTimestamp(m.createdAt)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
