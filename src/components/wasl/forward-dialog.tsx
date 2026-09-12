'use client'

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Forward, Search, Check, CheckCheck, Loader2, Lock } from 'lucide-react'
import { useWaslStore, type Conversation } from '@/lib/store'
import { WaslAvatar, WaslGroupAvatar } from './wasl-avatar'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Forward dialog — replaces the old `prompt()` approach with a proper
// multi-select dialog. The user can:
//   - Search conversations by name
//   - Select one or more target conversations (checkboxes)
//   - See a live count of selected conversations
//   - Forward the message to all selected conversations with one click
//
// The forward API is called once per target conversation. Protected messages
// are still subject to the forward protection rules (HTTP 403 if blocked).
//
// The inner component is keyed by `open` so that state resets automatically
// when the dialog opens/closes, avoiding the need for setState-in-effect.
export function ForwardDialog({
  open,
  onOpenChange,
  messageId,
  messageContent,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  messageId: string | null
  messageContent: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        {open && (
          <ForwardDialogInner
            key={messageId || 'new'}
            messageId={messageId}
            messageContent={messageContent}
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
  onOpenChange,
}: {
  messageId: string | null
  messageContent: string
  onOpenChange: (v: boolean) => void
}) {
  const { conversations, user } = useWaslStore()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [forwarding, setForwarding] = useState(false)

  // Filter conversations by search query
  const filtered = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.toLowerCase()
    return conversations.filter((c) =>
      c.name?.toLowerCase().includes(q) ||
      c.participants.some((p) => p.name.toLowerCase().includes(q))
    )
  }, [conversations, search])

  function toggleSelection(convId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(convId)) {
        next.delete(convId)
      } else {
        next.add(convId)
      }
      return next
    })
  }

  async function handleForward() {
    if (!messageId || selected.size === 0) return
    setForwarding(true)
    let successCount = 0
    let failCount = 0
    let blockedCount = 0

    for (const convId of selected) {
      try {
        const res = await fetch(`/api/messages/${messageId}/forward`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetConversationId: convId }),
        })
        if (res.ok) {
          successCount++
        } else if (res.status === 403) {
          blockedCount++
        } else {
          failCount++
        }
      } catch {
        failCount++
      }
    }

    setForwarding(false)
    onOpenChange(false)

    // Show a summary toast
    if (successCount > 0 && blockedCount === 0 && failCount === 0) {
      toast.success(
        `Forwarded to ${successCount} chat${successCount === 1 ? '' : 's'}`
      )
    } else if (blockedCount > 0) {
      toast.error(
        `Forwarded to ${successCount} chat${successCount === 1 ? '' : 's'}, ${blockedCount} blocked (protected)`,
        {
          description: 'The sender protected some messages from forwarding.',
          duration: 6000,
        }
      )
    } else if (failCount > 0) {
      toast.error(`Forwarded to ${successCount}, ${failCount} failed`)
    }
  }

  return (
    <>
      <DialogHeader>
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

      {/* Message preview */}
      <div className="rounded-lg border border-border bg-muted/30 p-2.5 mb-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Message
        </div>
        <div className="text-sm text-foreground truncate">
          {messageContent.slice(0, 100)}
          {messageContent.length > 100 ? '…' : ''}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations…"
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto wasl-scroll -mx-1 px-1 space-y-0.5 min-h-[200px]">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {search ? 'No conversations match your search.' : 'No conversations yet.'}
          </div>
        ) : (
          filtered.map((conv) => {
            const isSelected = selected.has(conv.id)
            const otherUser = !conv.isGroup
              ? conv.participants.find((p) => p.userId !== user?.id)
              : null
            const isOnline = !!otherUser && (otherUser.online)
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => toggleSelection(conv.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left',
                  isSelected
                    ? 'bg-[var(--wasl-green)]/10 border border-[var(--wasl-green)]/30'
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
                {/* Checkbox */}
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
          })
        )}
      </div>

      {/* Footer with action buttons */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
        <div className="text-xs text-muted-foreground">
          {selected.size > 0
            ? `${selected.size} selected`
            : 'Tap conversations to select'}
        </div>
        <div className="flex gap-2">
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
            disabled={selected.size === 0 || forwarding}
          >
            {forwarding ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Forwarding…
              </>
            ) : (
              <>
                <Forward className="w-4 h-4 mr-1.5" />
                Forward{selected.size > 0 ? ` (${selected.size})` : ''}
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
