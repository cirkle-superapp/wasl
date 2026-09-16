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
  BarChart3,
  Clock,
  Trash2,
  Lock,
  LockOpen,
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingChange = useRef<boolean>(false)
  const replyTo = useWaslStore((s) => s.replyTo)
  const setReplyTo = useWaslStore((s) => s.setReplyTo)
  const user = useWaslStore((s) => s.user)

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

  return (
    <div className="relative bg-[var(--wasl-chat-bg)] px-2 sm:px-4 py-2 border-t border-border/60">
      {/* Reply banner */}
      {replyTo && (
        <div className="mb-2 mx-1 flex items-start gap-2 bg-white dark:bg-[var(--wasl-sidebar-bg)] rounded-lg p-2 shadow-sm border-l-4 border-[var(--wasl-green)] border-y border-r border-border">
          <Reply className="w-4 h-4 mt-0.5 text-[var(--wasl-green)] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]">
              Reply to {replyTo.senderId === user?.id ? 'yourself' : 'message'}
            </div>
            <div className="text-sm text-muted-foreground truncate max-h-10 overflow-hidden">
              {replyTo.content}
            </div>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground shrink-0"
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
