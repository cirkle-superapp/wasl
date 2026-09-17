'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Send,
  Smile,
  Paperclip,
  Mic,
  X,
  CornerUpLeft,
  ShieldCheck,
  BarChart3,
  Clock,
  Trash2,
  Lock,
  LockOpen,
  FileText,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmojiPicker } from './emoji-picker'
import { useWaslStore } from '@/lib/store'
import { toast } from 'sonner'

export type SendOptions = { protected?: boolean }

export function MessageInput({
  conversationId,
  onSend,
  onTypingChange,
  onSendImage,
  onOpenCommit,
  canCommit,
  onOpenPoll,
  onSchedule,
}: {
  conversationId: string
  onSend: (content: string, type?: string, opts?: SendOptions) => Promise<void>
  onTypingChange: (typing: boolean) => void
  onSendImage?: (dataUrl: string, opts?: SendOptions) => Promise<void>
  onOpenCommit?: () => void
  canCommit?: boolean
  onOpenPoll?: () => void
  onSchedule?: (content: string) => void
}) {
  const [value, setValue] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  // Lock override for the next message:
  //   null  → use the user's `defaultProtectMessages` setting
  //   true  → force protect this message
  //   false → force do NOT protect this message
  const [lockOverride, setLockOverride] = useState<boolean | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Hidden input for non-image attachments (PDF / document / audio). Routes
  // the picked file through /api/upload, then sends a chat message with the
  // returned URL as the content (and JSON-embeds the filename + size so the
  // message-bubble can render a proper file-attachment card).
  const docFileRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingChange = useRef<boolean>(false)
  // True while a doc/PDF/audio attachment is being uploaded. Drives the
  // spinner overlay on the attach button + disables the input briefly.
  const [docUploading, setDocUploading] = useState(false)
  const replyTo = useWaslStore((s) => s.replyTo)
  const setReplyTo = useWaslStore((s) => s.setReplyTo)
  const user = useWaslStore((s) => s.user)
  // Resolve the display name of the user who sent the message we're replying
  // to. Subscribing via a single selector keeps re-renders cheap (Zustand
  // compares the returned string by value, so we only re-render when the name
  // actually changes).
  const replyToSenderName = useWaslStore((s) => {
    if (!s.replyTo || !s.activeConversationId) return undefined
    const conv = s.conversations.find((c) => c.id === s.activeConversationId)
    if (!conv) return undefined
    const fallback =
      conv.participants.find((p) => p.userId === s.replyTo!.senderId)?.name
    return fallback
  })

  // Resolve the effective `protected` flag for the next outgoing message.
  const defaultProtect = !!user?.defaultProtectMessages
  const effectiveProtect =
    lockOverride === null ? defaultProtect : lockOverride

  // Reset state when conversation changes
  useEffect(() => {
    setValue('')
    setEmojiOpen(false)
    setReplyTo(null)
    setLockOverride(null)
    cancelRecording()
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [conversationId, setReplyTo])

  // ---- Voice recording --------------------------------------------------
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Voice recording is not supported in this browser')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'
      const mr = new MediaRecorder(stream, { mimeType: mime })
      recordedChunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: mime })
        // Cap at ~1.5MB to fit in the DB content column
        if (blob.size > 1.5 * 1024 * 1024) {
          toast.error('Voice message too long (max ~1.5MB)')
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const reader = new FileReader()
        reader.onload = async () => {
          await onSend(reader.result as string, 'voice')
        }
        reader.readAsDataURL(blob)
        stream.getTracks().forEach((t) => t.stop())
      }
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => {
          if (s >= 180) {
            stopRecording()
            return s
          }
          return s + 1
        })
      }, 1000)
    } catch (e) {
      console.error(e)
      toast.error('Microphone access denied')
    }
  }

  function stopRecording() {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setRecording(false)
  }

  function cancelRecording() {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Replace onstop to prevent sending
      mediaRecorderRef.current.onstop = () => {
        if (mediaRecorderRef.current?.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop())
        }
      }
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
    recordedChunksRef.current = []
    setRecording(false)
    setRecordSeconds(0)
  }

  // Auto-resize textarea
  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
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
      await onSend(trimmed, 'text', { protected: effectiveProtect })
      setValue('')
      // Clear the reply preview once the message is on its way. The parent
      // chat-window's handleSend also clears this, but we clear it here too
      // so the composer stays self-contained (and reacts immediately even
      // if onSend is wrapped/delayed upstream).
      setReplyTo(null)
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
        await onSendImage?.(reader.result as string, { protected: effectiveProtect })
      } catch (err) {
        console.error(err)
        toast.error('Failed to send image')
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Attach a non-image file (PDF / document / audio). The file is POSTed to
  // /api/upload which validates the type + size and writes it to
  // public/uploads/, then a chat message is sent with the resulting URL
  // (JSON-embedded with name + size for the bubble's file-card renderer).
  async function handleDocFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setDocUploading(true)
    const toastId = toast.loading(`Uploading ${file.name}…`)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || `Upload failed (${res.status})`)
      }
      const data: {
        url: string
        type: 'pdf' | 'document' | 'audio' | 'image'
        name: string
        size: number
      } = await res.json()
      // Build the message content (JSON for non-image types so the bubble
      // can render filename + size; image content stays a plain URL to keep
      // the existing <img> renderer happy — though this branch shouldn't
      // normally receive images, the upload API may categorise an audio/*
      // mime as `image` only if the browser is buggy, so we guard anyway).
      const content =
        data.type === 'image'
          ? data.url
          : JSON.stringify({ url: data.url, name: data.name, size: data.size })
      await onSend(content, data.type, { protected: effectiveProtect })
      toast.success(`Sent ${file.name}`, { id: toastId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload file'
      toast.error(msg, { id: toastId })
    } finally {
      setDocUploading(false)
    }
  }

  return (
    <div className="relative bg-[var(--wasl-chat-bg)] px-2 sm:px-4 py-2 border-t border-border/60">
      {/* Reply preview bar — WhatsApp/Telegram-style quote preview that
          appears above the toolbar row whenever `replyTo` is set in the store.
          Clicking the bar (or pressing Enter/Space when focused) scrolls the
          chat back to the original message via the wasl:jump-to-message event. */}
      {replyTo && (
        <div
          role="button"
          tabIndex={0}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('wasl:jump-to-message', { detail: replyTo.id })
            )
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              window.dispatchEvent(
                new CustomEvent('wasl:jump-to-message', { detail: replyTo.id })
              )
            }
          }}
          title="Jump to original message"
          className="wasl-reply-banner-in mb-2 mx-1 flex items-start gap-2 bg-muted/40 dark:bg-[var(--wasl-sidebar-bg)] rounded-lg p-2 shadow-sm border-y border-r border-border cursor-pointer hover:bg-muted/60 dark:hover:bg-[var(--wasl-sidebar-bg)]/80 transition-colors"
          style={{ borderLeft: '3px solid var(--wasl-green)' }}
        >
          <CornerUpLeft className="w-4 h-4 mt-0.5 text-[var(--wasl-green)] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]">
              {replyTo.senderId === user?.id
                ? 'Replying to yourself'
                : replyToSenderName
                  ? `Replying to ${replyToSenderName}`
                  : 'Replying to message'}
            </div>
            <div className="text-sm text-muted-foreground truncate">
              {replyTo.content.length > 80
                ? replyTo.content.slice(0, 80) + '…'
                : replyTo.content}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setReplyTo(null)
            }}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Cancel reply"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-1 sm:gap-2 max-w-4xl mx-auto overflow-x-auto wasl-scroll sm:overflow-visible pb-1 sm:pb-0">
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

        {/* Attachment button — image only (kept as data URL for backward compat) */}
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

        {/* Attach file button — PDF / document / audio. Routes through the
            /api/upload endpoint (max 5MB) and sends a typed chat message. */}
        <button
          type="button"
          onClick={() => docFileRef.current?.click()}
          disabled={docUploading}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0',
            docUploading
              ? 'text-[var(--wasl-green)] bg-[var(--wasl-green)]/10 cursor-progress'
              : 'text-muted-foreground hover:text-[var(--wasl-green)] hover:bg-[var(--wasl-green)]/10'
          )}
          title="Attach PDF / document / audio"
          aria-label="Attach PDF / document / audio"
        >
          {docUploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <FileText className="w-5 h-5" />
          )}
        </button>
        <input
          ref={docFileRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,audio/*"
          className="hidden"
          onChange={handleDocFileSelect}
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

        {/* Poll button — Cirkle-inspired chat polls */}
        {onOpenPoll && (
          <button
            type="button"
            onClick={onOpenPoll}
            className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-[var(--wasl-green)] hover:bg-[var(--wasl-green)]/10 transition-colors shrink-0"
            title="Create a poll"
          >
            <BarChart3 className="w-5 h-5" />
          </button>
        )}

        {/* Schedule button — Cirkle-inspired scheduled messages */}
        {onSchedule && (
          <button
            type="button"
            onClick={() => { if (value.trim()) onSchedule(value.trim()) }}
            disabled={!value.trim()}
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0',
              value.trim()
                ? 'text-muted-foreground hover:text-[var(--wasl-green)] hover:bg-[var(--wasl-green)]/10'
                : 'text-muted-foreground/30 cursor-not-allowed'
            )}
            title="Schedule message"
          >
            <Clock className="w-5 h-5" />
          </button>
        )}

        {/* Protection lock toggle — protect the next outgoing message from
            screenshot/forwarding. Cycles through three states:
              - inherit (use the user's default — shown as a hollow lock)
              - protect (filled green lock)
              - allow (open lock)
            The current effective state is shown in the title attribute. */}
        <button
          type="button"
          onClick={() => {
            // Cycle: null → true → false → null
            setLockOverride((cur) =>
              cur === null ? true : cur === true ? false : null
            )
          }}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0',
            effectiveProtect
              ? 'text-[var(--wasl-green)] bg-[var(--wasl-green)]/10 hover:bg-[var(--wasl-green)]/20'
              : lockOverride === false
                ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
          title={
            lockOverride === null
              ? `Message protection: inherit (your default is ${defaultProtect ? 'protected' : 'not protected'})`
              : lockOverride
                ? 'Message protection: ON — recipient cannot screenshot or forward'
                : 'Message protection: OFF — recipient can screenshot & forward'
          }
          aria-label="Toggle message protection"
        >
          {effectiveProtect ? (
            <Lock className="w-5 h-5" />
          ) : lockOverride === false ? (
            <LockOpen className="w-5 h-5" />
          ) : (
            <Lock className="w-5 h-5" />
          )}
        </button>

        {/* Textarea */}
        <div className="flex-1 bg-white dark:bg-[var(--wasl-sidebar-bg)] rounded-2xl shadow-sm border border-border/60 px-3 py-1.5">
          {recording ? (
            <div className="flex items-center gap-2 py-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-medium text-red-500">Recording…</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={cancelRecording}
                className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                title="Cancel recording"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="p-1.5 rounded-full bg-[var(--wasl-green)] text-white hover:bg-[var(--wasl-green-dark)]"
                title="Send voice message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Type a message"
              className="w-full resize-none bg-transparent outline-none text-sm leading-relaxed max-h-[120px] wasl-scroll py-1"
              disabled={sending}
            />
          )}
        </div>

        {/* Send / Mic button */}
        {recording ? null : (
          <button
            type="button"
            onClick={value.trim() ? handleSend : startRecording}
            disabled={sending}
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 text-white',
              value.trim()
                ? 'bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] wasl-send-pulse shadow-md shadow-[var(--wasl-green)]/30'
                : 'bg-gray-400 hover:bg-gray-500'
            )}
            title={value.trim() ? 'Send' : 'Record voice message'}
            aria-label={value.trim() ? 'Send message' : 'Record voice message'}
          >
            {value.trim() ? (
              <Send className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}
