'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Phone,
  Bell,
  BellOff,
  Trash2,
  X,
  Image as ImageIcon,
  Users,
  Star,
  Shield,
  ShieldCheck,
  Lock,
  Camera,
  Copy,
  Forward,
  MousePointerClick,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WaslAvatar } from './wasl-avatar'
import { useWaslStore, type Commit } from '@/lib/store'
import { formatLastSeen, formatChatTimestamp } from '@/lib/time'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { StarredMessagesDialog } from './starred-messages-dialog'

// Icon mapping for screenshot-attempt kinds → human-readable label + icon
const KIND_META: Record<string, { label: string; icon: typeof Camera }> = {
  printscreen: { label: 'Screenshot key', icon: Camera },
  copy: { label: 'Copy attempt', icon: Copy },
  save: { label: 'Save attempt', icon: Forward },
  contextmenu: { label: 'Right-click', icon: MousePointerClick },
  drag: { label: 'Drag attempt', icon: MousePointerClick },
  forward: { label: 'Forward attempt', icon: Forward },
}

type CaptureAttempt = {
  id: string
  kind: string
  note: string | null
  createdAt: string
  reporter: {
    id: string
    name: string
    username: string
    avatar: string | null
    avatarColor: string | null
  } | null
}

type CaptureMessage = {
  id: string
  content: string
  type: string
  createdAt: string
  attempts: CaptureAttempt[]
}

type CaptureSummary = {
  messages: CaptureMessage[]
  totalAttempts: number
  byKind: Record<string, number>
  protectedMessageCount: number
}

export function ContactInfoPanel({ onClose }: { onClose: () => void }) {
  const {
    activeConversationId,
    conversations,
    user,
    onlineUserIds,
    setShowProfilePanel,
    commitsByConversation,
  } = useWaslStore()
  const conversation =
    conversations.find((c) => c.id === activeConversationId) || null
  const [media, setMedia] = useState<string[]>([])
  const [capture, setCapture] = useState<CaptureSummary | null>(null)
  const [captureLoading, setCaptureLoading] = useState(false)
  const [expandedCapture, setExpandedCapture] = useState<Set<string>>(new Set())
  const [starredOpen, setStarredOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const commits: Commit[] = activeConversationId
    ? commitsByConversation[activeConversationId] || []
    : []

  const loadCapture = useCallback(async () => {
    if (!activeConversationId) return
    setCaptureLoading(true)
    try {
      const res = await fetch(
        `/api/conversations/${activeConversationId}/screenshot-attempts`,
        { cache: 'no-store' }
      )
      if (!res.ok) {
        setCapture(null)
        return
      }
      const data: CaptureSummary = await res.json()
      setCapture(data)
      // Auto-expand the most-recent message's attempts list
      if (data.messages.length > 0) {
        setExpandedCapture(new Set([data.messages[0].id]))
      }
    } catch {
      setCapture(null)
    } finally {
      setCaptureLoading(false)
    }
  }, [activeConversationId])

  useEffect(() => {
    async function loadMedia() {
      if (!activeConversationId) return
      try {
        const res = await fetch(
          `/api/conversations/${activeConversationId}/messages?limit=100`,
          { cache: 'no-store' }
        )
        if (!res.ok) return
        const data = await res.json()
        setMedia(
          (data.messages as any[])
            .filter((m) => m.type === 'image')
            .map((m) => m.content)
            .slice(0, 9)
        )
      } catch {
        // ignore
      }
    }
    loadMedia()
    loadCapture()
    loadMuted()
  }, [activeConversationId, loadCapture])

  const loadMuted = useCallback(async () => {
    if (!activeConversationId) return
    try {
      const res = await fetch(
        `/api/conversations/${activeConversationId}/mute`,
        { cache: 'no-store' }
      )
      if (!res.ok) return
      const data = await res.json()
      setMuted(!!data.muted)
    } catch {
      // ignore
    }
  }, [activeConversationId])

  async function toggleMute() {
    const next = !muted
    setMuted(next) // optimistic
    try {
      const res = await fetch(
        `/api/conversations/${activeConversationId}/mute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ muted: next }),
        }
      )
      if (!res.ok) {
        setMuted(!next) // rollback
        toast.error('Failed to update mute setting')
        return
      }
      toast.success(next ? 'Notifications muted' : 'Notifications unmuted')
    } catch {
      setMuted(!next) // rollback
      toast.error('Network error')
    }
  }

  if (!conversation) return null

  const otherUser =
    !conversation.isGroup
      ? conversation.participants.find((p) => p.userId !== user?.id)
      : null
  const isOnline =
    !!otherUser &&
    (onlineUserIds.has(otherUser.userId) || otherUser.online)

  async function handleDelete() {
    if (!conversation) return
    if (!confirm('Delete this conversation? This cannot be undone.')) return
    try {
      await fetch(`/api/conversations/${conversation.id}`, {
        method: 'DELETE',
      })
      useWaslStore.getState().removeConversation(conversation.id)
      setShowProfilePanel(false)
      toast.success('Conversation deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  function toggleCaptureMessage(messageId: string) {
    setExpandedCapture((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }

  return (
    <div className="h-full flex flex-col bg-[var(--wasl-sidebar-bg)] border-l border-border w-full">
      <div className="bg-[var(--wasl-teal)] text-white px-4 py-3 flex items-center justify-between">
        <div className="font-medium">Info</div>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto wasl-scroll p-4 space-y-6">
        {/* Hero */}
        <div className="flex flex-col items-center text-center">
          <WaslAvatar
            name={conversation.name}
            src={conversation.avatar}
            color={conversation.avatarColor}
            size={120}
            online={isOnline}
            showStatus={!conversation.isGroup}
          />
          <h2 className="text-xl font-semibold mt-3">{conversation.name}</h2>
          {!conversation.isGroup && otherUser && (
            <p className="text-sm text-muted-foreground">
              {formatLastSeen(otherUser.lastSeen, isOnline)}
            </p>
          )}
          {conversation.isGroup && (
            <p className="text-sm text-muted-foreground">
              Group · {conversation.participants.length} members
            </p>
          )}
        </div>

        {/* About */}
        {!conversation.isGroup && otherUser && (
          <div className="bg-white dark:bg-[var(--wasl-chat-bg)] rounded-lg p-3 border border-border/60">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              About
            </div>
            <p className="text-sm">{otherUser.about || 'No bio yet'}</p>
          </div>
        )}

        {/* Phone */}
        {!conversation.isGroup && otherUser && (
          <div className="bg-white dark:bg-[var(--wasl-chat-bg)] rounded-lg p-3 border border-border/60">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Phone
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-[var(--wasl-teal)]" />
              <p className="text-sm font-medium">{otherUser.phone}</p>
            </div>
          </div>
        )}

        {/* Participants */}
        {conversation.isGroup && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Members
            </div>
            <div className="space-y-1">
              {conversation.participants.map((p) => (
                <div
                  key={p.userId}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/60"
                >
                  <WaslAvatar
                    name={p.name}
                    src={p.avatar}
                    color={p.avatarColor}
                    size={36}
                    online={onlineUserIds.has(p.userId) || p.online}
                    showStatus
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {p.name}
                      {p.userId === user?.id && (
                        <span className="text-xs text-muted-foreground ml-1">
                          (you)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {formatLastSeen(p.lastSeen, onlineUserIds.has(p.userId) || p.online)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Capture attempts (sender-side audit log of protected messages) */}
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-[var(--wasl-green)]" /> Capture attempts
            {capture && capture.totalAttempts > 0 && (
              <span className="ml-auto text-[10px] normal-case tracking-normal px-1.5 py-0.5 rounded-full bg-[var(--wasl-green)]/15 text-[var(--wasl-green)] font-semibold">
                {capture.totalAttempts}
              </span>
            )}
          </div>
          {captureLoading ? (
            <div className="space-y-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-md bg-muted/40 animate-pulse"
                />
              ))}
            </div>
          ) : !capture || capture.totalAttempts === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
              <Lock className="w-3.5 h-3.5 inline mr-1.5 text-[var(--wasl-green)]" />
              {capture && capture.protectedMessageCount > 0
                ? 'No capture attempts recorded on your protected messages in this chat.'
                : 'No protected messages yet. Use the lock icon in the composer to send a protected message; attempts to screenshot or forward it will be shown here.'}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Kind summary chips */}
              {Object.keys(capture.byKind).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {Object.entries(capture.byKind).map(([kind, count]) => {
                    const meta = KIND_META[kind] || {
                      label: kind,
                      icon: AlertTriangle,
                    }
                    const Icon = meta.icon
                    return (
                      <span
                        key={kind}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-medium border border-amber-500/20"
                        title={meta.label}
                      >
                        <Icon className="w-3 h-3" />
                        {count} {meta.label.toLowerCase()}
                      </span>
                    )
                  })}
                </div>
              )}

              {/* Per-message attempt list */}
              {capture.messages.map((m) => {
                const isExpanded = expandedCapture.has(m.id)
                return (
                  <div
                    key={m.id}
                    className="rounded-lg border border-border bg-white/70 dark:bg-white/5 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleCaptureMessage(m.id)}
                      className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-muted/40 transition-colors"
                    >
                      <Lock className="w-3.5 h-3.5 text-[var(--wasl-green)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground truncate">
                          {m.content.slice(0, 80) || '(empty message)'}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {formatChatTimestamp(m.createdAt)} · {m.attempts.length} attempt
                          {m.attempts.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border/60 bg-amber-50/40 dark:bg-amber-500/5 p-2 space-y-1.5">
                        {m.attempts.map((a) => {
                          const meta = KIND_META[a.kind] || {
                            label: a.kind,
                            icon: AlertTriangle,
                          }
                          const Icon = meta.icon
                          return (
                            <div
                              key={a.id}
                              className="flex items-center gap-2 text-xs p-1.5 rounded-md hover:bg-amber-100/40 dark:hover:bg-amber-500/10"
                            >
                              <WaslAvatar
                                name={a.reporter?.name || 'Unknown'}
                                src={a.reporter?.avatar || undefined}
                                color={a.reporter?.avatarColor || undefined}
                                size={22}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">
                                  {a.reporter?.name || 'Unknown user'}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {formatChatTimestamp(a.createdAt)}
                                </div>
                              </div>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-medium shrink-0">
                                <Icon className="w-3 h-3" />
                                {meta.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {capture && capture.totalAttempts > 0 && (
            <button
              type="button"
              onClick={loadCapture}
              className="mt-2 text-[11px] text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] hover:underline flex items-center gap-1"
            >
              <Camera className="w-3 h-3" /> Refresh
            </button>
          )}
        </div>

        {/* Media */}
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
            <ImageIcon className="w-3.5 h-3.5" /> Shared media
          </div>
          {media.length === 0 ? (
            <p className="text-sm text-muted-foreground">No media shared yet</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {media.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt="shared"
                  className="w-full aspect-square object-cover rounded-md cursor-pointer"
                />
              ))}
            </div>
          )}
        </div>

        {/* Commits (Cirkle-inspired) */}
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Commits
            <span className="ml-auto text-[10px] normal-case tracking-normal">
              {commits.length} agreement{commits.length === 1 ? '' : 's'}
            </span>
          </div>
          {commits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No commits yet. Tap the shield icon in the composer to create a
              verified agreement.
            </p>
          ) : (
            <div className="space-y-2">
              {commits.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-border bg-white/70 dark:bg-white/5 p-2.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-base">{c.typeEmoji}</span>
                      <span className="font-medium truncate">{c.title}</span>
                    </div>
                    <span
                      className={cn(
                        'wasl-commit-status-pill wasl-commit-status-' + c.status
                      )}
                    >
                      {c.status === 'pending'
                        ? 'Pending'
                        : c.status === 'active'
                        ? 'Active'
                        : c.status === 'completed'
                        ? 'Done'
                        : 'Disputed'}
                    </span>
                  </div>
                  {c.amount > 0 && (
                    <div className="text-muted-foreground">
                      {c.amount.toLocaleString()} {c.currency}
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                    <ShieldCheck className="w-3 h-3 text-[var(--wasl-green)]" />
                    {c.creatorSigned && c.counterpartySigned
                      ? 'Both parties signed'
                      : c.counterpartySigned
                      ? 'Counterparty signed'
                      : 'Awaiting counterparty signature'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start text-foreground hover:bg-muted',
              muted && 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
            )}
            onClick={toggleMute}
          >
            {muted ? (
              <>
                <BellOff className="w-4 h-4 mr-3" /> Unmute notifications
              </>
            ) : (
              <>
                <Bell className="w-4 h-4 mr-3" /> Mute notifications
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => setStarredOpen(true)}
          >
            <Star className="w-4 h-4 mr-3" /> Starred messages
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => toast.info('Encryption details')}
          >
            <Shield className="w-4 h-4 mr-3" /> Encryption
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
          >
            <Trash2 className="w-4 h-4 mr-3" /> Delete chat
          </Button>
        </div>
      </div>

      {/* Starred messages dialog */}
      <StarredMessagesDialog
        open={starredOpen}
        onOpenChange={setStarredOpen}
        conversationId={activeConversationId}
        conversationName={conversation?.name}
      />
    </div>
  )
}
