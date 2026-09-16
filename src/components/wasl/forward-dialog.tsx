'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Forward, Search, Check, Loader2, Lock, AlertTriangle } from 'lucide-react'
import { useWaslStore } from '@/lib/store'
import { WaslAvatar, WaslGroupAvatar } from './wasl-avatar'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Forward dialog — multi-select bulk forwarding.
//
// The user can:
//   - Search conversations by name
//   - Select one or more target conversations (checkboxes / row click)
//   - Use "Select all (filtered)" / "Clear selection" for bulk toggling
//   - Forward the message to ALL selected conversations in a single API
//     call (POST /api/messages/:id/forward with `conversationIds: string[]`)
//   - See a live count of selected conversations on the sticky footer button
//
// Protected messages:
//   If the message is protected AND the current user is NOT the owner AND
//   they have NOT enabled "privacy always allow", the dialog shows a warning
//   banner and disables the Forward button (the API would return 403 anyway,
//   but we want to fail fast and explain why). This mirrors the
//   `useProtectionState` logic in message-bubble.tsx.
//
// The inner component is keyed by `messageId` so that state resets
// automatically when the dialog opens/closes, avoiding setState-in-effect.
export function ForwardDialog({
  open,
  onOpenChange,
  messageId,
  messageContent,
  messageSenderName,
  messageSenderId,
  messageProtected,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  messageId: string | null
  messageContent: string
  messageSenderName?: string
  messageSenderId?: string
  messageProtected?: boolean | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-0 gap-0">
        {open && (
          <ForwardDialogInner
            key={messageId || 'new'}
            messageId={messageId}
            messageContent={messageContent}
            messageSenderName={messageSenderName}
            messageSenderId={messageSenderId}
            messageProtected={messageProtected}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ForwardDialogInner({
  messageId,
  messageContent,
  messageSenderName,
  messageSenderId,
  messageProtected,
  onOpenChange,
}: {
  messageId: string | null
  messageContent: string
  messageSenderName?: string
  messageSenderId?: string
  messageProtected?: boolean | null
  onOpenChange: (v: boolean) => void
}) {
  const { conversations, user } = useWaslStore()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [forwarding, setForwarding] = useState(false)

  // Resolve protection: a message is "blocked" for forwarding when it is
  // protected, the current user is NOT the owner, and they have NOT opted
  // into "privacy always allow". (Mirrors the message-bubble logic.)
  const isProtected = messageProtected === true
  const isOwner = !!user && !!messageSenderId && messageSenderId === user.id
  const alwaysAllow = !!user?.privacyAlwaysAllow
  const blockedForward = isProtected && !isOwner && !alwaysAllow

  // Filter conversations by search query
  const filtered = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.toLowerCase()
    return conversations.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.participants.some((p) => p.name.toLowerCase().includes(q))
    )
  }, [conversations, search])

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.id))

  const toggleSelection = useCallback((convId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(convId)) {
        next.delete(convId)
      } else {
        next.add(convId)
      }
      return next
    })
  }, [])

  function handleSelectAll() {
    if (allFilteredSelected) {
      // Deselect only the filtered set, keep any others selected.
      setSelected((prev) => {
        const next = new Set(prev)
        for (const c of filtered) next.delete(c.id)
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        for (const c of filtered) next.add(c.id)
        return next
      })
    }
  }

  function handleDeselectAll() {
    setSelected(new Set())
  }

  async function handleForward() {
    if (!messageId || selected.size === 0 || blockedForward) return
    setForwarding(true)

    const targetIds = Array.from(selected)
    try {
      const res = await fetch(`/api/messages/${messageId}/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationIds: targetIds }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        forwarded?: number
        notMember?: string[]
        failed?: { conversationId: string; error: string }[]
        error?: string
        protected?: boolean
      }

      setForwarding(false)

      if (!res.ok) {
        if (res.status === 403 && data?.protected) {
          toast.error('This message is protected by the sender. Forwarding is restricted.', {
            duration: 6000,
          })
        } else {
          toast.error(data?.error || 'Forwarding failed')
        }
        return
      }

      onOpenChange(false)

      const forwarded = data.forwarded ?? 0
      const notMember = data.notMember ?? []
      const failed = data.failed ?? []

      if (forwarded === targetIds.length && notMember.length === 0 && failed.length === 0) {
        toast.success(`Message forwarded to ${forwarded} chat${forwarded === 1 ? '' : 's'}`)
      } else {
        // Partial success — surface a detailed summary toast.
        const parts: string[] = [`Forwarded to ${forwarded} chat${forwarded === 1 ? '' : 's'}`]
        if (notMember.length > 0) parts.push(`${notMember.length} not a member`)
        if (failed.length > 0) parts.push(`${failed.length} failed`)
        toast.warning(parts.join(' · '), {
          duration: 6000,
        })
      }
    } catch {
      setForwarding(false)
      toast.error('Network error while forwarding')
    }
  }

  const buttonLabel =
    selected.size === 0
      ? 'Forward'
      : selected.size === 1
        ? 'Forward'
        : `Forward to ${selected.size} chats`

  return (
    <div className="flex flex-col max-h-[80vh]">
      <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
        <DialogTitle className="flex items-center gap-2">
          <Forward className="w-5 h-5" />
          Forward message
        </DialogTitle>
        <DialogDescription>
          {selected.size > 0
            ? `Forward to ${selected.size} conversation${selected.size === 1 ? '' : 's'}`
            : 'Select one or more conversations to forward this message to'}
        </DialogDescription>
      </DialogHeader>

      {/* Message preview — sender name + truncated content */}
      <div className="mx-5 mb-2 shrink-0 rounded-lg border border-border bg-muted/30 p-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Message{messageSenderName ? ` from ${messageSenderName}` : ''}
        </div>
        <div className="text-sm text-foreground truncate">
          {messageContent.slice(0, 100)}
          {messageContent.length > 100 ? '…' : ''}
        </div>
      </div>

      {/* Protected message warning */}
      {blockedForward && (
        <div className="mx-5 mb-2 shrink-0 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed">
            This message is protected by the sender. Forwarding may be restricted.
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mx-5 mb-2 shrink-0 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations…"
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Select all / Clear selection row */}
      {filtered.length > 0 && (
        <div className="mx-5 mb-1 shrink-0 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-[var(--wasl-green)] hover:underline font-medium"
          >
            {allFilteredSelected ? 'Deselect all (filtered)' : 'Select all (filtered)'}
          </button>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={handleDeselectAll}
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto wasl-scroll px-3 min-h-[200px]">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {search ? 'No conversations match your search.' : 'No conversations yet.'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((conv) => {
              const isSelected = selected.has(conv.id)
              const otherUser = !conv.isGroup
                ? conv.participants.find((p) => p.userId !== user?.id)
                : null
              const isOnline = !!otherUser && otherUser.online
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => toggleSelection(conv.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left',
                    isSelected
                      ? 'bg-[var(--wasl-green)]/10 border border-[var(--wasl-green)]/40'
                      : 'hover:bg-muted/50 border border-transparent'
                  )}
                >
                  {conv.isGroup ? (
                    <WaslGroupAvatar
                      name={conv.name}
                      participants={conv.participants.map((p) => ({
                        name: p.name,
                        avatar: p.avatar,
                        avatarColor: p.avatarColor,
                      }))}
                      size={40}
                    />
                  ) : (
                    <WaslAvatar
                      name={conv.name}
                      src={conv.avatar}
                      color={conv.avatarColor}
                      size={40}
                      online={isOnline}
                      showStatus
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-foreground">
                      {conv.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {conv.isGroup
                        ? `${conv.participants.length} members`
                        : otherUser?.phone || ''}
                    </div>
                  </div>
                  {/* Checkmark badge */}
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                      isSelected
                        ? 'bg-[var(--wasl-green)] border-[var(--wasl-green)]'
                        : 'border-border'
                    )}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer — sticky at the bottom of the dialog */}
      <div className="shrink-0 border-t border-border bg-background px-5 py-3 flex items-center justify-between gap-2 rounded-b-lg">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
          {blockedForward ? (
            <>
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Protected — forwarding disabled</span>
            </>
          ) : selected.size > 0 ? (
            <span className="truncate">{selected.size} selected</span>
          ) : (
            <span className="truncate">Tap conversations to select</span>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={forwarding}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
            onClick={handleForward}
            disabled={selected.size === 0 || forwarding || blockedForward}
          >
            {forwarding ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Forwarding…
              </>
            ) : (
              <>
                <Forward className="w-4 h-4 mr-1.5" />
                {buttonLabel}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
