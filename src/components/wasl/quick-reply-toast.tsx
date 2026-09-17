'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, MessageSquare } from 'lucide-react'

/**
 * QuickReplyToast — an in-app notification toast shown when a new message
 * arrives in a conversation that isn't currently active. Lets the user type
 * a quick reply without switching conversations.
 *
 * Features:
 * - Sender name + message preview at the top
 * - A text input that grows with content (up to 3 rows)
 * - Enter to send, Shift+Enter for newline
 * - "Open" button to navigate to the conversation
 * - Auto-dismiss after 8s (controlled by sonner's duration option)
 * - Keyboard: focuses the input on mount so the user can type immediately
 */
export function QuickReplyToast({
  senderName,
  messagePreview,
  onReply,
  onOpen,
}: {
  senderName: string
  messagePreview: string
  onReply: (text: string) => void | Promise<void>
  onOpen: () => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus the input on mount so the user can start typing immediately.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      await onReply(trimmed)
    } finally {
      setSending(false)
      setText('')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="w-full sm:w-80 bg-white dark:bg-[var(--wasl-sidebar-bg)] rounded-xl shadow-2xl border border-border/60 overflow-hidden wasl-msg-in">
      {/* Header — sender name + open button */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--wasl-green)]/8 dark:bg-[var(--wasl-green)]/15 border-b border-border/40">
        <div className="w-8 h-8 rounded-full bg-[var(--wasl-green)] flex items-center justify-center text-white text-xs font-bold shrink-0">
          {senderName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">
            {senderName}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {messagePreview}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-[var(--wasl-green)] hover:bg-[var(--wasl-green)]/10 transition-colors"
          title="Open conversation"
          aria-label="Open conversation"
        >
          <MessageSquare className="w-4 h-4" />
        </button>
      </div>
      {/* Quick reply input */}
      <div className="flex items-end gap-2 p-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Quick reply…"
          rows={1}
          className="flex-1 resize-none bg-muted/40 dark:bg-muted/30 rounded-lg px-2.5 py-1.5 text-sm outline-none border border-transparent focus:border-[var(--wasl-green)]/40 focus:bg-white dark:focus:bg-[var(--wasl-sidebar-bg)] transition-colors max-h-[80px] wasl-scroll"
          disabled={sending}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--wasl-green)] text-white hover:bg-[var(--wasl-green-dark)] disabled:hover:bg-[var(--wasl-green)]"
          title="Send reply"
          aria-label="Send reply"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
