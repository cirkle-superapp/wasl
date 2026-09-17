'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
  SmilePlus,
  UserPlus,
  Pencil,
  UserX,
  Search,
  Loader2,
  Crown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { WaslAvatar } from './wasl-avatar'
import { useWaslStore, type Commit, type Participant } from '@/lib/store'
import { formatLastSeen, formatChatTimestamp } from '@/lib/time'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { StarredMessagesDialog } from './starred-messages-dialog'
import { EncryptionDialog } from './encryption-dialog'
import { ReactionsSummaryDialog } from './reactions-summary-dialog'

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
    upsertConversation,
  } = useWaslStore()
  const conversation =
    conversations.find((c) => c.id === activeConversationId) || null
  const [media, setMedia] = useState<string[]>([])
  const [capture, setCapture] = useState<CaptureSummary | null>(null)
  const [captureLoading, setCaptureLoading] = useState(false)
  const [expandedCapture, setExpandedCapture] = useState<Set<string>>(new Set())
  const [starredOpen, setStarredOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [encryptionOpen, setEncryptionOpen] = useState(false)
  const [reactionsOpen, setReactionsOpen] = useState(false)

  // --- Group admin controls ------------------------------------------------
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  // local override of participants (used right after add/remove so the UI
  // updates immediately without waiting for the global refetch)
  const [localParticipants, setLocalParticipants] = useState<Participant[] | null>(null)
  const commits: Commit[] = activeConversationId
    ? commitsByConversation[activeConversationId] || []
    : []

  // Reset local override whenever the active conversation changes so we
  // don't accidentally show stale members from a previous chat.
  useEffect(() => {
    setLocalParticipants(null)
  }, [activeConversationId])

  const participants: Participant[] =
    localParticipants ?? conversation?.participants ?? []
  const isAdmin =
    !!conversation?.isGroup &&
    participants.some((p) => p.userId === user?.id && p.role === 'admin')

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

  // Refresh the conversation in the global store after an admin action so
  // the sidebar + chat header reflect the new name / member count.
  const refreshConversation = useCallback(async () => {
    if (!activeConversationId) return
    try {
      const res = await fetch('/api/conversations', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const updated = (data.conversations as any[]).find(
        (c) => c.id === activeConversationId
      )
      if (updated) upsertConversation(updated)
    } catch {
      // ignore — the local override already updated the UI
    }
  }, [activeConversationId, upsertConversation])

  // Remove a member from the group (admin only).
  async function handleRemoveMember(userId: string, name: string) {
    if (!activeConversationId) return
    if (
      !confirm(
        `Remove ${name} from this group? They will no longer be able to see or send messages here.`
      )
    )
      return
    setRemovingUserId(userId)
    try {
      const res = await fetch(
        `/api/conversations/${activeConversationId}/members?userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || 'Failed to remove member')
        return
      }
      // Optimistic local update — drop the removed member from the list
      setLocalParticipants((prev) => {
        const base = prev ?? conversation?.participants ?? []
        return base.filter((p) => p.userId !== userId)
      })
      toast.success(`${name} removed`)
      // Refetch so the sidebar member count + last-message preview refresh.
      void refreshConversation()
    } catch {
      toast.error('Network error')
    } finally {
      setRemovingUserId(null)
    }
  }

  // After a member is added via the dialog, merge them into the local
  // participants list so the panel updates instantly (the dialog hands us
  // the user object it just added).
  function handleMemberAdded(added: SearchUser) {
    setLocalParticipants((prev) => {
      const base = prev ?? conversation?.participants ?? []
      if (base.some((p) => p.userId === added.id)) return base
      return [
        ...base,
        {
          userId: added.id,
          username: added.username,
          name: added.name,
          phone: added.phone,
          avatar: added.avatar,
          avatarColor: added.avatarColor,
          online: added.online,
          lastSeen: added.lastSeen,
          about: added.about,
          verified: added.verified,
          role: 'member' as const,
        },
      ]
    })
    void refreshConversation()
  }

  // After the group is renamed, optimistically update the conversation name
  // in the local store so the header / sidebar reflect the new name.
  function handleRenamed(newName: string) {
    if (!conversation) return
    upsertConversation({
      ...conversation,
      name: newName,
    })
    void refreshConversation()
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
              Group · {participants.length} member
              {participants.length === 1 ? '' : 's'}
            </p>
          )}
          {conversation.isGroup && isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] hover:bg-[var(--wasl-teal)]/10"
              onClick={() => setRenameOpen(true)}
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit group name
            </Button>
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
              <span className="ml-auto text-[10px] normal-case tracking-normal">
                {participants.length}
              </span>
            </div>
            <div className="space-y-1">
              {participants.map((p) => {
                const memberIsAdmin = p.role === 'admin'
                const isSelf = p.userId === user?.id
                return (
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
                      <div className="text-sm font-medium truncate flex items-center gap-1.5">
                        <span className="truncate">{p.name}</span>
                        {isSelf && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            (you)
                          </span>
                        )}
                        {memberIsAdmin ? (
                          <span
                            className="inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0.5 rounded-full bg-[var(--wasl-teal)]/15 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] text-[10px] font-semibold"
                            title="Group admin"
                          >
                            <Crown className="w-2.5 h-2.5" />
                            Admin
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center shrink-0 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium"
                            title="Member"
                          >
                            Member
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {formatLastSeen(
                          p.lastSeen,
                          onlineUserIds.has(p.userId) || p.online
                        )}
                      </div>
                    </div>
                    {isAdmin && !isSelf && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                        disabled={removingUserId === p.userId}
                        onClick={() => handleRemoveMember(p.userId, p.name)}
                        title={`Remove ${p.name} from group`}
                      >
                        {removingUserId === p.userId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserX className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full border-dashed"
                onClick={() => setAddMemberOpen(true)}
              >
                <UserPlus className="w-4 h-4 mr-2" /> Add member
              </Button>
            )}
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
            onClick={() => setReactionsOpen(true)}
          >
            <SmilePlus className="w-4 h-4 mr-3" /> Reactions
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => setEncryptionOpen(true)}
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

      {/* Reactions summary dialog */}
      <ReactionsSummaryDialog
        open={reactionsOpen}
        onOpenChange={setReactionsOpen}
        conversationId={activeConversationId}
        conversationName={conversation?.name}
      />

      {/* Encryption info dialog */}
      <EncryptionDialog open={encryptionOpen} onOpenChange={setEncryptionOpen} />

      {/* Add-member dialog (admin only) */}
      {conversation.isGroup && (
        <AddMemberDialog
          open={addMemberOpen}
          onOpenChange={setAddMemberOpen}
          conversationId={conversation.id}
          currentMemberIds={participants.map((p) => p.userId)}
          onMemberAdded={handleMemberAdded}
        />
      )}

      {/* Rename group dialog (admin only) */}
      {conversation.isGroup && (
        <RenameGroupDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          conversationId={conversation.id}
          currentName={conversation.name}
          onRenamed={handleRenamed}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AddMemberDialog — search users and add them to the group (admin only).
// Excludes existing members from the search results. Calls
// POST /api/conversations/:id/members with { userId } when a search result
// is clicked.
// ---------------------------------------------------------------------------

type SearchUser = {
  id: string
  username: string
  name: string
  phone: string | null
  avatar: string | null
  avatarColor: string | null
  about: string
  online: boolean
  lastSeen: string
  verified: boolean
}

function AddMemberDialog({
  open,
  onOpenChange,
  conversationId,
  currentMemberIds,
  onMemberAdded,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  conversationId: string
  currentMemberIds: string[]
  onMemberAdded: (u: SearchUser) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchUser[]>([])
  const [loading, setLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const memberSet = useRef<Set<string>>(new Set(currentMemberIds))

  // Keep the current-member Set in sync whenever the prop changes (e.g. after
  // an optimistic add/remove in the parent).
  useEffect(() => {
    memberSet.current = new Set(currentMemberIds)
  }, [currentMemberIds])

  // Reset search state whenever the dialog closes so it's clean on re-open.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setAddingId(null)
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [open])

  // Debounced search — fires 300ms after the user stops typing.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (!q) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(q)}`,
          { cache: 'no-store' }
        )
        if (!res.ok) {
          setResults([])
          return
        }
        const data = await res.json()
        setResults((data.users as SearchUser[]) || [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [query, open])

  async function handleAdd(user: SearchUser) {
    setAddingId(user.id)
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || 'Failed to add member')
        return
      }
      toast.success(`${user.name} added to the group`)
      onMemberAdded(user)
      // Remove from the visible search results so the user can't add twice.
      setResults((prev) => prev.filter((u) => u.id !== user.id))
      // Close after a successful add.
      onOpenChange(false)
    } catch {
      toast.error('Network error')
    } finally {
      setAddingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>
            Search for a Wasl user by name, username, or phone number. They
            will be added to this group as a regular member.
          </DialogDescription>
        </DialogHeader>
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, username, or phone…"
              className="pl-9"
            />
            {loading && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto wasl-scroll px-2 pb-2">
          {!loading && query.trim() === '' ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              Start typing to search for someone to add.
            </div>
          ) : !loading && results.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              No users found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <div className="space-y-0.5">
              {results.map((u) => {
                const alreadyMember = memberSet.current.has(u.id)
                return (
                  <button
                    key={u.id}
                    type="button"
                    disabled={alreadyMember || addingId === u.id}
                    onClick={() => handleAdd(u)}
                    className={cn(
                      'w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors',
                      alreadyMember
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-muted/60 cursor-pointer'
                    )}
                  >
                    <WaslAvatar
                      name={u.name}
                      src={u.avatar}
                      color={u.avatarColor}
                      size={36}
                      online={u.online}
                      showStatus
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        @{u.username}
                        {u.phone ? ` · ${u.phone}` : ''}
                      </div>
                    </div>
                    {alreadyMember ? (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        Already in group
                      </span>
                    ) : addingId === u.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] shrink-0" />
                    ) : (
                      <UserPlus className="w-4 h-4 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// RenameGroupDialog — inline form to rename the group (admin only).
// Calls PATCH /api/conversations/:id with { name }.
// ---------------------------------------------------------------------------

function RenameGroupDialog({
  open,
  onOpenChange,
  conversationId,
  currentName,
  onRenamed,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  conversationId: string
  currentName: string
  onRenamed: (newName: string) => void
}) {
  const [name, setName] = useState(currentName)
  const [saving, setSaving] = useState(false)

  // Re-seed the input whenever the dialog opens.
  useEffect(() => {
    if (open) setName(currentName)
  }, [open, currentName])

  const trimmed = name.trim()
  const valid = trimmed.length >= 1 && trimmed.length <= 100

  async function handleSave() {
    if (!valid) return
    setSaving(true)
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || 'Failed to rename group')
        return
      }
      toast.success('Group name updated')
      onRenamed(trimmed)
      onOpenChange(false)
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit group name</DialogTitle>
          <DialogDescription>
            Choose a new name for this group. Members will see a system
            message noting the change.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="wasl-group-name-input">Group name</Label>
          <Input
            id="wasl-group-name-input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid && !saving) handleSave()
            }}
            maxLength={100}
            placeholder="Group name"
          />
          <p className="text-[11px] text-muted-foreground">
            {trimmed.length}/100 characters
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!valid || saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
