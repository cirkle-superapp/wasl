'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Check,
  CheckCheck,
  Clock,
  Reply,
  Star,
  Bookmark,
  Copy,
  Trash2,
  SmilePlus,
  Pencil,
  Forward,
  Lock,
  ExternalLink,
  Pin,
  PinOff,
  Info,
  Share2,
  FileText,
  Download,
  Music,
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
import { VoicePlayer } from './voice-player'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

// ---- Search highlight helper ---------------------------------------------
// Splits `text` on case-insensitive occurrences of `query` and wraps each
// match in a <mark> with a visible yellow background so the user can see why
// the message was returned by the chat-search dialog.
//
// Supports multi-word queries: if the query contains spaces, each word is
// highlighted independently (e.g. "welcome wasl" highlights both "Welcome"
// and "Wasl" separately). Each word is regex-escaped so special characters
// (`(`, `.`, `*`, …) are matched literally.
//
// Returns the original `text` (a single string node) when either the text or
// query is empty, so plain messages with no active query render with zero
// overhead and no behavioural change vs. before.
function highlightText(text: string, query: string): React.ReactNode {
  if (!text) return text
  const q = query.trim()
  if (!q) return text

  // Split the query into individual words for multi-word highlighting.
  // Filter out empty strings from multiple consecutive spaces.
  const words = q.split(/\s+/).filter(Boolean)
  if (words.length === 0) return text

  // Build a single regex that matches ANY of the words (OR).
  // Each word is regex-escaped so special characters are literal.
  const escapedWords = words.map((w) =>
    w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  const pattern = escapedWords.join('|')
  let regex: RegExp
  try {
    regex = new RegExp(`(${pattern})`, 'gi')
  } catch {
    // Malformed query — bail to plain text rather than crashing the bubble.
    return text
  }
  // String.split with a capturing group keeps the matched delimiters in the
  // result array, so odd indices are the query matches (highlight them) and
  // even indices are the surrounding plain text.
  const parts = text.split(regex)
  if (parts.length === 1) {
    // No matches — render as a single plain string node.
    return text
  }
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="bg-yellow-200 dark:bg-yellow-900/70 text-foreground rounded px-0.5"
      >
        {part}
      </mark>
    ) : (
      // Render empty strings as `null` so React doesn't complain about
      // adjacent text separators. Non-empty even-indexed parts become plain
      // string nodes (no wrapping element needed).
      part || null
    )
  )
}

// ---- File-attachment content parser --------------------------------------
// PDF / document / audio messages store their payload as a small JSON blob
// in the message `content` field: `{ url, name, size }`. This parser tolerates
// a plain URL string too (legacy / forwarded payloads) so the renderer is
// resilient when the JSON shape isn't present.
export function parseFileContent(
  content: string
): { url: string; name?: string; size?: number } | null {
  if (!content) return null
  try {
    const parsed = JSON.parse(content)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.url === 'string'
    ) {
      return {
        url: parsed.url,
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        size: typeof parsed.size === 'number' ? parsed.size : undefined,
      }
    }
  } catch {
    // Not JSON — fall through to plain-URL detection.
  }
  // Plain URL fallback (absolute http(s) or relative `/uploads/...`).
  if (content.startsWith('http') || content.startsWith('/')) {
    return { url: content }
  }
  return null
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Derive a filename from a URL when the parsed payload has no `name`.
function deriveFilenameFromUrl(url: string, fallback: string): string {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    const last = u.pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : fallback
  } catch {
    return fallback
  }
}

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
  replyToSenderName,
  onReact,
  onReply,
  onStar,
  onBookmark,
  onCopy,
  onDelete,
  onEdit,
  onForward,
  onPin,
  starred,
  bookmarked,
  reactions,
  currentUserId,
  prevSameSender,
  // Whether the current user is allowed to pin/unpin this message.
  // - For a 1-on-1 chat: the sender of the message (matches the API's
  //   "sender-only" authorization rule).
  // - For a group chat: the message sender OR any group admin (the API
  //   allows admins to pin ANY message).
  // When false (a non-admin viewing someone else's message in a group), the
  // Pin button is hidden from both the hover toolbar and the context menu.
  canPin,
}: {
  message: ChatMessage
  senderName?: string
  isGroup: boolean
  replyTo?: ChatMessage | null
  // Display name of the user who sent the `replyTo` message (resolved by the
  // parent chat-window from the conversation's participants). When absent we
  // fall back to a generic "Original message" label so the quote is still
  // readable.
  replyToSenderName?: string
  onReact?: (emoji: string) => void
  onReply?: () => void
  onStar?: () => void
  onBookmark?: () => void
  onCopy?: () => void
  onDelete?: () => void
  onEdit?: () => void
  onForward?: () => void
  onPin?: () => void
  starred?: boolean
  bookmarked?: boolean
  reactions?: Reaction[]
  currentUserId?: string
  // When true, this message is a continuation of a previous message from
  // the same sender. The bubble's connecting corner gets a tighter radius
  // for a WhatsApp-style "tail" effect. Currently optional — the parent can
  // opt-in to passing this prop.
  prevSameSender?: boolean
  canPin?: boolean
}) {
  const me = useWaslStore((s) => s.user)
  const mine = message.senderId === me?.id
  // Search highlight state — only the message whose id matches
  // `highlightedMessageId` should wrap query matches in <mark>. Subscribing via
  // individual selectors keeps re-renders scoped: every other bubble only
  // re-renders when `highlightedMessageId` flips from null↔its own id.
  const highlightQuery = useWaslStore((s) => s.highlightQuery)
  const highlightedMessageId = useWaslStore((s) => s.highlightedMessageId)
  const isHighlighted =
    !!highlightQuery && highlightedMessageId === message.id
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

  // ---- Share externally (Web Share API) ------------------------------------
  // Tries the native Web Share sheet first (mobile browsers, some desktop
  // Chromium builds). Falls back to writing the message to the clipboard and
  // showing a success toast on desktop browsers where `navigator.share` is
  // unavailable. Records a `share` audit attempt when the message is
  // protected and the user is the recipient (mirroring the Copy/Forward
  // behaviour for protected bubbles).
  const handleShareExternal = useCallback(async () => {
    if (blocked) {
      toast.error(PROTECTED_WARNING, { duration: 4000 })
      recordAttempt(message.id, 'share')
      return
    }
    const shareText = message.content
    try {
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function'
      ) {
        await navigator.share({
          title: 'Wasl message',
          text: shareText,
        })
        return
      }
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(shareText)
        toast.success('Message copied to clipboard')
        return
      }
      toast.error('Sharing not supported on this device')
    } catch (err) {
      // The user dismissing the native share sheet throws an AbortError — we
      // shouldn't surface that as an error, just bail silently.
      const name = (err as { name?: string })?.name
      if (name === 'AbortError') return
      // Last-ditch: try clipboard as a fallback before showing the error.
      try {
        if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === 'function'
        ) {
          await navigator.clipboard.writeText(shareText)
          toast.success('Message copied to clipboard')
          return
        }
      } catch {
        // fall through to the error toast
      }
      toast.error('Sharing not supported on this device')
    }
  }, [blocked, message.id, message.content])

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
      <div className={cn('flex w-full wasl-msg-in', mine ? 'justify-end' : 'justify-start')}>
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
      <div className={cn('flex w-full wasl-msg-in', mine ? 'justify-end' : 'justify-start')}>
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
      <div className={cn('flex w-full wasl-msg-in', mine ? 'justify-end' : 'justify-start')}>
        <div className={cn('px-2.5 py-1.5 shadow-sm relative', mine ? 'wasl-bubble-out' : 'wasl-bubble-in')}>
          {isGroup && !mine && senderName && (
            <div className="text-xs font-semibold mb-0.5 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]">
              {senderName}
            </div>
          )}
          <VoicePlayer
            src={message.content}
            mine={mine}
            variant="voice"
            blocked={blocked}
            messageId={message.id}
            transcription={message.transcription ?? null}
          />
          <div className="text-[10px] text-right text-foreground/60 mt-0.5 flex items-center justify-end gap-1">
            {/* If a transcription is already cached on the message (either
                from a previous request or pre-populated by the server),
                show a small indicator next to the timestamp so the user
                knows the bubble has a transcript available before they
                open it. */}
            {message.transcription && (
              <span
                className="inline-flex items-center gap-0.5 text-foreground/50"
                title="Transcription available"
              >
                <FileText className="w-3 h-3" aria-hidden />
              </span>
            )}
            {protection.isProtected && (
              <Lock className="w-3 h-3 inline opacity-60" />
            )}
            {formatChatTimestamp(message.createdAt)}
            {mine && <StatusTicks status={message.status} className="ml-1" onClick={() => setReadReceiptsOpen(true)} />}
          </div>
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
            'flex w-full wasl-msg-in group/msg',
            mine ? 'justify-end' : 'justify-start'
          )}
        >
          <div className={cn('relative max-w-[78%] sm:max-w-[65%] md:max-w-[60%]')}>
        {/* Hover toolbar — appears on hover (desktop) — slides in smoothly */}
        <div
          ref={toolbarRef}
          className={cn(
            'wasl-toolbar absolute top-0 z-20 flex items-center gap-0.5 bg-white dark:bg-[var(--wasl-sidebar-bg)] rounded-full shadow-md border border-border px-0.5 py-0.5',
            mine
              ? 'left-0 -ml-1 -translate-x-[calc(100%_+_8px)] opacity-0 group-hover/msg:-translate-x-full group-hover/msg:opacity-100 focus-within:-translate-x-full focus-within:opacity-100'
              : 'right-0 -mr-1 translate-x-[calc(100%_+_8px)] opacity-0 group-hover/msg:translate-x-full group-hover/msg:opacity-100 focus-within:translate-x-full focus-within:opacity-100'
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
          {/* Bookmark (Save for later) — a personal reminder to follow up on
              this message. Mirrors the Star toolbar button but uses the
              amber-500 palette so the two don't look identical at a glance. */}
          <ToolbarButton
            title={bookmarked ? 'Remove bookmark' : 'Bookmark for later'}
            onClick={() => onBookmark?.()}
          >
            <Bookmark
              className={cn(
                'w-4 h-4',
                bookmarked && 'fill-amber-500 text-amber-500'
              )}
            />
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
          {/* Share externally — opens the native Web Share sheet on mobile
              (and some desktop browsers), otherwise copies the message text
              to the clipboard. Mirrors the Copy/Forward disabled treatment
              for protected bubbles. */}
          {blocked ? (
            <ToolbarButton
              title="Share disabled — message is protected"
              onClick={() => {
                toast.error(PROTECTED_WARNING, { duration: 4000 })
                recordAttempt(message.id, 'share')
              }}
            >
              <Share2 className="w-4 h-4 opacity-40" />
            </ToolbarButton>
          ) : (
            <ToolbarButton
              title="Share externally"
              onClick={() => { void handleShareExternal(); setShowReactions(false) }}
            >
              <Share2 className="w-4 h-4" />
            </ToolbarButton>
          )}
          {mine && (
            <ToolbarButton title="Delete" onClick={() => onDelete?.()} danger>
              <Trash2 className="w-4 h-4" />
            </ToolbarButton>
          )}
          {/* Pin / Unpin — shown to the message sender (always) and to group
              admins (for any message). Hidden for non-admins viewing someone
              else's message in a group. Mirrors the API's authorization
              matrix (sender-only for 1-on-1, sender+admin for groups). */}
          {onPin && canPin && (
            <ToolbarButton
              title={message.pinned ? 'Unpin' : 'Pin'}
              onClick={() => { onPin(); setShowReactions(false) }}
            >
              {message.pinned ? (
                <PinOff className="w-4 h-4" />
              ) : (
                <Pin className="w-4 h-4" />
              )}
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
            // WhatsApp-style "tail" — when grouped with the previous message
            // from the same sender, tighten the connecting corner's radius.
            prevSameSender && (mine ? 'wasl-bubble-grouped-out' : 'wasl-bubble-grouped-in'),
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
          {/* Pinned indicator — a small rotated Pin icon at the top corner of
              the bubble. Visible to everyone (pinned state is a conversation-
              wide fact, not per-user) so members can see which message the
              admin/sender has chosen to highlight. */}
          {message.pinned && message.type !== 'system' && (
            <div
              className={cn(
                'absolute -top-1.5 z-10 flex items-center justify-center w-5 h-5 rounded-full shadow-sm border',
                mine
                  ? 'left-1 bg-[var(--wasl-teal)] border-[var(--wasl-teal)]/70 text-white'
                  : 'right-1 bg-white dark:bg-[var(--wasl-sidebar-bg)] border-border text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]'
              )}
              title="Pinned message"
              aria-label="Pinned message"
            >
              <Pin className="w-3 h-3 rotate-45" />
            </div>
          )}
          {isGroup && !mine && senderName && (
            <div className="text-xs font-semibold mb-0.5 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]">
              {senderName}
            </div>
          )}
          {replyTo && (
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('wasl:jump-to-message', { detail: replyTo.id })
                )
              }
              title="Jump to original message"
              className="block w-full text-left rounded-md mb-1 px-2 py-1 bg-muted/30 dark:bg-white/5 hover:bg-muted/50 dark:hover:bg-white/10 transition-colors border-l-[3px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wasl-green)]/40"
              style={{
                borderLeftColor: mine
                  ? 'var(--wasl-green)'
                  : 'var(--wasl-teal)',
              }}
            >
              <div
                className="text-[11px] font-semibold leading-tight"
                style={{
                  color: mine ? 'var(--wasl-green)' : 'var(--wasl-teal)',
                }}
              >
                {replyTo.senderId === me?.id
                  ? 'You'
                  : replyToSenderName || 'Original message'}
              </div>
              <div className="text-xs text-muted-foreground truncate leading-snug">
                {replyTo.content}
              </div>
            </button>
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
          ) : message.type === 'pdf' || message.type === 'document' ? (
            <PdfDocumentCardContent
              message={message}
              mine={mine}
              blocked={blocked}
              isProtected={protection.isProtected}
              onOpenReadReceipts={() => setReadReceiptsOpen(true)}
            />
          ) : message.type === 'audio' && !message.content.startsWith('data:audio') ? (
            <AudioUrlCardContent
              message={message}
              mine={mine}
              blocked={blocked}
              isProtected={protection.isProtected}
              onOpenReadReceipts={() => setReadReceiptsOpen(true)}
            />
          ) : (
            <div
              className={cn(
                'text-sm leading-relaxed break-words whitespace-pre-wrap pr-1',
                blocked && 'select-none'
              )}
            >
              {isHighlighted
                ? highlightText(message.content, highlightQuery)
                : renderMarkdownLite(message.content)}
              <span className="inline-flex items-center gap-1 ml-2 align-bottom text-[10px] text-foreground/50 float-right mt-1">
                {protection.isProtected && (
                  <Lock className="w-3 h-3 inline opacity-60" />
                )}
                {starred && <Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
                {bookmarked && (
                  <Bookmark className="w-3 h-3 fill-amber-500 text-amber-500" />
                )}
                {message.edited && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditHistoryOpen(true)
                    }}
                    className="italic hover:text-foreground transition-colors cursor-pointer"
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
        <ContextMenuItem onClick={() => onBookmark?.()}>
          <Bookmark
            className={cn(
              'w-4 h-4 mr-2',
              bookmarked && 'fill-amber-500 text-amber-500'
            )}
          />
          {bookmarked ? 'Remove bookmark' : 'Bookmark for later'}
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
        {/* Share externally — Web Share API with clipboard fallback.
            The context menu never opens on `blocked` bubbles (the bubble's
            onContextMenu handler preventDefaults + stops propagation), so we
            don't need a separate disabled state here. */}
        <ContextMenuItem onClick={() => void handleShareExternal()}>
          <Share2 className="w-4 h-4 mr-2" />
          Share externally
        </ContextMenuItem>
        {onPin && canPin && (
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

// ---- File-attachment card (PDF / document) -------------------------------
// Renders a compact "file card" inside the bubble: a coloured FileText icon
// (red for PDF, teal/green for documents), the original filename + human-
// readable size, and a Download button that opens the URL in a new tab.
//
// `blocked` is set when the message is protected AND the current user is the
// recipient — in that case the Download button is disabled and shows the
// protected warning toast instead of opening the link.
function PdfDocumentCardContent({
  message,
  mine,
  blocked,
  isProtected,
  onOpenReadReceipts,
}: {
  message: ChatMessage
  mine: boolean
  blocked: boolean
  isProtected: boolean
  onOpenReadReceipts: () => void
}) {
  const parsed = parseFileContent(message.content)
  const isPdf = message.type === 'pdf'
  const fallbackName = isPdf ? 'PDF document' : 'Document'
  const name =
    parsed?.name ||
    (parsed?.url ? deriveFilenameFromUrl(parsed.url, fallbackName) : fallbackName)
  const sizeLabel = parsed?.size ? formatFileSize(parsed.size) : isPdf ? 'PDF' : 'Document'

  // PDF → red icon. Document → teal/green icon (uses wasl theme tokens so it
  // respects light/dark mode and the Cirkle gold theme). No indigo/blue.
  const iconColor = isPdf
    ? 'text-red-500'
    : 'text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]'
  const iconBg = isPdf
    ? 'bg-red-500/10'
    : 'bg-[var(--wasl-teal)]/10 dark:bg-[var(--wasl-green)]/10'

  return (
    <div className="rounded-lg overflow-hidden max-w-[280px]">
      <div className="flex items-center gap-3 p-2 min-w-[220px]">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
          <FileText className={cn('w-5 h-5', iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate text-foreground" title={name}>
            {name}
          </div>
          <div className="text-[11px] text-foreground/60 uppercase tracking-wide">
            {sizeLabel}
          </div>
        </div>
        {blocked ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              toast.error(PROTECTED_WARNING, { duration: 4000 })
              recordAttempt(message.id, 'save')
            }}
            className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground/40 cursor-not-allowed"
            title="Download disabled — message is protected"
            aria-label="Download disabled — message is protected"
          >
            <Download className="w-4 h-4" />
          </button>
        ) : (
          <a
            href={parsed?.url}
            target="_blank"
            rel="noopener noreferrer"
            download={name}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'shrink-0 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
              'bg-[var(--wasl-green)]/10 text-[var(--wasl-green)] hover:bg-[var(--wasl-green)]/20'
            )}
            title="Download"
            aria-label="Download"
          >
            <Download className="w-4 h-4" />
          </a>
        )}
      </div>
      <div className="text-[10px] text-right text-foreground/60 mt-0.5 flex items-center justify-end gap-1">
        {isProtected && <Lock className="w-3 h-3 inline opacity-60" />}
        {formatChatTimestamp(message.createdAt)}
        {mine && <StatusTicks status={message.status} className="ml-1" onClick={onOpenReadReceipts} />}
      </div>
    </div>
  )
}

// ---- Audio URL card ------------------------------------------------------
// Renders an `<audio controls>` element for audio messages whose `content`
// is a URL (i.e. an uploaded .mp3/.wav/.m4a/.ogg). Voice notes that were
// recorded in-browser are stored as `data:audio/...` data URIs and are
// handled by the existing VoiceMessagePlayer above.
function AudioUrlCardContent({
  message,
  mine,
  blocked,
  isProtected,
  onOpenReadReceipts,
}: {
  message: ChatMessage
  mine: boolean
  blocked: boolean
  isProtected: boolean
  onOpenReadReceipts: () => void
}) {
  const parsed = parseFileContent(message.content)
  const url = parsed?.url
  const name =
    parsed?.name ||
    (url ? deriveFilenameFromUrl(url, 'Audio message') : 'Audio message')
  const sizeLabel = parsed?.size ? formatFileSize(parsed.size) : undefined

  if (!url) {
    // Malformed payload — fall back to a tiny "audio unavailable" notice
    // rather than crashing the whole bubble.
    return (
      <div className="rounded-lg p-2 max-w-[280px] text-xs text-muted-foreground">
        Audio unavailable
      </div>
    )
  }

  return (
    <div className="rounded-lg overflow-hidden max-w-[300px] p-1">
      <div className="flex items-center gap-2 mb-1 min-w-0">
        <Music className="w-4 h-4 text-[var(--wasl-green)] shrink-0" />
        <span className="text-xs font-medium truncate flex-1 text-foreground" title={name}>
          {name}
        </span>
        {sizeLabel && (
          <span className="text-[10px] text-foreground/60 shrink-0">{sizeLabel}</span>
        )}
        {blocked ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              toast.error(PROTECTED_WARNING, { duration: 4000 })
              recordAttempt(message.id, 'save')
            }}
            className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground/40 cursor-not-allowed"
            title="Download disabled — message is protected"
            aria-label="Download disabled — message is protected"
          >
            <Download className="w-4 h-4" />
          </button>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download={name}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'shrink-0 px-2 py-1 rounded-md text-xs font-medium transition-colors',
              'bg-[var(--wasl-green)]/10 text-[var(--wasl-green)] hover:bg-[var(--wasl-green)]/20'
            )}
            title="Download"
            aria-label="Download"
          >
            <Download className="w-4 h-4" />
          </a>
        )}
      </div>
      {/* Custom audio player (Task 30-a) — replaces the bare `<audio controls>`
          element with the same reusable VoicePlayer used for voice notes.
          `variant="audio"` makes it show a Music icon and the surface tint
          matches the bubble (wasl-green for outgoing, wasl-teal for
          incoming). `blocked` makes the player read-only (pointer-events
          disabled) for protected recipients. */}
      <VoicePlayer
        src={url}
        mine={mine}
        variant="audio"
        blocked={blocked}
        label={name ? `Play audio: ${name}` : 'Play audio'}
      />
      <div className="text-[10px] text-right text-foreground/60 mt-0.5 flex items-center justify-end gap-1">
        {isProtected && <Lock className="w-3 h-3 inline opacity-60" />}
        {formatChatTimestamp(message.createdAt)}
        {mine && <StatusTicks status={message.status} className="ml-1" onClick={onOpenReadReceipts} />}
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
