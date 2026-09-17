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
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Bookmark,
  BookmarkCheck,
  Search,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  ArrowDown,
  Lock,
  MessageSquare,
} from 'lucide-react'
import { toast } from 'sonner'
import { WaslAvatar } from './wasl-avatar'
import { formatChatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useWaslStore } from '@/lib/store'

// Cross-conversation jump helpers — same retry pattern used by
// `global-starred-dialog.tsx`. We poll the DOM for the message element until
// it exists (the chat window loads messages asynchronously after we switch
// the active conversation), then dispatch the jump event.
const JUMP_RETRY_MS = 1500
const JUMP_POLL_INTERVAL_MS = 100

type Sender = {
  id: string
  name: string
  username: string
  avatar: string | null
  avatarColor: string | null
}

type ConversationInfo = {
  id: string
  name: string
  isGroup: boolean
  avatar: string | null
  avatarColor: string | null
}

type BookmarkEntry = {
  id: string
  note: string | null
  done: boolean
  doneAt: string | null
  createdAt: string
  message: {
    id: string
    content: string
    type: string
    createdAt: string
    senderId: string
    replyToId: string | null
    protected: boolean | null
    conversationId: string
    sender: Sender | null
    conversation: ConversationInfo | null
  }
}

type FilterTab = 'all' | 'pending' | 'done'

export function BookmarksDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const { setActiveConversation, setBookmarked } = useWaslStore()

  const loadBookmarks = useCallback(async () => {
    setLoading(true)
    try {
      // We always fetch the full list and filter client-side. The endpoint
      // also supports `?done=` and `?q=` server-side filters, but doing it
      // client-side lets the user toggle filter tabs instantly without
      // re-fetching.
      const res = await fetch('/api/bookmarks', { cache: 'no-store' })
      if (!res.ok) {
        setBookmarks([])
        return
      }
      const data = await res.json()
      setBookmarks(data.bookmarks || [])
    } catch {
      setBookmarks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadBookmarks()
    }
  }, [open, loadBookmarks])

  // Filter tabs (All / Pending / Done) + search box. Search filters by note
  // OR message content (case-insensitive).
  const filtered = bookmarks.filter((b) => {
    if (filter === 'pending' && b.done) return false
    if (filter === 'done' && !b.done) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const inNote = b.note?.toLowerCase().includes(q) ?? false
      const inContent = b.message.content.toLowerCase().includes(q)
      if (!inNote && !inContent) return false
    }
    return true
  })

  const pendingCount = bookmarks.filter((b) => !b.done).length
  const doneCount = bookmarks.filter((b) => b.done).length

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

  // PATCH a bookmark (toggle done / update note). We pass an "after" callback
  // so the row can show a saving spinner.
  async function patchBookmark(
    id: string,
    patch: { done?: boolean; note?: string }
  ): Promise<BookmarkEntry | null> {
    try {
      const res = await fetch(`/api/bookmarks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        toast.error('Failed to update bookmark')
        return null
      }
      const data = await res.json()
      return data.bookmark as BookmarkEntry
    } catch {
      toast.error('Network error')
      return null
    }
  }

  // Locally replace a bookmark with its updated copy. If `updated` is null we
  // leave the row as-is (the patch failed).
  function applyUpdate(id: string, updated: Partial<BookmarkEntry> | null) {
    if (!updated) return
    setBookmarks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updated } : b))
    )
  }

  async function handleToggleDone(b: BookmarkEntry) {
    const next = !b.done
    // Optimistic update
    applyUpdate(b.id, {
      done: next,
      doneAt: next ? new Date().toISOString() : null,
    })
    const updated = await patchBookmark(b.id, { done: next })
    if (updated) {
      applyUpdate(b.id, { done: updated.done, doneAt: updated.doneAt })
    } else {
      // Revert
      applyUpdate(b.id, { done: b.done, doneAt: b.doneAt })
    }
  }

  async function handleDelete(b: BookmarkEntry) {
    try {
      const res = await fetch(`/api/bookmarks/${b.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Failed to remove bookmark')
        return
      }
      setBookmarks((prev) => prev.filter((x) => x.id !== b.id))
      setBookmarked(b.message.id, false)
      toast.success('Bookmark removed')
    } catch {
      toast.error('Network error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="w-5 h-5 fill-amber-500 text-amber-500" />
            Bookmarks
            <span className="text-xs font-normal text-muted-foreground ml-1">
              ({bookmarks.length})
            </span>
          </DialogTitle>
          <DialogDescription>
            Messages you&apos;ve saved to follow up on later.
          </DialogDescription>
        </DialogHeader>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search bookmarks or notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filter tabs: All / Pending / Done */}
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as FilterTab)}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">
              All
              <span className="ml-1 text-[10px] text-muted-foreground">
                {bookmarks.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pending
              <span className="ml-1 text-[10px] text-muted-foreground">
                {pendingCount}
              </span>
            </TabsTrigger>
            <TabsTrigger value="done">
              Done
              <span className="ml-1 text-[10px] text-muted-foreground">
                {doneCount}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* List */}
        <div className="flex-1 overflow-y-auto wasl-scroll -mx-2 px-2 min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
                <Bookmark className="w-7 h-7 text-amber-500" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                {bookmarks.length === 0
                  ? 'No bookmarks yet'
                  : 'No bookmarks match this filter'}
              </p>
              <p className="text-xs max-w-[260px]">
                {bookmarks.length === 0
                  ? 'Tap the bookmark icon on any message to save it for later.'
                  : 'Try a different filter or search query.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((b) => (
                <BookmarkRow
                  key={b.id}
                  bookmark={b}
                  onJump={() =>
                    b.message.conversation &&
                    jumpToMessage(b.message.conversation.id, b.message.id)
                  }
                  onToggleDone={() => handleToggleDone(b)}
                  onDelete={() => handleDelete(b)}
                  onSaveNote={async (note) => {
                    const updated = await patchBookmark(b.id, { note })
                    if (updated) {
                      applyUpdate(b.id, { note: updated.note })
                      toast.success('Note saved')
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BookmarkRow({
  bookmark,
  onJump,
  onToggleDone,
  onDelete,
  onSaveNote,
}: {
  bookmark: BookmarkEntry
  onJump: () => void
  onToggleDone: () => void
  onDelete: () => void
  onSaveNote: (note: string) => Promise<void>
}) {
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(bookmark.note || '')
  const [savingNote, setSavingNote] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  // Reset the note draft whenever the bookmark's note changes (e.g. after a
  // successful save from another client).
  useEffect(() => {
    if (!editingNote) {
      setNoteDraft(bookmark.note || '')
    }
  }, [bookmark.note, editingNote])

  // Focus the textarea when entering edit mode.
  useEffect(() => {
    if (editingNote && noteRef.current) {
      noteRef.current.focus()
      noteRef.current.setSelectionRange(
        noteRef.current.value.length,
        noteRef.current.value.length
      )
    }
  }, [editingNote])

  const isImage = bookmark.message.type === 'image'
  const conv = bookmark.message.conversation
  const sender = bookmark.message.sender
  const convName = conv?.name || 'Unknown chat'
  const isDone = bookmark.done

  async function handleSaveNote() {
    setSavingNote(true)
    try {
      await onSaveNote(noteDraft)
      setEditingNote(false)
    } finally {
      setSavingNote(false)
    }
  }

  function handleCancelEdit() {
    setNoteDraft(bookmark.note || '')
    setEditingNote(false)
  }

  async function handleDeleteClick() {
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-white/70 dark:bg-white/5 p-3 space-y-2 transition-colors',
        isDone
          ? 'border-border/50 opacity-75'
          : 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50'
      )}
    >
      {/* Conversation + sender header */}
      <div className="flex items-center gap-2">
        <Checkbox
          checked={isDone}
          onCheckedChange={onToggleDone}
          className={cn(
            'border-amber-500/60 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500',
            'data-[state=checked]:text-white'
          )}
          aria-label={isDone ? 'Mark as pending' : 'Mark as done'}
        />
        {conv && (
          <WaslAvatar
            name={convName}
            src={conv.avatar}
            color={conv.avatarColor}
            size={22}
          />
        )}
        <button
          type="button"
          onClick={onJump}
          className="flex-1 min-w-0 text-left group/conv"
          title="Jump to message"
        >
          <div className="text-xs font-medium text-foreground truncate group-hover/conv:text-[var(--wasl-teal)] dark:group-hover/conv:text-[var(--wasl-green)] transition-colors">
            {convName}
          </div>
        </button>
        {isDone && (
          <BookmarkCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        )}
        {bookmark.message.protected && (
          <Lock className="w-3 h-3 text-[var(--wasl-green)] shrink-0" />
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="shrink-0 p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Remove bookmark"
          aria-label="Remove bookmark"
        >
          {deleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Message body — click to jump. Done bookmarks render with
          strikethrough + muted text to visually mark them as resolved. */}
      <button
        type="button"
        onClick={onJump}
        className="w-full text-left group/jump"
        title="Jump to message"
      >
        {sender && (
          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mb-0.5">
            <span className="font-medium text-foreground/80">
              {sender.name}
            </span>
            <span>·</span>
            <span>{formatChatTimestamp(bookmark.message.createdAt)}</span>
          </div>
        )}
        <div
          className={cn(
            'text-sm break-words whitespace-pre-wrap',
            isDone
              ? 'text-muted-foreground line-through'
              : 'text-foreground'
          )}
        >
          {isImage ? (
            <div className="rounded-lg overflow-hidden max-w-[200px]">
              <img
                src={bookmark.message.content}
                alt="bookmarked"
                className="w-full h-auto"
              />
            </div>
          ) : (
            <Truncate text={bookmark.message.content} max={220} />
          )}
        </div>
      </button>

      {/* Personal note (display + edit) */}
      {!editingNote ? (
        bookmark.note ? (
          <div className="flex items-start gap-1.5 text-xs text-foreground/80 bg-muted/40 dark:bg-muted/20 rounded-md px-2 py-1.5 border border-border/40">
            <MessageSquare className="w-3 h-3 mt-0.5 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] shrink-0" />
            <span className="flex-1 italic whitespace-pre-wrap">{bookmark.note}</span>
            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Edit note"
              aria-label="Edit note"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingNote(true)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Pencil className="w-3 h-3" />
            Add a note
          </button>
        )
      ) : (
        <div className="space-y-1.5">
          <Textarea
            ref={noteRef}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Why are you bookmarking this? (optional)"
            rows={2}
            className="resize-none text-xs"
            disabled={savingNote}
          />
          <div className="flex items-center gap-1.5 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancelEdit}
              disabled={savingNote}
              className="h-7 px-2 text-xs"
            >
              <X className="w-3 h-3 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveNote}
              disabled={savingNote}
              className="h-7 px-2 text-xs bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
            >
              {savingNote ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Check className="w-3 h-3 mr-1" />
              )}
              Save note
            </Button>
          </div>
        </div>
      )}

      {/* Footer: bookmarked time + jump button */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Bookmark className="w-3 h-3 fill-amber-500 text-amber-500" />
          {isDone && bookmark.doneAt
            ? `Done ${formatChatTimestamp(bookmark.doneAt)}`
            : `Saved ${formatChatTimestamp(bookmark.createdAt)}`}
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] opacity-0 group-hover/jump:opacity-100 transition-opacity">
          <ArrowDown className="w-3 h-3" />
          Jump to message
        </span>
      </div>
    </div>
  )
}

// Truncate long message content to `max` characters, appending an ellipsis.
function Truncate({ text, max }: { text: string; max: number }) {
  if (text.length <= max) return <>{text}</>
  return <>{text.slice(0, max).trimEnd()}…</>
}
