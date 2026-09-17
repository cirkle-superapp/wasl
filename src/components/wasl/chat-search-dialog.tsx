'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Search, X, Loader2, Calendar, ChevronDown } from 'lucide-react'
import { useWaslStore, type ChatMessage } from '@/lib/store'
import { WaslAvatar } from './wasl-avatar'
import { formatChatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'

// How long the search highlight stays visible after the user clicks a result.
// The highlight is then cleared so subsequent, non-search renders go back to
// the normal (markdown) rendering pipeline.
const HIGHLIGHT_TTL_MS = 4000

// Format a `YYYY-MM-DD` (the value produced by `<input type="date">`) into a
// human-readable "Jan 1, 2026"-style label. Returns the raw input on parse
// failure so the UI degrades gracefully rather than showing "Invalid Date".
function formatDateLabel(ymd: string): string {
  if (!ymd) return ''
  const d = new Date(ymd)
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Build the active-filter description shown in the collapsible header.
//   from + to → "Jan 1, 2026 — Dec 31, 2026"
//   from only → "Since Jan 1, 2026"
//   to  only → "Until Dec 31, 2026"
function formatActiveRange(from: string, to: string): string {
  if (from && to) {
    return `${formatDateLabel(from)} — ${formatDateLabel(to)}`
  }
  if (from) return `Since ${formatDateLabel(from)}`
  if (to) return `Until ${formatDateLabel(to)}`
  return ''
}

// Header line shown above the results list when there's no text query but a
// date range is active. Mirrors the spec's "Messages from Jan 1 to Dec 31,
// 2026" example (year omitted on the first date when both fall in the same
// calendar year).
function formatRangeHeader(from: string, to: string): string {
  if (from && to) {
    const fd = new Date(from)
    const td = new Date(to)
    if (!Number.isNaN(fd.getTime()) && !Number.isNaN(td.getTime())) {
      const sameYear = fd.getFullYear() === td.getFullYear()
      const fStr = fd.toLocaleDateString(
        'en-US',
        sameYear
          ? { month: 'short', day: 'numeric' }
          : { month: 'short', day: 'numeric', year: 'numeric' }
      )
      const tStr = td.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      return `Messages from ${fStr} to ${tStr}`
    }
    return `Messages from ${formatDateLabel(from)} to ${formatDateLabel(to)}`
  }
  if (from) return `Messages since ${formatDateLabel(from)}`
  if (to) return `Messages until ${formatDateLabel(to)}`
  return ''
}

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
  const setHighlightedMessageId = useWaslStore(
    (s) => s.setHighlightedMessageId
  )
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [results, setResults] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  // Collapsible state for the date filter. Defaults open when a date is
  // already set (e.g. user reopens the dialog after picking a date) and
  // closed otherwise.
  const [dateFilterOpen, setDateFilterOpen] = useState(false)
  // Tracks the active "clear highlight" timer so we can cancel and restart
  // it whenever the user clicks a new result before the previous highlight
  // has faded. Kept in a ref (not state) because it never drives a render.
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset everything when the dialog is (re)opened so the user always
  // starts from a clean slate — matches the original behaviour.
  useEffect(() => {
    if (open) {
      setQuery('')
      setFrom('')
      setTo('')
      setResults([])
      setDateFilterOpen(false)
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
    if (!conversationId) {
      setResults([])
      return
    }
    const q = query.trim()
    if (!q && !from && !to) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(
        `/api/conversations/${conversationId}/search?${params.toString()}`,
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
  }, [conversationId, query, from, to])

  // Debounced search trigger. Re-runs whenever the text query OR either date
  // bound changes (so picking a date immediately narrows the results, no
  // extra "Apply" button needed).
  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim() || from || to) void search()
      else setResults([])
    }, 250)
    return () => clearTimeout(t)
  }, [query, from, to, search])

  const clearDates = useCallback(() => {
    setFrom('')
    setTo('')
  }, [])

  // Active-filter description rendered in the collapsible header. Memoised
  // because it's a pure function of `from`/`to` and feeds a small badge —
  // no point recomputing on every keystroke in the query box.
  const activeRangeLabel = useMemo(
    () => formatActiveRange(from, to),
    [from, to]
  )
  const hasDates = Boolean(from || to)

  // Header line above the results list. Reflects the current "mode":
  //   - dates + no query → "Messages from … to …" (list-all-in-range mode)
  //   - otherwise        → "{N} result(s)[ in date range]"
  const resultsHeader = useMemo(() => {
    if (results.length === 0) return ''
    if (!query.trim() && hasDates) {
      return formatRangeHeader(from, to)
    }
    const count = results.length
    const noun = count === 1 ? 'result' : 'results'
    return hasDates ? `${count} ${noun} in date range` : `${count} ${noun}`
  }, [results, query, hasDates, from, to])

  // Pick the right empty-state copy depending on what the user has entered
  // so far. The spec lists four cases; we handle them explicitly so the
  // wording matches exactly.
  const emptyStateCopy = useMemo(() => {
    if (loading) return null
    if (!query.trim() && !hasDates) {
      return 'Type to search for messages in this conversation.'
    }
    if (query.trim() && results.length === 0) {
      return hasDates
        ? 'No messages found in this date range.'
        : 'No messages found.'
    }
    // hasDates && !query.trim() && results.length === 0 — no messages in
    // the selected range at all.
    if (!query.trim() && hasDates && results.length === 0) {
      return 'No messages in this date range.'
    }
    return null
  }, [loading, query, hasDates, results.length])

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

        {/* Date filter — collapsible so it doesn't crowd the dialog by
            default, but expands inline when the user wants to narrow by
            date. The active-range badge in the header makes the current
            filter visible even when the panel is collapsed. */}
        <Collapsible
          open={dateFilterOpen}
          onOpenChange={setDateFilterOpen}
          className="rounded-lg bg-muted/30 -mx-1 px-1"
        >
          <div className="flex items-center justify-between gap-2 py-1.5 px-1">
            <CollapsibleTrigger
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wasl-green)]/40 rounded"
              aria-label="Toggle date filter"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Filter by date</span>
              {hasDates && activeRangeLabel && (
                <span className="ml-1 inline-flex items-center rounded-md border border-[var(--wasl-green)]/30 bg-[var(--wasl-green)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--wasl-green-dark)] dark:text-[var(--wasl-green)]">
                  {activeRangeLabel}
                </span>
              )}
              <ChevronDown
                className={cn(
                  'w-3 h-3 transition-transform',
                  dateFilterOpen && 'rotate-180'
                )}
              />
            </CollapsibleTrigger>
            {hasDates && (
              <button
                type="button"
                onClick={clearDates}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wasl-green)]/40 rounded px-1"
              >
                <X className="w-3 h-3" />
                Clear dates
              </button>
            )}
          </div>
          <CollapsibleContent>
            <div className="flex items-end gap-2 pb-2 px-1">
              <label className="flex-1 flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  From
                </span>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  max={to || undefined}
                  className="h-8 text-xs px-2"
                  aria-label="Filter from date"
                />
              </label>
              <label className="flex-1 flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  To
                </span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  min={from || undefined}
                  className="h-8 text-xs px-2"
                  aria-label="Filter to date"
                />
              </label>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="max-h-96 overflow-y-auto wasl-scroll -mx-2 px-2">
          {/* Results count / mode header. Skipped while loading and when
              we're in the initial empty state (no query, no dates). */}
          {resultsHeader && !loading && (
            <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-border/40 mb-1">
              {resultsHeader}
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching…
            </div>
          )}
          {!loading && emptyStateCopy && (
            <p className="text-center text-sm text-muted-foreground py-6">
              {emptyStateCopy}
            </p>
          )}
          {results.map((m) => {
            const mine = m.senderId === user?.id
            // Highlight the query in the content. When there's no text query
            // (pure date-range browse), we just render the content verbatim.
            const content = m.content
            const q = query.trim()
            const idx = q
              ? content.toLowerCase().indexOf(q.toLowerCase())
              : -1
            const before = idx > 0 ? content.slice(0, idx) : ''
            const match = idx >= 0 ? content.slice(idx, idx + q.length) : ''
            const after = idx >= 0 ? content.slice(idx + q.length) : content
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
                <div
                  className={cn(
                    'max-w-[80%]',
                    mine ? 'text-right' : 'text-left'
                  )}
                >
                  <div
                    className={cn(
                      'inline-block px-2.5 py-1.5 rounded-lg text-sm',
                      mine ? 'wasl-bubble-out' : 'wasl-bubble-in'
                    )}
                  >
                    {before}
                    {match && (
                      <mark className="bg-amber-300/60 text-foreground rounded px-0.5">
                        {match}
                      </mark>
                    )}
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
