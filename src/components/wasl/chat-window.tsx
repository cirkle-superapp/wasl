'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  ArrowLeft,
  MoreVertical,
  Phone,
  Video,
  Search,
  Trash2,
  Info,
  Users,
  Reply as ReplyIcon,
  Copy,
  ChevronDown,
  Sparkles,
  Lock,
  ListChecks,
  Wand2,
  Timer,
  Paperclip,
  Pin,
  PinOff,
} from 'lucide-react'
import { WaslAvatar, WaslGroupAvatar } from './wasl-avatar'
import { WaslLogo } from './wasl-logo'
import { MessageBubble } from './message-bubble'
import { MessageInput } from './message-input'
import { NewCommitDialog } from './new-commit-dialog'
import { NewPollDialog } from './new-poll-dialog'
import { ChatSearchDialog } from './chat-search-dialog'
import { SmartReplyChips } from './smart-reply-chips'
import { ScheduleDialog } from './schedule-dialog'
import { ChatSummaryDialog } from './chat-summary-dialog'
import { AppLockDialog } from './app-lock-dialog'
import { ActionItemsDialog } from './action-items-dialog'
import { ToneAdjusterDialog } from './tone-adjuster-dialog'
import { CommandPalette } from './command-palette'
import { ForwardDialog } from './forward-dialog'
import { DeleteMessageDialog } from './delete-message-dialog'
import { useWaslStore, type ChatMessage } from '@/lib/store'
import { connectSocket, getSocket } from '@/lib/socket'
import { formatLastSeen, formatDateDivider, formatChatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { Skeleton, MessageSkeleton } from '@/components/ui/skeleton'

const PAGE_SIZE = 40

export function ChatWindow({
  onBack,
  onOpenInfo,
}: {
  onBack: () => void
  onOpenInfo: () => void
}) {
  const {
    activeConversationId,
    user,
    messagesByConversation,
    setMessages,
    addMessage,
    prependMessages,
    updateMessageStatus,
    conversations,
    upsertConversation,
    onlineUserIds,
    typingByConversation,
    setShowProfilePanel,
    setReplyTo,
    replyTo,
    upsertCommit,
    commitsByConversation,
    setCommits,
    toggleReaction,
    setStarred,
    removeMessage,
    socketStatus,
  } = useWaslStore()

  const [commitOpen, setCommitOpen] = useState(false)
  const [pollOpen, setPollOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleContent, setScheduleContent] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [appLockOpen, setAppLockOpen] = useState(false)
  const [actionItemsOpen, setActionItemsOpen] = useState(false)
  const [toneOpen, setToneOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [botReplying, setBotReplying] = useState(false)
  // Drop zone state — shown when a file is dragged over the chat window
  const [isDragging, setIsDragging] = useState(false)
  const dragDepthRef = useRef(0)

  const conversation = conversations.find((c) => c.id === activeConversationId)
  const messages = activeConversationId
    ? messagesByConversation[activeConversationId] || []
    : []

  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [oldestLoaded, setOldestLoaded] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wasNearBottomRef = useRef(true)
  const lastMessageHeightRef = useRef(0)
  const messageIdsRef = useRef<Set<string>>(new Set())
  const didInitialScrollRef = useRef(false)

  // Find other user for 1-on-1
  const otherUser =
    conversation && !conversation.isGroup
      ? conversation.participants.find((p) => p.userId !== user?.id)
      : null
  const isOnline =
    !!otherUser &&
    (onlineUserIds.has(otherUser.userId) || otherUser.online)

  // Typing users (excluding me)
  const typingUsers = activeConversationId
    ? Object.entries(typingByConversation[activeConversationId] || {})
        .filter(([uid]) => uid !== user?.id)
        .map(([uid]) => {
          const p = conversation?.participants.find((pp) => pp.userId === uid)
          return p?.name || 'Someone'
        })
    : []

  // ---- Load initial messages on conversation change --------------------------
  const loadMessages = useCallback(async () => {
    if (!activeConversationId) return
    setLoading(true)
    setHasMore(true)
    setOldestLoaded(null)
    messageIdsRef.current = new Set()
    didInitialScrollRef.current = false
    try {
      const res = await fetch(
        `/api/conversations/${activeConversationId}/messages?limit=${PAGE_SIZE}`,
        { cache: 'no-store' }
      )
      if (!res.ok) return
      const data = await res.json()
      const msgs: ChatMessage[] = data.messages
      setMessages(activeConversationId, msgs)
      msgs.forEach((m) => messageIdsRef.current.add(m.id))
      if (msgs.length < PAGE_SIZE) setHasMore(false)
      if (msgs.length > 0) setOldestLoaded(msgs[0].createdAt)

      // Emit delivered status for messages not from me
      const othersMsgIds = msgs
        .filter((m) => m.senderId !== user?.id && m.status === 'sent')
        .map((m) => m.id)
      if (othersMsgIds.length > 0) {
        getSocket().emit('message:status', {
          conversationId: activeConversationId,
          messageIds: othersMsgIds,
          status: 'delivered',
          byUserId: user?.id,
        })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [activeConversationId, setMessages, user?.id])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  // ---- Load commits for the active conversation -------------------------------
  useEffect(() => {
    if (!activeConversationId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/commits?conversationId=${activeConversationId}`,
          { cache: 'no-store' }
        )
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data.commits)) {
          setCommits(activeConversationId, data.commits)
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeConversationId, setCommits])

  // ---- Join conversation socket room on change -------------------------------
  useEffect(() => {
    if (!activeConversationId || !user?.id) return
    const socket = connectSocket(user.id)
    socket.emit('conversation:join', { conversationId: activeConversationId })
    return () => {
      socket.emit('conversation:leave', { conversationId: activeConversationId })
    }
  }, [activeConversationId, user?.id])

  // ---- Listen for socket events (new message, status, typing) ----------------
  useEffect(() => {
    if (!activeConversationId || !user?.id) return
    const socket = connectSocket(user.id)

    function onMessageReceived(payload: { conversationId: string; message: ChatMessage }) {
      if (!payload || !payload.message || payload.conversationId !== activeConversationId) return
      const m = payload.message
      if (messageIdsRef.current.has(m.id)) return
      messageIdsRef.current.add(m.id)
      addMessage(activeConversationId, m)

      // If message is from someone else, mark as delivered
      if (m.senderId !== user?.id) {
        getSocket().emit('message:status', {
          conversationId: activeConversationId,
          messageIds: [m.id],
          status: 'delivered',
          byUserId: user?.id,
        })
        // Also persist delivered
        fetch(`/api/conversations/${activeConversationId}/messages`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'delivered', messageIds: [m.id] }),
        }).catch(() => {})
      }
    }

    function onStatus(payload: {
      conversationId: string
      messageIds: string[]
      status: string
      byUserId: string
    }) {
      if (!payload || payload.conversationId !== activeConversationId) return
      updateMessageStatus(activeConversationId, payload.messageIds, payload.status)
    }

    // When another client updates a commit (sign/complete), re-fetch it.
    async function onCommitUpdated(payload: {
      conversationId: string
      commitId: string
    }) {
      if (!payload || payload.conversationId !== activeConversationId || !payload.commitId) return
      try {
        const res = await fetch(`/api/commits/${payload.commitId}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json()
        if (data.commit) upsertCommit(data.commit)
      } catch {
        // ignore
      }
    }

    // When another client reacts to / stars / deletes a message, refetch it.
    async function onMessageReacted(payload: {
      conversationId: string
      messageId: string
    }) {
      if (!payload || payload.conversationId !== activeConversationId || !payload.messageId) return
      try {
        const res = await fetch(`/api/messages/${payload.messageId}`, {
          cache: 'no-store',
        })
        if (!res.ok) {
          // 404 means the message was deleted — remove it locally.
          if (res.status === 404) {
            removeMessage(activeConversationId, payload.messageId)
          }
          return
        }
        const data = await res.json()
        if (data.message) {
          // Replace the message in-place with the updated one (reactions/star).
          useWaslStore.getState().updateMessage(activeConversationId, payload.messageId, data.message)
        }
      } catch {
        // ignore
      }
    }

    socket.on('message:received', onMessageReceived)
    socket.on('message:status', onStatus)
    socket.on('commit:updated', onCommitUpdated)
    socket.on('message:reacted', onMessageReacted)

    return () => {
      socket.off('message:received', onMessageReceived)
      socket.off('message:status', onStatus)
      socket.off('commit:updated', onCommitUpdated)
      socket.off('message:reacted', onMessageReacted)
    }
  }, [activeConversationId, user?.id, addMessage, updateMessageStatus, upsertCommit, removeMessage])

  // ---- Auto-scroll to bottom when new messages arrive ------------------------
  useEffect(() => {
    if (!scrollRef.current) return
    if (wasNearBottomRef.current && !loadingMore) {
      // scroll to bottom
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, loadingMore])

  useEffect(() => {
    // After initial load, scroll to bottom once
    if (loading) return
    if (didInitialScrollRef.current) return
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      didInitialScrollRef.current = true
    }
  }, [loading])

  // ---- Track whether user is near bottom -------------------------------------
  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    wasNearBottomRef.current = distFromBottom < 80
    setShowScrollBtn(distFromBottom > 240)
    // Load more when near top
    if (el.scrollTop < 40 && hasMore && !loadingMore && !loading) {
      void loadMore()
    }
  }

  function scrollToBottom() {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    wasNearBottomRef.current = true
    setShowScrollBtn(false)
  }

  // ---- Scroll to a specific message (by ID) ---------------------------------
  // Used by the "jump to message" feature from the StarredMessagesDialog.
  // Listens for a custom window event so any component can trigger it.
  useEffect(() => {
    function onJumpToMessage(e: Event) {
      const messageId = (e as CustomEvent<string>).detail
      if (!messageId || !scrollRef.current) return
      const target = scrollRef.current.querySelector(
        `[data-message-id="${messageId}"]`
      ) as HTMLElement | null
      if (target) {
        // Scroll the message into view (smooth, centered in the container)
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Briefly flash the message to draw attention
        target.classList.add('wasl-message-flash')
        setTimeout(() => target.classList.remove('wasl-message-flash'), 2000)
      }
    }
    // Remove a message from the local state after deletion (triggered by the
    // DeleteMessageDialog after the API confirms the deletion).
    function onMessageDeleted(e: Event) {
      const messageId = (e as CustomEvent<string>).detail
      if (!messageId || !activeConversationId) return
      removeMessage(activeConversationId, messageId)
      // Broadcast via socket so other clients also remove it
      getSocket().emit('message:reacted', {
        conversationId: activeConversationId,
        messageId,
      })
    }
    window.addEventListener('wasl:jump-to-message', onJumpToMessage as EventListener)
    window.addEventListener('wasl:message-deleted', onMessageDeleted as EventListener)
    return () => {
      window.removeEventListener('wasl:jump-to-message', onJumpToMessage as EventListener)
      window.removeEventListener('wasl:message-deleted', onMessageDeleted as EventListener)
    }
  }, [activeConversationId, removeMessage])

  // ---- Load older messages ---------------------------------------------------
  async function loadMore() {
    if (!activeConversationId || !oldestLoaded) return
    setLoadingMore(true)
    lastMessageHeightRef.current = scrollRef.current?.scrollHeight || 0
    try {
      const res = await fetch(
        `/api/conversations/${activeConversationId}/messages?before=${encodeURIComponent(
          oldestLoaded
        )}&limit=${PAGE_SIZE}`,
        { cache: 'no-store' }
      )
      if (!res.ok) return
      const data = await res.json()
      const msgs: ChatMessage[] = data.messages
      if (msgs.length === 0) {
        setHasMore(false)
      } else {
        prependMessages(activeConversationId, msgs)
        msgs.forEach((m) => messageIdsRef.current.add(m.id))
        setOldestLoaded(msgs[0].createdAt)
        if (msgs.length < PAGE_SIZE) setHasMore(false)
        // Preserve scroll position
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            const newHeight = scrollRef.current.scrollHeight
            scrollRef.current.scrollTop =
              newHeight - lastMessageHeightRef.current
          }
        })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingMore(false)
    }
  }

  // ---- Send message ----------------------------------------------------------
  const handleSend = useCallback(
    async (content: string, type: string = 'text', opts?: { protected?: boolean }) => {
      if (!activeConversationId || !user?.id) return
      const res = await fetch(
        `/api/conversations/${activeConversationId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            type,
            replyToId: replyTo?.id,
            protected: opts?.protected,
          }),
        }
      )
      if (!res.ok) {
        throw new Error('Failed to send')
      }
      const msg: ChatMessage = await res.json()
      if (messageIdsRef.current.has(msg.id)) return
      messageIdsRef.current.add(msg.id)
      addMessage(activeConversationId, msg)
      setReplyTo(null)
      // Broadcast via socket
      const socket = getSocket()
      socket.emit('message:send', {
        conversationId: activeConversationId,
        message: msg,
      })
      // Update sidebar conversation preview
      if (conversation) {
        upsertConversation({
          ...conversation,
          lastMessage: msg,
          updatedAt: msg.createdAt,
        })
      }
      wasNearBottomRef.current = true

      // ---- Demo companion bot: if this is a 1-on-1 chat with a demo user,
      // simulate a typing indicator + contextual reply after a short delay.
      if (
        type === 'text' &&
        conversation &&
        !conversation.isGroup &&
        otherUser &&
        otherUser.phone.startsWith('+20100')
      ) {
        const conversationId = activeConversationId
        const userId = user.id
        // Show typing — the socket.io server broadcasts typing:update to all
        // clients EXCEPT the sender, so we also set it locally to ensure the
        // current user sees the typing indicator in the chat window and sidebar.
        setTimeout(() => {
          getSocket().emit('typing:start', {
            conversationId,
            userId: otherUser.userId,
            name: otherUser.name,
          })
          useWaslStore.getState().setTyping(conversationId, otherUser.userId, true)
        }, 600)
        setBotReplying(true)
        const delay = 1200 + Math.min(content.length * 30, 1800)
        setTimeout(async () => {
          getSocket().emit('typing:stop', {
            conversationId,
            userId: otherUser.userId,
          })
          useWaslStore.getState().setTyping(conversationId, otherUser.userId, false)
          try {
            const botRes = await fetch(
              `/api/conversations/${conversationId}/bot-reply`,
              { method: 'POST' }
            )
            if (!botRes.ok) return
            const data = await botRes.json()
            if (data.message && !messageIdsRef.current.has(data.message.id)) {
              messageIdsRef.current.add(data.message.id)
              addMessage(conversationId, data.message)
              getSocket().emit('message:send', {
                conversationId,
                message: data.message,
              })
              if (conversation) {
                upsertConversation({
                  ...conversation,
                  lastMessage: data.message,
                  updatedAt: data.message.createdAt,
                })
              }
            }
          } catch (e) {
            console.error(e)
          } finally {
            setBotReplying(false)
          }
        }, delay)
      }
    },
    [activeConversationId, user?.id, replyTo, addMessage, setReplyTo, conversation, upsertConversation, otherUser]
  )

  // ---- Message actions: react / star / copy / delete ------------------------
  const handleReact = useCallback(
    async (messageId: string, emoji: string) => {
      if (!activeConversationId || !user?.id) return
      // Optimistic toggle
      const msgs = messagesByConversation[activeConversationId] || []
      const existing = msgs
        .find((m) => m.id === messageId)
        ?.reactions?.find((r) => r.userId === user.id)
      // If the user already reacted with the same emoji → remove; else set.
      if (existing && existing.emoji === emoji) {
        toggleReaction(activeConversationId, messageId, null)
      } else {
        toggleReaction(activeConversationId, messageId, {
          id: existing?.id,
          userId: user.id,
          emoji,
        })
      }
      try {
        await fetch(`/api/messages/${messageId}/reactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji }),
        })
        getSocket().emit('message:reacted', {
          conversationId: activeConversationId,
          messageId,
        })
      } catch (e) {
        console.error(e)
      }
    },
    [activeConversationId, user?.id, messagesByConversation, toggleReaction]
  )

  const handleStar = useCallback(
    async (messageId: string) => {
      if (!activeConversationId) return
      const msgs = messagesByConversation[activeConversationId] || []
      const currentlyStarred = msgs.find((m) => m.id === messageId)?.starred
      setStarred(activeConversationId, messageId, !currentlyStarred)
      try {
        await fetch(`/api/messages/${messageId}/star`, { method: 'POST' })
      } catch (e) {
        console.error(e)
      }
    },
    [activeConversationId, messagesByConversation, setStarred]
  )

  const handleCopyMessage = useCallback(async (m: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(m.content)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }, [])

  // ---- Delete message — opens the DeleteMessageDialog -----------------------
  const [deleteMessage, setDeleteMessage] = useState<ChatMessage | null>(null)
  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      // Find the message object to pass to the dialog
      const msgs = useWaslStore.getState().messagesByConversation[activeConversationId || ''] || []
      const m = msgs.find((mm) => mm.id === messageId)
      if (m) {
        setDeleteMessage(m)
      } else {
        // Fallback: if we can't find the message, use the old confirm() flow
        if (!confirm('Delete this message? This cannot be undone.')) return
        if (!activeConversationId) return
        removeMessage(activeConversationId, messageId)
        try {
          await fetch(`/api/messages/${messageId}`, { method: 'DELETE' })
          getSocket().emit('message:reacted', {
            conversationId: activeConversationId,
            messageId,
          })
          toast.success('Message deleted')
        } catch (e) {
          console.error(e)
          toast.error('Failed to delete')
        }
      }
    },
    [activeConversationId, removeMessage]
  )

  // ---- Edit message --------------------------------------------------------
  const handleEditMessage = useCallback(
    async (m: ChatMessage) => {
      const newContent = prompt('Edit your message:', m.content)
      if (!newContent || newContent.trim() === m.content) return
      try {
        const res = await fetch(`/api/messages/${m.id}/edit`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newContent.trim() }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => null)
          toast.error(err?.error || 'Failed to edit')
          return
        }
        // Update locally — set both the new content AND the edited flag
        useWaslStore.getState().updateMessage(activeConversationId, m.id, {
          content: newContent.trim(),
          edited: true,
        })
        getSocket().emit('message:reacted', { conversationId: activeConversationId, messageId: m.id })
        toast.success('Message edited')
      } catch {
        toast.error('Failed to edit')
      }
    },
    [activeConversationId]
  )

  // ---- Forward message -----------------------------------------------------
  // Opens the ForwardDialog (multi-select) instead of using prompt().
  const [forwardOpen, setForwardOpen] = useState(false)
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null)
  const handleForwardMessage = useCallback(
    async (m: ChatMessage) => {
      setForwardMessage(m)
      setForwardOpen(true)
    },
    []
  )

  // ---- Pin/unpin message ---------------------------------------------------
  const handlePinMessage = useCallback(
    async (m: ChatMessage) => {
      if (!activeConversationId) return
      const newPinned = !m.pinned
      // Optimistic update
      useWaslStore.getState().updateMessage(activeConversationId, m.id, { pinned: newPinned })
      // If pinning, unpin any other pinned messages in this conversation
      if (newPinned) {
        const msgs = useWaslStore.getState().messagesByConversation[activeConversationId] || []
        for (const msg of msgs) {
          if (msg.id !== m.id && msg.pinned) {
            useWaslStore.getState().updateMessage(activeConversationId, msg.id, { pinned: false })
          }
        }
      }
      try {
        const res = await fetch(`/api/messages/${m.id}/pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinned: newPinned }),
        })
        if (!res.ok) {
          // Rollback
          useWaslStore.getState().updateMessage(activeConversationId, m.id, { pinned: !newPinned })
          toast.error('Failed to pin message')
          return
        }
        // Broadcast via socket so other clients update
        getSocket().emit('message:reacted', {
          conversationId: activeConversationId,
          messageId: m.id,
        })
        toast.success(newPinned ? 'Message pinned' : 'Message unpinned')
      } catch {
        useWaslStore.getState().updateMessage(activeConversationId, m.id, { pinned: !newPinned })
        toast.error('Network error')
      }
    },
    [activeConversationId]
  )

  const handleSendImage = useCallback(
    async (dataUrl: string, opts?: { protected?: boolean }) => {
      await handleSend(dataUrl, 'image', opts)
    },
    [handleSend]
  )

  // ---- Paste image upload (Ctrl+V with image in clipboard) ------------------
  // Reads any image file from the clipboard `items` list, converts it to a
  // data URL, and sends it via the existing image-send flow.
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      // Only intercept when there's no active text input focus (so we don't
      // break paste-into-message-composer).
      const active = document.activeElement
      const inTextarea =
        active &&
        (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')
      if (inTextarea) return
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          if (file.size > 1.5 * 1024 * 1024) {
            toast.error('Image too large (max 1.5MB)')
            return
          }
          e.preventDefault()
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = reader.result as string
            void handleSendImage(dataUrl)
            toast.success('Pasted image sent')
          }
          reader.onerror = () => toast.error('Failed to read pasted image')
          reader.readAsDataURL(file)
          return
        }
      }
    },
    [handleSendImage]
  )

  // Mount the paste listener on the window whenever the chat window mounts.
  useEffect(() => {
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  // ---- Drag-and-drop image upload ------------------------------------------
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    dragDepthRef.current += 1
    setIsDragging(true)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragDepthRef.current = 0
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files || [])
      const images = files.filter((f) => f.type.startsWith('image/'))
      if (images.length === 0) {
        if (files.length > 0) {
          toast.error('Only image files are supported')
        }
        return
      }
      for (const file of images) {
        if (file.size > 1.5 * 1024 * 1024) {
          toast.error(`Image too large: ${file.name} (max 1.5MB)`)
          continue
        }
        const reader = new FileReader()
        reader.onload = () => {
          void handleSendImage(reader.result as string)
        }
        reader.onerror = () =>
          toast.error(`Failed to read ${file.name}`)
        reader.readAsDataURL(file)
      }
      toast.success(
        images.length === 1
          ? `Sent ${images[0].name}`
          : `Sent ${images.length} images`
      )
    },
    [handleSendImage]
  )

  // ---- Typing indicator ------------------------------------------------------
  const onTypingChange = useCallback(
    (typing: boolean) => {
      if (!activeConversationId || !user?.id) return
      const socket = getSocket()
      if (typing) {
        socket.emit('typing:start', {
          conversationId: activeConversationId,
          userId: user.id,
          name: user.name,
        })
      } else {
        socket.emit('typing:stop', {
          conversationId: activeConversationId,
          userId: user.id,
        })
      }
    },
    [activeConversationId, user?.id]
  )

  // ---- Mark messages read on initial load -----------------------------------
  // Capture the initial unread count BEFORE clearing it — used to show the
  // "Unread messages" separator between the last read message and the first
  // unread message. The separator stays as a visual marker even after the
  // messages are marked as read.
  const initialUnreadRef = useRef<number>(0)
  useEffect(() => {
    if (!activeConversationId || !conversation) return
    initialUnreadRef.current = conversation.unreadCount || 0
    // The GET messages endpoint already marks as read on the server.
    // We just need to update the sidebar unread count for this conversation.
    upsertConversation({
      ...conversation,
      unreadCount: 0,
    })

  }, [activeConversationId])

  // ---- Delete conversation ---------------------------------------------------
  async function handleDelete() {
    if (!activeConversationId) return
    try {
      await fetch(`/api/conversations/${activeConversationId}`, {
        method: 'DELETE',
      })
      useWaslStore.getState().removeConversation(activeConversationId)
      onBack()
      toast.success('Chat deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  async function handleCopyLast() {
    if (!messages.length) return
    const last = messages[messages.length - 1]
    await navigator.clipboard.writeText(last.content)
    toast.success('Copied to clipboard')
  }

  if (!activeConversationId || !conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center wasl-chat-pattern text-center px-6 overflow-y-auto wasl-scroll">
        <div className="bg-white/90 dark:bg-[var(--wasl-sidebar-bg)]/90 rounded-2xl px-8 py-8 shadow-lg max-w-md flex flex-col items-center gap-4 my-auto">
          <WaslLogo size={72} animated />
          <h2 className="text-xl font-semibold text-foreground">
            Welcome to Wasl
          </h2>
          <p className="text-sm text-muted-foreground">
            Select a conversation to start chatting, or tap the + button to create a new chat.
          </p>
          {/* Feature hint cards */}
          <div className="grid grid-cols-2 gap-2 w-full mt-2">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-left">
              <Lock className="w-4 h-4 text-[var(--wasl-green)] mb-1" />
              <div className="text-[11px] font-medium text-foreground">Protected messages</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Lock icon in composer</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-left">
              <Paperclip className="w-4 h-4 text-[var(--wasl-teal)] mb-1" />
              <div className="text-[11px] font-medium text-foreground">Drag & drop</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Images up to 1.5MB</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-left">
              <Sparkles className="w-4 h-4 text-amber-500 mb-1" />
              <div className="text-[11px] font-medium text-foreground">AI summary</div>
              <div className="text-[10px] text-muted-foreground leading-tight">In chat menu</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-left">
              <Search className="w-4 h-4 text-sky-500 mb-1" />
              <div className="text-[11px] font-medium text-foreground">Search</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Ctrl+K palette</div>
            </div>
          </div>
          {/* Keyboard shortcut hint */}
          <div className="flex items-center gap-2 mt-3 text-[11px] text-muted-foreground">
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/60 text-[10px] font-medium">Ctrl</kbd>
            <span>+</span>
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/60 text-[10px] font-medium">K</kbd>
            <span>to search ·</span>
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/60 text-[10px] font-medium">Ctrl</kbd>
            <span>+</span>
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/60 text-[10px] font-medium">/</kbd>
            <span>for shortcuts</span>
          </div>
        </div>
      </div>
    )
  }

  // Build message groups for date dividers
  let lastDate = ''

  return (
    <div
      className="flex-1 flex flex-col min-w-0 wasl-chat-pattern relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay — shown only while a file is being dragged over */}
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-[var(--wasl-green)]/10 backdrop-blur-sm border-2 border-dashed border-[var(--wasl-green)] rounded-lg flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-[var(--wasl-sidebar-bg)] rounded-xl px-6 py-4 shadow-lg flex items-center gap-3">
            <Paperclip className="w-6 h-6 text-[var(--wasl-green)] rotate-45" />
            <div>
              <div className="font-semibold text-foreground">
                Drop image to send
              </div>
              <div className="text-xs text-muted-foreground">
                PNG / JPG / WEBP / GIF · max 1.5MB
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Pinned message bar — shows the currently pinned message at the top
          of the chat. Clicking it scrolls to the pinned message. */}
      {messages.find((m) => m.pinned) && (() => {
        const pinned = messages.find((m) => m.pinned)!
        const pinnedSender = conversation.participants.find((p) => p.userId === pinned.senderId)?.name
        return (
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('wasl:jump-to-message', { detail: pinned.id }))
            }}
            className="wasl-pinned-bar w-full flex items-center gap-2.5 px-4 py-2 bg-[var(--wasl-green)]/5 border-b border-[var(--wasl-green)]/20 hover:bg-[var(--wasl-green)]/10 transition-colors text-left group/pin"
          >
            <Pin className="w-4 h-4 text-[var(--wasl-green)] shrink-0 rotate-45" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--wasl-green)] flex items-center gap-1.5">
                Pinned {pinnedSender && <span className="normal-case font-normal text-muted-foreground">by {pinnedSender}</span>}
              </div>
              <div className="text-xs text-foreground truncate">
                {pinned.content.slice(0, 80)}
                {pinned.content.length > 80 ? '…' : ''}
              </div>
            </div>
            <PinOff
              className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/pin:opacity-100 transition-opacity shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                handlePinMessage(pinned)
              }}
            />
          </button>
        )
      })()}
      {/* Chat header */}
      <div className="bg-[var(--wasl-sidebar-bg)] px-3 sm:px-4 py-2.5 flex items-center gap-3 border-b border-border shadow-sm">
        <button
          onClick={onBack}
          className="md:hidden p-2 -ml-1 rounded-full hover:bg-muted text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          onClick={onOpenInfo}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          {conversation.isGroup ? (
            <WaslGroupAvatar
              name={conversation.name}
              participants={conversation.participants.map((p) => ({
                name: p.name,
                avatar: p.avatar,
                avatarColor: p.avatarColor,
              }))}
              size={42}
            />
          ) : (
            <WaslAvatar
              name={conversation.name}
              src={conversation.avatar}
              color={conversation.avatarColor}
              size={42}
              online={isOnline}
              showStatus
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground truncate">
              {conversation.name}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {socketStatus === 'reconnecting' || socketStatus === 'disconnected' ? (
                <span className="inline-flex items-center gap-1 text-amber-500 dark:text-amber-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {socketStatus === 'reconnecting' ? 'Reconnecting…' : 'Offline'}
                </span>
              ) : typingUsers.length > 0 ? (
                <span className="text-[var(--wasl-green)] font-medium">
                  typing…
                </span>
              ) : conversation.isGroup ? (
                `${conversation.participants.map((p) => p.name).join(', ')}`
              ) : (
                formatLastSeen(otherUser?.lastSeen || new Date().toISOString(), isOnline)
              )}
            </div>
          </div>
        </button>
        {/* Socket connection pill — only shown when the socket is not healthy */}
        {(socketStatus === 'reconnecting' || socketStatus === 'disconnected') && (
          <span
            title={
              socketStatus === 'reconnecting'
                ? 'Real-time connection lost — Wasl is reconnecting…'
                : 'You are offline. Messages will be sent when you reconnect.'
            }
            className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300 mr-1"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            {socketStatus === 'reconnecting' ? 'Reconnecting' : 'Offline'}
          </span>
        )}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="hidden sm:flex" onClick={() => toast.info('Video call is not available in this demo')}>
            <Video className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden sm:flex" onClick={() => toast.info('Voice call is not available in this demo')}>
            <Phone className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)} title="Search messages">
            <Search className="w-5 h-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpenInfo}>
                <Info className="w-4 h-4 mr-2" /> Contact info
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSummaryOpen(true)}>
                <Sparkles className="w-4 h-4 mr-2" /> AI summary
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActionItemsOpen(true)}>
                <ListChecks className="w-4 h-4 mr-2" /> Action items
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setToneOpen(true)}>
                <Wand2 className="w-4 h-4 mr-2" /> Tone adjuster
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyLast}>
                <Copy className="w-4 h-4 mr-2" /> Copy last message
              </DropdownMenuItem>
              {conversation.isGroup && (
                <DropdownMenuItem onClick={() => toast.info('Group members')}>
                  <Users className="w-4 h-4 mr-2" /> Group members
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setAppLockOpen(true)}>
                <Lock className="w-4 h-4 mr-2" /> App lock
              </DropdownMenuItem>
              <DropdownMenuItem onClick={async () => {
                const setting = await fetch(`/api/disappearing?conversationId=${activeConversationId}`).then(r => r.json())
                const enabled = !setting.setting?.enabled
                await fetch('/api/disappearing', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ conversationId: activeConversationId, enabled, duration: 86400 }),
                })
                toast.success(enabled ? 'Disappearing messages ON (24h)' : 'Disappearing messages OFF')
              }}>
                <Timer className="w-4 h-4 mr-2" /> Disappearing messages
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="w-4 h-4 mr-2" /> Delete chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto wasl-scroll px-2 sm:px-4 py-4 max-w-4xl w-full mx-auto"
      >
        {loading && messages.length === 0 ? (
          // Skeleton placeholders while the first batch of messages loads.
          // Alternates between incoming and outgoing so the layout matches
          // what users will see once messages render.
          <div className="space-y-3">
            <div className="flex justify-center mb-2">
              <Skeleton className="h-5 w-24" />
            </div>
            <MessageSkeleton />
            <MessageSkeleton mine />
            <MessageSkeleton />
            <MessageSkeleton mine />
            <MessageSkeleton />
            <MessageSkeleton mine />
          </div>
        ) : (
          <>
            {loadingMore && (
              <div className="text-center text-xs text-muted-foreground py-2 flex items-center justify-center gap-2">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-2 w-2 rounded-full" />
                <span className="ml-2">Loading older messages…</span>
              </div>
            )}
            {messages.map((m, idx) => {
              const date = formatDateDivider(m.createdAt)
              const showDate = date !== lastDate
              lastDate = date
              const senderName = conversation.participants.find(
                (p) => p.userId === m.senderId
              )?.name
              const replyToMsg = m.replyToId
                ? messages.find((mm) => mm.id === m.replyToId)
                : null
              // Compute the index of the first unread message. The separator
              // appears before that message (only if there are unread messages
              // and they're not the very first message in the visible batch).
              const unreadBoundary = messages.length - (initialUnreadRef.current || 0)
              const showUnreadSeparator =
                initialUnreadRef.current > 0 &&
                idx === unreadBoundary &&
                unreadBoundary > 0
              return (
                <div
                  key={m.id}
                  data-message-id={m.id}
                  className="wasl-message-wrapper"
                >
                  {showDate && (
                    <div className="flex justify-center my-3">
                      <div className="wasl-date-pill text-xs px-3 py-1 rounded-lg font-medium">
                        {date}
                      </div>
                    </div>
                  )}
                  {showUnreadSeparator && (
                    <div className="wasl-unread-separator flex items-center gap-3 my-3 select-none">
                      <div className="flex-1 h-px bg-[var(--wasl-green)]/40" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--wasl-green)] px-2">
                        Unread messages
                      </span>
                      <div className="flex-1 h-px bg-[var(--wasl-green)]/40" />
                    </div>
                  )}
                  <div className="group mb-1.5">
                    <MessageBubble
                      message={m}
                      senderName={senderName}
                      isGroup={conversation.isGroup}
                      replyTo={replyToMsg}
                      onReact={(emoji) => handleReact(m.id, emoji)}
                      onReply={() => setReplyTo(m)}
                      onStar={() => handleStar(m.id)}
                      onCopy={() => handleCopyMessage(m)}
                      onDelete={() => handleDeleteMessage(m.id)}
                      onEdit={() => handleEditMessage(m)}
                      onForward={() => handleForwardMessage(m)}
                      onPin={() => handlePinMessage(m)}
                      starred={m.starred}
                      reactions={m.reactions}
                      currentUserId={user?.id}
                    />
                  </div>
                </div>
              )
            })}
            {/* Typing indicator */}
            {typingUsers.length > 0 && (
              <div className="flex justify-start mb-2">
                <div className="wasl-bubble-in px-3 py-2 shadow-sm flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground mr-1">
                    {conversation.isGroup ? typingUsers[0] : ''} typing
                  </span>
                  <span className="wasl-typing-dot w-1.5 h-1.5 bg-muted-foreground rounded-full inline-block" />
                  <span className="wasl-typing-dot w-1.5 h-1.5 bg-muted-foreground rounded-full inline-block" />
                  <span className="wasl-typing-dot w-1.5 h-1.5 bg-muted-foreground rounded-full inline-block" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}

        {/* Scroll-to-bottom button */}
        {showScrollBtn && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="wasl-scroll-btn sticky bottom-4 ml-auto mr-2 w-10 h-10 rounded-full bg-white dark:bg-[var(--wasl-sidebar-bg)] shadow-lg border border-border flex items-center justify-center text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] hover:bg-muted transition-colors z-10"
            title="Scroll to latest"
            aria-label="Scroll to latest"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Smart reply chips + Input */}
      <SmartReplyChips conversationId={activeConversationId} />
      <MessageInput
        conversationId={activeConversationId}
        onSend={handleSend}
        onTypingChange={onTypingChange}
        onSendImage={handleSendImage}
        onOpenCommit={() => setCommitOpen(true)}
        canCommit={!conversation.isGroup && !!otherUser}
        onOpenPoll={() => setPollOpen(true)}
        onSchedule={(content) => { setScheduleContent(content); setScheduleOpen(true) }}
      />

      {/* New Commit dialog (Cirkle-inspired) */}
      <NewCommitDialog
        open={commitOpen}
        onOpenChange={setCommitOpen}
        conversationId={activeConversationId}
        counterpartyId={otherUser?.userId || null}
        counterpartyName={otherUser?.name}
      />

      {/* New Poll dialog (Cirkle-inspired chat-poll) */}
      <NewPollDialog
        open={pollOpen}
        onOpenChange={setPollOpen}
        conversationId={activeConversationId}
      />

      {/* In-chat search dialog */}
      <ChatSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        conversationId={activeConversationId}
        conversationName={conversation.name}
        conversationAvatar={conversation.avatar}
        conversationAvatarColor={conversation.avatarColor}
      />

      {/* Schedule message dialog */}
      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        conversationId={activeConversationId}
        content={scheduleContent}
      />

      {/* AI chat summary dialog */}
      <ChatSummaryDialog
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        conversationId={activeConversationId}
      />

      {/* App lock dialog */}
      <AppLockDialog
        open={appLockOpen}
        onOpenChange={setAppLockOpen}
      />

      {/* AI action items dialog */}
      <ActionItemsDialog
        open={actionItemsOpen}
        onOpenChange={setActionItemsOpen}
        conversationId={activeConversationId}
      />

      {/* AI tone adjuster dialog */}
      <ToneAdjusterDialog
        open={toneOpen}
        onOpenChange={setToneOpen}
        initialContent=""
        onApply={() => {}}
      />

      {/* Command palette (Ctrl+K) */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />

      {/* Forward dialog (multi-select) */}
      <ForwardDialog
        open={forwardOpen}
        onOpenChange={setForwardOpen}
        messageId={forwardMessage?.id || null}
        messageContent={forwardMessage?.content || ''}
      />

      {/* Delete message dialog (delete for me / for everyone) */}
      <DeleteMessageDialog
        open={!!deleteMessage}
        onOpenChange={(v) => {
          if (!v) setDeleteMessage(null)
        }}
        messageId={deleteMessage?.id || null}
        messageContent={deleteMessage?.content || ''}
        isOwnMessage={deleteMessage?.senderId === user?.id}
        canDeleteForEveryone={
          !!deleteMessage &&
          deleteMessage.senderId === user?.id &&
          (Date.now() - new Date(deleteMessage.createdAt).getTime()) / 60000 < 60
        }
      />
    </div>
  )
}
