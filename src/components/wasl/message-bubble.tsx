'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Check,
  CheckCheck,
  Clock,
  Reply,
  Star,
  Copy,
  Trash2,
  SmilePlus,
  Play,
  Pause,
  Pencil,
  Forward,
  Lock,
  ExternalLink,
  Pin,
  PinOff,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatChatTimestamp } from '@/lib/time'
import { useWaslStore, type ChatMessage, type Reaction } from '@/lib/store'
import { toast } from 'sonner'
import { findUrls, prettyPath } from '@/lib/link-preview'
import { renderMarkdownLite } from '@/lib/markdown'
import { LinkPreviewCard } from './link-preview-card'
import { ReadReceiptsDialog } from './read-receipts-dialog'
import { EditHistoryDialog } from './edit-history-dialog'
import { MessageInfoDialog } from './message-info-dialog'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

// ---- Protection helpers -------------------------------------------------
// Resolves whether a message is effectively protected from screenshot /
// forwarding. The effective flag is:
//   - the explicit `message.protected` value if it is a boolean
//   - otherwise the sender's `defaultProtectMessages` setting (we don't have
//     the sender's settings here, so we just use the explicit value — the
//     backend always resolves and persists it on send, so the frontend
//     always sees the resolved boolean).
//
// Returns `{ isProtected, isOwner, alwaysAllow, blocked }` where `blocked`
// is true only when the current user is the recipient of a protected
// message and has NOT opted into "privacy always allow".
function useProtectionState(message: ChatMessage) {
  const me = useWaslStore((s) => s.user)
  const isOwner = !!me && message.senderId === me.id
  const alwaysAllow = !!me?.privacyAlwaysAllow
  const isProtected = message.protected === true
  const blocked = isProtected && !isOwner && !alwaysAllow
  return { isProtected, isOwner, alwaysAllow, blocked }
}

// Record a screenshot/copy/save attempt to the audit log via the API and
// show a toast. Idempotent — debounced per-message per-kind to avoid
// spamming the server when the user holds down PrintScreen.
const recentAttemptCache = new Map<string, number>()
function recordAttempt(messageId: string, kind: string) {
  const key = `${messageId}:${kind}`
  const now = Date.now()
  if (recentAttemptCache.has(key)) {
    const last = recentAttemptCache.get(key)!
    // Debounce: at most one record per 5 seconds per kind per message.
    if (now - last < 5000) return
  }
  recentAttemptCache.set(key, now)
  // Fire and forget
  fetch(`/api/messages/${messageId}/screenshot-attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind }),
  }).catch(() => {})
}

const PROTECTED_WARNING =
  '🔒 This message is protected by the sender. Screenshots, copying and forwarding are disabled.'

export function MessageBubble({
  message,
  senderName,
  isGroup,
  replyTo,
  onReact,
  onReply,
  onStar,
  onCopy,
  onDelete,
  onEdit,
  onForward,
  onPin,
  starred,
  reactions,
  currentUserId,
}: {
  message: ChatMessage
  senderName?: string
  isGroup: boolean
  replyTo?: ChatMessage | null
  onReact?: (emoji: string) => void
  onReply?: () => void
  onStar?: () => void
  onCopy?: () => void
  onDelete?: () => void
  onEdit?: () => void
  onForward?: () => void
  onPin?: () => void
  starred?: boolean
  reactions?: Reaction[]
  currentUserId?: string
}) {
  const me = useWaslStore((s) => s.user)
  const mine = message.senderId === me?.id
  const [showReactions, setShowReactions] = useState(false)
  const [readReceiptsOpen, setReadReceiptsOpen] = useState(false)
  const [editHistoryOpen, setEditHistoryOpen] = useState(false)
  const [messageInfoOpen, setMessageInfoOpen] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const protection = useProtectionState(message)
  // `blocked` means: this is a protected message that I RECEIVED and I have
  // NOT enabled "privacy always allow". In that case the bubble becomes
  // read-only: no copy, no forward, no context menu, no drag, no screenshot.
  const blocked = protection.blocked

  // ---- Keyboard capture-blocking (PrintScreen / Ctrl+C / Ctrl+S / Ctrl+P) ---
  // Mounted only when `blocked` is true. We attach a `keyup` listener to
  // `window` so we catch PrintScreen even when the bubble isn't focused, and
  // a `keydown` listener to the bubble element so we can preventDefault on
  // copy/save/print shortcuts when focus is inside the protected bubble.
  useEffect(() => {
    if (!blocked) return
    function onKeyUp(e: KeyboardEvent) {
      // PrintScreen key — most common screenshot trigger on Windows/Linux.
      if (e.key === 'PrintScreen') {
        toast.error(PROTECTED_WARNING, { duration: 4000 })
        recordAttempt(message.id, 'printscreen')
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl/Cmd + C / S / P  → copy / save / print
      const meta = e.ctrlKey || e.metaKey
      if (meta && (e.key === 'c' || e.key === 'C')) {
        const sel = window.getSelection?.()
        // Only block if the selection is inside our bubble.
        if (sel && bubbleRef.current && sel.anchorNode && bubbleRef.current.contains(sel.anchorNode)) {
          e.preventDefault()
          toast.error(PROTECTED_WARNING, { duration: 4000 })
          recordAttempt(message.id, 'copy')
        }
      } else if (meta && (e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P')) {
        if (document.activeElement && bubbleRef.current?.contains(document.activeElement as Node)) {
          e.preventDefault()
          toast.error(PROTECTED_WARNING, { duration: 4000 })
          recordAttempt(message.id, 'save')
        }
      }
    }
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [blocked, message.id])

  // Block the right-click context menu on protected bubbles.
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!blocked) return
      e.preventDefault()
      e.stopPropagation() // Prevent the Radix ContextMenu from opening
      toast.error(PROTECTED_WARNING, { duration: 4000 })
      recordAttempt(message.id, 'contextmenu')
    },
    [blocked, message.id]
  )

  // Block drag of images out of protected bubbles.
  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!blocked) return
      e.preventDefault()
      toast.error(PROTECTED_WARNING, { duration: 4000 })
      recordAttempt(message.id, 'drag')
    },
    [blocked, message.id]
  )

  // Close popover on outside click
  useEffect(() => {
    if (!showReactions) return
    function onClick(e: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowReactions(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showReactions])

  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <div className="wasl-bubble-system text-xs px-3 py-1.5 rounded-lg shadow-sm">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.type === 'commit' && message.commitId) {
    return (
      <div className={cn('flex w-full wasl-animate-in', mine ? 'justify-end' : 'justify-start')}>
        <div className="max-w-[88%] sm:max-w-[75%] md:max-w-[70%]">
          {isGroup && !mine && senderName && (
            <div className="text-xs font-semibold mb-1 ml-1 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]">
              {senderName}
            </div>
          )}
          <CommitMessageWrapper message={message} mine={mine} />
        </div>
      </div>
    )
  }

  if (message.type === 'poll' && message.commitId) {
    return (
      <div className={cn('flex w-full wasl-animate-in', mine ? 'justify-end' : 'justify-start')}>
        <div className="max-w-[88%] sm:max-w-[75%] md:max-w-[70%]">
          {isGroup && !mine && senderName && (
            <div className="text-xs font-semibold mb-1 ml-1 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]">
              {senderName}
            </div>
          )}
          <PollMessageWrapper
            pollId={message.commitId}
            conversationId={message.conversationId}
            createdAt={message.createdAt}
          />
        </div>
      </div>
    )
  }

  if (message.type === 'voice' && message.content.startsWith('data:audio')) {
    return (
      <div className={cn('flex w-full wasl-animate-in', mine ? 'justify-end' : 'justify-start')}>
        <div className={cn('px-2.5 py-1.5 shadow-sm relative', mine ? 'wasl-bubble-out' : 'wasl-bubble-in')}>
          {isGroup && !mine && senderName && (
            <div className="text-xs font-semibold mb-0.5 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]">
              {senderName}
            </div>
          )}
          <VoiceMessagePlayer
            src={message.content}
            mine={mine}
            status={message.status}
            createdAt={message.createdAt}
          />
        </div>
      </div>
    )
  }

  // Group reactions by emoji for the pill display
  const grouped = groupReactions(reactions || [])
  const myReaction = (reactions || []).find((r) => r.userId === currentUserId)?.emoji

  // Detect URLs in text messages so we can render a small preview card.
  // This is a plain function call (not a hook) so it's safe to compute after
  // the early returns above for system / commit / poll / voice messages.
  // The regex is O(n) which is negligible for typical chat message lengths.
  const linkPreview =
    message.type === 'text'
      ? (() => {
          const urls = findUrls(message.content)
          if (urls.length === 0) return null
          const first = urls[0]
          return {
            href: first.href,
            domain: first.domain,
            path: prettyPath(first.path),
          }
        })()
      : null

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'flex w-full wasl-animate-in group/msg',
            mine ? 'justify-end' : 'justify-start'
          )}
        >
          <div className={cn('relative max-w-[78%] sm:max-w-[65%] md:max-w-[60%]')}>
        {/* Hover toolbar — appears on hover (desktop) */}
        <div
          ref={toolbarRef}
          className={cn(
            'wasl-toolbar absolute top-0 z-20 flex items-center gap-0.5 bg-white dark:bg-[var(--wasl-sidebar-bg)] rounded-full shadow-md border border-border px-0.5 py-0.5 transition-opacity',
            mine ? 'left-0 -translate-x-full -ml-1' : 'right-0 translate-x-full -mr-1',
            'opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100'
          )}
        >
          <ToolbarButton title="React" onClick={() => setShowReactions((v) => !v)}>
            <SmilePlus className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Reply" onClick={() => { onReply?.(); setShowReactions(false) }}>
            <Reply className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title={starred ? 'Unstar' : 'Star'} onClick={() => onStar?.()}>
            <Star className={cn('w-4 h-4', starred && 'fill-amber-400 text-amber-400')} />
          </ToolbarButton>
          {blocked ? (
            <ToolbarButton
              title="Copy disabled — message is protected"
              onClick={() => {
                toast.error(PROTECTED_WARNING, { duration: 4000 })
                recordAttempt(message.id, 'copy')
              }}
            >
              <Copy className="w-4 h-4 opacity-40" />
            </ToolbarButton>
          ) : (
            <ToolbarButton title="Copy" onClick={() => { onCopy?.(); setShowReactions(false) }}>
              <Copy className="w-4 h-4" />
            </ToolbarButton>
          )}
          {mine && message.type === 'text' && onEdit && (
            <ToolbarButton title="Edit" onClick={() => onEdit()}>
              <Pencil className="w-4 h-4" />
            </ToolbarButton>
          )}
          {onForward && (
            blocked ? (
              <ToolbarButton
                title="Forward disabled — message is protected"
                onClick={() => {
                  toast.error(PROTECTED_WARNING, { duration: 4000 })
                  recordAttempt(message.id, 'forward')
                }}
              >
                <Forward className="w-4 h-4 opacity-40" />
              </ToolbarButton>
            ) : (
              <ToolbarButton title="Forward" onClick={() => onForward()}>
                <Forward className="w-4 h-4" />
              </ToolbarButton>
            )
          )}
          {mine && (
            <ToolbarButton title="Delete" onClick={() => onDelete?.()} danger>
              <Trash2 className="w-4 h-4" />
            </ToolbarButton>
          )}
        </div>

        {/* Quick reaction popover */}
        {showReactions && (
          <div
            className={cn(
              'absolute -top-11 z-30 flex items-center gap-1 bg-white dark:bg-[var(--wasl-sidebar-bg)] rounded-full shadow-lg border border-border px-1.5 py-1',
              mine ? 'right-0' : 'left-0'
            )}
          >
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => { onReact?.(e); setShowReactions(false) }}
                className="text-lg w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-transform hover:scale-125"
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {/* The bubble */}
        <div
          ref={bubbleRef}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          className={cn(
            'px-2.5 py-1.5 shadow-sm relative',
            mine ? 'wasl-bubble-out' : 'wasl-bubble-in',
            blocked && 'wasl-protected-bubble'
          )}
          style={blocked ? { userSelect: 'none', WebkitUserSelect: 'none' } : undefined}
          data-protected={blocked ? 'true' : undefined}
        >
          {/* Lock badge — shown when the message is protected */}
          {protection.isProtected && (
            <div
              className={cn(
                'absolute -top-1.5 z-10 flex items-center justify-center w-5 h-5 rounded-full shadow-sm border',
                mine
                  ? 'right-1 bg-[var(--wasl-green)] border-[var(--wasl-green-dark)] text-white'
                  : 'left-1 bg-white dark:bg-[var(--wasl-sidebar-bg)] border-border text-[var(--wasl-green)]'
              )}
              title={
                blocked
                  ? '🔒 Protected by sender — screenshot, copy and forward are disabled'
                  : mine
                    ? '🔒 Protected — recipient cannot screenshot or forward'
                    : '🔒 Protected message'
              }
              aria-label="Protected message"
            >
              <Lock className="w-3 h-3" />
            </div>
          )}
          {isGroup && !mine && senderName && (
            <div className="text-xs font-semibold mb-0.5 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]">
              {senderName}
            </div>
          )}
          {replyTo && (
            <div className="border-l-2 border-[var(--wasl-green)] pl-2 mb-1 opacity-70 text-sm bg-black/5 dark:bg-white/5 rounded py-0.5 px-1">
              <div className="text-xs font-medium">
                {replyTo.senderId === me?.id ? 'You' : 'Replied to'}
              </div>
              <div className="truncate">{replyTo.content}</div>
            </div>
          )}
          {message.type === 'image' ? (
            <div className="rounded-lg overflow-hidden max-w-xs">
              <img
                src={message.content}
                alt="sent"
                className={cn('w-full h-auto', blocked && 'pointer-events-none select-none')}
                draggable={!blocked}
                onDragStart={onDragStart}
              />
              <div className="text-[10px] text-right text-foreground/60 mt-0.5 flex items-center justify-end gap-1">
                {protection.isProtected && (
                  <Lock className="w-3 h-3 inline opacity-60" />
                )}
                {formatChatTimestamp(message.createdAt)}
                {mine && <StatusTicks status={message.status} className="ml-1" onClick={() => setReadReceiptsOpen(true)} />}
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'text-sm leading-relaxed break-words whitespace-pre-wrap pr-1',
                blocked && 'select-none'
              )}
            >
              {renderMarkdownLite(message.content)}
              <span className="inline-flex items-center gap-1 ml-2 align-bottom text-[10px] text-foreground/50 float-right mt-1">
                {protection.isProtected && (
                  <Lock className="w-3 h-3 inline opacity-60" />
                )}
                {starred && <Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
                {message.edited && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditHistoryOpen(true)
                    }}
                    className="italic hover:text-foreground transition-colors"
                    title="Edited — click to view edit history"
                  >
                    edited
                  </button>
                )}
                {formatChatTimestamp(message.createdAt)}
                {mine && <StatusTicks status={message.status} onClick={() => setReadReceiptsOpen(true)} />}
              </span>
            </div>
          )}
          {/* Link preview card — shown below any text message that contains
              at least one URL. We render at most one preview (the first URL)
              to keep the bubble compact. The card asynchronously fetches
              OpenGraph meta tags for a richer preview (title + description +
              image), falling back to a favicon-based card while loading. */}
          {message.type === 'text' && !blocked && linkPreview && (
            <LinkPreviewCard
              href={linkPreview.href}
              domain={linkPreview.domain}
              path={linkPreview.path}
            />
          )}
        </div>

        {/* Reactions pill row */}
        {grouped.length > 0 && (
          <div className={cn('flex flex-wrap gap-1 mt-0.5', mine ? 'justify-end' : 'justify-start')}>
            {grouped.map((g) => {
              const mineReacted = g.users.includes(currentUserId || '')
              return (
                <button
                  key={g.emoji}
                  type="button"
                  onClick={() => onReact?.(g.emoji)}
                  className={cn(
                    'wasl-reaction-pill inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors',
                    mineReacted
                      ? 'bg-[var(--wasl-green)]/15 border-[var(--wasl-green)]/50 text-foreground'
                      : 'bg-white dark:bg-[var(--wasl-sidebar-bg)] border-border text-foreground hover:bg-muted'
                  )}
                  title={g.users.length + ' reaction' + (g.users.length === 1 ? '' : 's')}
                >
                  <span>{g.emoji}</span>
                  <span className="text-[10px] font-medium">{g.count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {/* Quick reactions row */}
        <div className="flex items-center justify-around px-1 py-1.5 border-b border-border/60 mb-1">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact?.(emoji)}
              className="text-lg w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted transition-transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
        <ContextMenuItem onClick={() => onReply?.()}>
          <Reply className="w-4 h-4 mr-2" />
          Reply
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onStar?.()}>
          <Star className={cn('w-4 h-4 mr-2', starred && 'fill-amber-400 text-amber-400')} />
          {starred ? 'Unstar' : 'Star'}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onCopy?.()}>
          <Copy className="w-4 h-4 mr-2" />
          Copy
        </ContextMenuItem>
        {onForward && (
          <ContextMenuItem onClick={() => onForward()}>
            <Forward className="w-4 h-4 mr-2" />
            Forward
          </ContextMenuItem>
        )}
        {onPin && (
          <ContextMenuItem onClick={() => onPin()}>
            {message.pinned ? (
              <>
                <PinOff className="w-4 h-4 mr-2" />
                Unpin
              </>
            ) : (
              <>
                <Pin className="w-4 h-4 mr-2" />
                Pin
              </>
            )}
          </ContextMenuItem>
        )}
        {mine && message.type === 'text' && onEdit && (
          <ContextMenuItem onClick={() => onEdit()}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit
          </ContextMenuItem>
        )}
        {/* Message info — shows delivery + read timeline */}
        <ContextMenuItem onClick={() => setMessageInfoOpen(true)}>
          <Info className="w-4 h-4 mr-2" />
          Info
        </ContextMenuItem>
        {mine && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onClick={() => onDelete?.()}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
      {/* Read receipts dialog — opened by clicking the blue read-ticks */}
      <ReadReceiptsDialog
        open={readReceiptsOpen}
        onOpenChange={setReadReceiptsOpen}
        messageId={message.id}
      />
      {/* Edit history dialog — opened by clicking the "edited" indicator */}
      <EditHistoryDialog
        open={editHistoryOpen}
        onOpenChange={setEditHistoryOpen}
        messageId={message.id}
      />
      {/* Message info dialog — shows delivery + read timeline */}
      <MessageInfoDialog
        open={messageInfoOpen}
        onOpenChange={setMessageInfoOpen}
        message={message}
      />
    </ContextMenu>
  )
}

// Wrapper that lazy-loads the CommitCard so the heavy commit data only fetches
// when a commit message is rendered. Keeps this file focused on the bubble.
function CommitMessageWrapper({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const [CommitCard, setCommitCard] = useState<any>(null)
  useEffect(() => {
    import('./commit-card').then((m) => setCommitCard(() => m.CommitCard))
  }, [])
  if (!CommitCard) {
    return (
      <div className="wasl-commit-card p-4 text-xs text-muted-foreground">
        Loading commit…
      </div>
    )
  }
  return (
    <CommitCard
      commitId={message.commitId!}
      conversationId={message.conversationId}
      createdAt={message.createdAt}
    />
  )
}

// Lazy-loaded poll card wrapper (mirrors CommitMessageWrapper).
function PollMessageWrapper({
  pollId,
  conversationId,
  createdAt,
}: {
  pollId: string
  conversationId: string
  createdAt: string
}) {
  const [PollCard, setPollCard] = useState<any>(null)
  useEffect(() => {
    import('./poll-card').then((m) => setPollCard(() => m.PollCard))
  }, [])
  if (!PollCard) {
    return (
      <div className="wasl-poll-card p-4 text-xs text-muted-foreground">
        Loading poll…
      </div>
    )
  }
  return (
    <PollCard
      pollId={pollId}
      conversationId={conversationId}
      createdAt={createdAt}
    />
  )
}

// Voice message playback bubble with a simple play/pause + waveform.
function VoiceMessagePlayer({
  src,
  mine,
  status,
  createdAt,
}: {
  src: string
  mine: boolean
  status: string
  createdAt: string
}) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function toggle() {
    if (!audioRef.current) {
      audioRef.current = new Audio(src)
      audioRef.current.addEventListener('loadedmetadata', () => {
        setDuration(audioRef.current?.duration || 0)
      })
      audioRef.current.addEventListener('timeupdate', () => {
        setProgress(audioRef.current?.currentTime || 0)
      })
      audioRef.current.addEventListener('ended', () => {
        setPlaying(false)
        setProgress(0)
      })
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }

  function formatTime(sec: number) {
    if (!sec || Number.isNaN(sec)) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const pct = duration > 0 ? (progress / duration) * 100 : 0
  // Deterministic pseudo-waveform bars
  const bars = Array.from({ length: 28 }, (_, i) => {
    const h = 30 + Math.sin(i * 1.3 + src.length) * 20 + Math.cos(i * 2.1) * 15
    return Math.max(10, Math.min(100, Math.abs(h)))
  })

  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      <button
        type="button"
        onClick={toggle}
        className="w-9 h-9 rounded-full bg-[var(--wasl-green)] text-white flex items-center justify-center shrink-0 hover:opacity-90"
      >
        {playing ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-0.5 h-8">
          {bars.map((h, i) => {
            const barProgress = (i / bars.length) * 100
            const active = barProgress < pct
            return (
              <div
                key={i}
                className={cn(
                  'w-0.5 rounded-full transition-colors',
                  active
                    ? 'bg-[var(--wasl-green)]'
                    : mine
                    ? 'bg-foreground/30'
                    : 'bg-foreground/20'
                )}
                style={{ height: `${h}%` }}
              />
            )
          })}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-foreground/60">
            {formatTime(playing ? progress : duration)}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-foreground/50">
            {formatChatTimestamp(createdAt)}
            {mine && <StatusTicks status={status} />}
          </span>
        </div>
      </div>
    </div>
  )
}

function ToolbarButton({
  title,
  onClick,
  children,
  danger,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center transition-colors',
        danger
          ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function StatusTicks({
  status,
  className,
  onClick,
}: {
  status: string
  className?: string
  onClick?: () => void
}) {
  if (status === 'sent') {
    return <Check className={cn('w-3.5 h-3.5 inline', className)} />
  }
  if (status === 'delivered') {
    return <CheckCheck className={cn('w-3.5 h-3.5 inline', className)} />
  }
  if (status === 'read') {
    // When onClick is provided, the read-ticks become a clickable button that
    // opens the read-receipts dialog (sender-only feature).
    if (onClick) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          className="inline-flex items-center hover:scale-110 transition-transform"
          title="Read — click to see who read this message"
          aria-label="Read — click to see details"
        >
          <CheckCheck className={cn('w-3.5 h-3.5 inline text-sky-500', className)} />
        </button>
      )
    }
    return (
      <CheckCheck className={cn('w-3.5 h-3.5 inline text-sky-500', className)} />
    )
  }
  return <Clock className={cn('w-3.5 h-3.5 inline', className)} />
}

function groupReactions(reactions: Reaction[]) {
  const map = new Map<string, { emoji: string; count: number; users: string[] }>()
  for (const r of reactions) {
    const ex = map.get(r.emoji)
    if (ex) {
      ex.count++
      ex.users.push(r.userId)
    } else {
      map.set(r.emoji, { emoji: r.emoji, count: 1, users: [r.userId] })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}
