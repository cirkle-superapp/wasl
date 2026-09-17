'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Pencil, Loader2, AlertTriangle, Clock } from 'lucide-react'
import { toast } from 'sonner'
import {
  MESSAGE_EDIT_TIME_LIMIT_MS,
  MESSAGE_EDIT_WARNING_THRESHOLD_MS,
} from '@/lib/constants'
import type { ChatMessage } from '@/lib/store'

// EditMessageDialog — replaces the old `prompt()`-based edit flow.
//
// Lets the sender edit a text message within the MESSAGE_EDIT_TIME_LIMIT_MS
// window (default 15 min). The dialog shows:
//   - The original message content in a textarea
//   - A live "Xm left to edit this message" countdown (ticks every 1s so the
//     minutes digit visibly counts down as the deadline approaches)
//   - An amber warning banner once the remaining time drops below
//     MESSAGE_EDIT_WARNING_THRESHOLD_MS (default 2 min)
//   - A Save button that's disabled when the content is empty/unchanged OR
//     when the edit window has elapsed (the API would 403 anyway)
//
// On save it PATCHes /api/messages/{id}/edit, then calls the parent's
// `onEdited` callback so the chat-window can update the store + emit the
// socket "message:reacted" event (the existing broadcast that nudges other
// clients to refetch).
export function EditMessageDialog({
  open,
  onOpenChange,
  message,
  conversationId,
  onEdited,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  message: ChatMessage | null
  conversationId: string | null
  onEdited: (messageId: string, newContent: string) => void
}) {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  // Seed the textarea whenever the dialog opens for a different message.
  useEffect(() => {
    if (open && message) {
      setContent(message.content)
    }
  }, [open, message?.id])
  // ↑ `message?.id` is the only thing that should re-seed — we deliberately
  //   ignore `message.content` so we don't blow away the user's in-progress
  //   edit if the store updates underneath us (e.g. via a socket event).

  // ---- Countdown ------------------------------------------------------------
  // Re-evaluate "now" every second so the "Xm left" copy stays accurate as
  // the deadline approaches. setInterval is cheap (a single useState bump)
  // and the dialog is short-lived, so we don't bother with the dormant-timer
  // optimisation the message-bubble uses.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!open || !message) return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [open, message?.id])

  const createdAt = message ? new Date(message.createdAt).getTime() : 0
  const elapsedMs = useMemo(
    () => (createdAt ? now - createdAt : Infinity),
    [now, createdAt]
  )
  const msLeft = Math.max(0, MESSAGE_EDIT_TIME_LIMIT_MS - elapsedMs)
  const minsLeft = Math.max(0, Math.ceil(msLeft / 60_000))
  const secsLeftTotal = Math.max(0, Math.floor(msLeft / 1000))
  const displayMin = Math.floor(secsLeftTotal / 60)
  const displaySec = secsLeftTotal % 60
  const canEdit = elapsedMs < MESSAGE_EDIT_TIME_LIMIT_MS
  const warn = msLeft > 0 && msLeft <= MESSAGE_EDIT_WARNING_THRESHOLD_MS
  const expired = !canEdit

  // Save is disabled when:
  //   - the window has elapsed (server would 403 anyway)
  //   - the trimmed content is empty
  //   - the trimmed content equals the existing message content (no change)
  //   - a save is in-flight
  const trimmed = content.trim()
  const unchanged = !!message && trimmed === message.content
  const saveDisabled =
    saving || expired || !trimmed || unchanged

  const handleSave = useCallback(async () => {
    if (!message || !conversationId || saveDisabled) return
    setSaving(true)
    try {
      const res = await fetch(`/api/messages/${message.id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      })
      if (res.status === 403) {
        const err = await res.json().catch(() => null)
        toast.error(
          err?.error ||
            'The 15-minute edit window has passed — this message can no longer be edited.'
        )
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Failed to edit message')
        return
      }
      // No content change — server says it's a no-op. Just close the dialog.
      const data = await res.json().catch(() => ({}))
      if (data.unchanged) {
        onOpenChange(false)
        return
      }
      onEdited(message.id, trimmed)
      toast.success('Message edited')
      onOpenChange(false)
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }, [message, conversationId, saveDisabled, trimmed, onEdited, onOpenChange])

  // ---- Auto-close if the window elapses while the dialog is open ------------
  // Once the window closes there's nothing useful to do here — close the
  // dialog and let the user see the toolbar button has disappeared.
  useEffect(() => {
    if (open && expired) {
      const t = window.setTimeout(() => onOpenChange(false), 1500)
      return () => window.clearTimeout(t)
    }
  }, [open, expired, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-muted-foreground" />
            Edit message
          </DialogTitle>
          <DialogDescription>
            Make your changes — your last version is saved to the message&apos;s
            edit history.
          </DialogDescription>
        </DialogHeader>

        {/* Countdown banner */}
        <div
          className={
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ' +
            (expired
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : warn
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'border-border bg-muted/30 text-muted-foreground')
          }
        >
          {expired ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                The 15-minute edit window has passed — this message can no
                longer be edited.
              </span>
            </>
          ) : warn ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                You have{' '}
                <span className="font-semibold tabular-nums">
                  {displayMin}:{String(displaySec).padStart(2, '0')}
                </span>{' '}
                left to edit this message.
              </span>
            </>
          ) : (
            <>
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                You have{' '}
                <span className="font-semibold tabular-nums">{minsLeft}m</span>{' '}
                left to edit this message.
              </span>
            </>
          )}
        </div>

        {/* Editable content */}
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          autoFocus
          disabled={saving || expired}
          placeholder="Edit your message…"
          className="resize-none"
        />

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveDisabled}
            className="gap-1.5"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Pencil className="w-3.5 h-3.5" />
                Save changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
