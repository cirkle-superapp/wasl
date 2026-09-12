'use client'

import { useState, useRef, useEffect } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatChatTimestamp } from '@/lib/time'
import { useWaslStore, type ChatMessage, type Reaction } from '@/lib/store'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

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
  starred?: boolean
  reactions?: Reaction[]
  currentUserId?: string
}) {
  const me = useWaslStore((s) => s.user)
  const mine = message.senderId === me?.id
  const [showReactions, setShowReactions] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)

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

  return (
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
          <ToolbarButton title="Copy" onClick={() => { onCopy?.(); setShowReactions(false) }}>
            <Copy className="w-4 h-4" />
          </ToolbarButton>
          {mine && message.type === 'text' && onEdit && (
            <ToolbarButton title="Edit" onClick={() => onEdit()}>
              <Pencil className="w-4 h-4" />
            </ToolbarButton>
          )}
          {onForward && (
            <ToolbarButton title="Forward" onClick={() => onForward()}>
              <Forward className="w-4 h-4" />
            </ToolbarButton>
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
          className={cn(
            'px-2.5 py-1.5 shadow-sm relative',
            mine ? 'wasl-bubble-out' : 'wasl-bubble-in'
          )}
        >
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
              <img src={message.content} alt="sent" className="w-full h-auto" />
              <div className="text-[10px] text-right text-foreground/60 mt-0.5">
                {formatChatTimestamp(message.createdAt)}
                {mine && <StatusTicks status={message.status} className="ml-1" />}
              </div>
            </div>
          ) : (
            <div className="text-sm leading-relaxed break-words whitespace-pre-wrap pr-1">
              {message.content}
              <span className="inline-flex items-center gap-1 ml-2 align-bottom text-[10px] text-foreground/50 float-right mt-1">
                {starred && <Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
                {formatChatTimestamp(message.createdAt)}
                {mine && <StatusTicks status={message.status} />}
              </span>
            </div>
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
}: {
  status: string
  className?: string
}) {
  if (status === 'sent') {
    return <Check className={cn('w-3.5 h-3.5 inline', className)} />
  }
  if (status === 'delivered') {
    return <CheckCheck className={cn('w-3.5 h-3.5 inline', className)} />
  }
  if (status === 'read') {
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
