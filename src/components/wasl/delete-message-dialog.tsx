'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Trash2, Users, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

// Delete message dialog — lets the user choose between:
//   - "Delete for me" — removes the message from the current user's view
//   - "Delete for everyone" — removes the message for ALL participants
//     (sender only, within 1 hour of sending)
//
// The dialog shows a preview of the message content + a warning for the
// "delete for everyone" option.
export function DeleteMessageDialog({
  open,
  onOpenChange,
  messageId,
  messageContent,
  isOwnMessage,
  canDeleteForEveryone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  messageId: string | null
  messageContent: string
  isOwnMessage: boolean
  canDeleteForEveryone: boolean // true if within 1 hour + own message
}) {
  const [deleting, setDeleting] = useState(false)

  async function handleDeleteForEveryone() {
    if (!messageId) return
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/messages/${messageId}?forEveryone=true`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Failed to delete message')
        return
      }
      toast.success('Message deleted for everyone')
      onOpenChange(false)
      // Broadcast (socket + window event) so all clients remove the message.
      window.dispatchEvent(
        new CustomEvent('wasl:message-deleted', { detail: messageId })
      )
    } catch {
      toast.error('Network error')
    } finally {
      setDeleting(false)
    }
  }

  async function handleDeleteForMe() {
    if (!messageId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/messages/${messageId}/for-me`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Failed to delete message')
        return
      }
      toast.success('Message deleted for you')
      onOpenChange(false)
      // Local-only hide: remove from this user's UI without broadcasting to
      // other participants. The chat-window listens on
      // `wasl:message-hidden-for-me` and removes the message from local state
      // WITHOUT emitting a socket event.
      window.dispatchEvent(
        new CustomEvent('wasl:message-hidden-for-me', { detail: messageId })
      )
    } catch {
      toast.error('Network error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            Delete message
          </DialogTitle>
          <DialogDescription>
            Choose how you want to delete this message
          </DialogDescription>
        </DialogHeader>

        {/* Message preview */}
        <div className="rounded-lg border border-border bg-muted/30 p-2.5 mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Message
          </div>
          <div className="text-sm text-foreground truncate">
            {messageContent.slice(0, 120)}
            {messageContent.length > 120 ? '…' : ''}
          </div>
        </div>

        <div className="space-y-2">
          {/* Delete for everyone */}
          {isOwnMessage && canDeleteForEveryone && (
            <button
              type="button"
              onClick={() => handleDeleteForEveryone()}
              disabled={deleting}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-destructive">
                  Delete for everyone
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  This message will be removed for all participants in this
                  chat. This action cannot be undone.
                </p>
              </div>
              {deleting && (
                <Loader2 className="w-4 h-4 animate-spin text-destructive shrink-0" />
              )}
            </button>
          )}

          {/* Delete for me */}
          <button
            type="button"
            onClick={() => handleDeleteForMe()}
            disabled={deleting}
            className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
          >
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">
                Delete for me
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                {isOwnMessage
                  ? 'This message will be removed from your view only.'
                  : 'This message will be removed from your view.'}
              </p>
            </div>
          </button>

          {/* Warning for time-limited delete-for-everyone */}
          {isOwnMessage && !canDeleteForEveryone && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                &quot;Delete for everyone&quot; is only available within 1 hour
                of sending the message.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
