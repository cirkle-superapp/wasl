'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Send,
  Smile,
  Paperclip,
  Mic,
  X,
  Reply,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmojiPicker } from './emoji-picker'
import { useWaslStore } from '@/lib/store'
import { toast } from 'sonner'

export function MessageInput({
  conversationId,
  onSend,
  onTypingChange,
  onSendImage,
  onOpenCommit,
  canCommit,
}: {
  conversationId: string
  onSend: (content: string, type?: string) => Promise<void>
  onTypingChange: (typing: boolean) => void
  onSendImage?: (dataUrl: string) => Promise<void>
  onOpenCommit?: () => void
  canCommit?: boolean
}) {
  const [value, setValue] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingChange = useRef<boolean>(false)
  const replyTo = useWaslStore((s) => s.replyTo)
  const setReplyTo = useWaslStore((s) => s.setReplyTo)
  const user = useWaslStore((s) => s.user)

  // Reset state when conversation changes
  useEffect(() => {
    setValue('')
    setEmojiOpen(false)
    setReplyTo(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [conversationId, setReplyTo])

  // Auto-resize textarea
  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px'
  }, [value])

  function emitTyping(typing: boolean) {
    if (typing === lastTypingChange.current) return
    lastTypingChange.current = typing
    onTypingChange(typing)
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value
    setValue(v)
    if (v.trim() && !typingTimer.current) {
      emitTyping(true)
    }
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null
      emitTyping(false)
    }, 2500)
  }

  async function handleSend() {
    const trimmed = value.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      await onSend(trimmed, 'text')
      setValue('')
      emitTyping(false)
      if (typingTimer.current) {
        clearTimeout(typingTimer.current)
        typingTimer.current = null
      }
      // refocus
      textareaRef.current?.focus()
    } catch (e) {
      console.error(e)
      toast.error('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error('Image too large (max 1.5MB)')
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await onSendImage?.(reader.result as string)
      } catch (err) {
        console.error(err)
        toast.error('Failed to send image')
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="relative bg-[var(--wasl-chat-bg)] px-2 sm:px-4 py-2 border-t border-border/60">
      {/* Reply banner */}
      {replyTo && (
        <div className="mb-2 mx-1 flex items-start gap-2 bg-white dark:bg-[var(--wasl-sidebar-bg)] rounded-lg p-2 shadow-sm border border-border">
          <Reply className="w-4 h-4 mt-0.5 text-[var(--wasl-green)] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]">
              Reply to {replyTo.senderId === user?.id ? 'yourself' : 'message'}
            </div>
            <div className="text-sm text-muted-foreground truncate">
              {replyTo.content}
            </div>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground"
            aria-label="Cancel reply"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        {/* Emoji button */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setEmojiOpen((v) => !v)}
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
              emojiOpen
                ? 'text-[var(--wasl-green)]'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
            title="Emoji"
          >
            <Smile className="w-6 h-6" />
          </button>
          <EmojiPicker
            open={emojiOpen}
            onSelect={(emoji) => {
              setValue((v) => v + emoji)
              textareaRef.current?.focus()
            }}
            onClose={() => setEmojiOpen(false)}
          />
        </div>

        {/* Attachment button */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          title="Attach image"
        >
          <Paperclip className="w-5 h-5 rotate-45" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Commit button — Cirkle-inspired verified agreements */}
        {canCommit && onOpenCommit && (
          <button
            type="button"
            onClick={onOpenCommit}
            className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-[var(--wasl-green)] hover:bg-[var(--wasl-green)]/10 transition-colors shrink-0"
            title="Create a verified commit"
          >
            <ShieldCheck className="w-5 h-5" />
          </button>
        )}

        {/* Textarea */}
        <div className="flex-1 bg-white dark:bg-[var(--wasl-sidebar-bg)] rounded-2xl shadow-sm border border-border/60 px-3 py-1.5">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Type a message"
            className="w-full resize-none bg-transparent outline-none text-sm leading-relaxed max-h-36 wasl-scroll py-1"
            disabled={sending}
          />
        </div>

        {/* Send / Mic button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !value.trim()}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 text-white',
            value.trim()
              ? 'bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)]'
              : 'bg-gray-400'
          )}
          title={value.trim() ? 'Send' : 'Mic (coming soon)'}
        >
          {value.trim() ? (
            <Send className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  )
}
