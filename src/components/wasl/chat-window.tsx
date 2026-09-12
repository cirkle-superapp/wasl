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
} from 'lucide-react'
import { WaslAvatar } from './wasl-avatar'
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
        // Show typing
        setTimeout(() => {
          getSocket().emit('typing:start', {
            conversationId,
            userId: otherUser.userId,
            name: otherUser.name,
          })
        }, 600)
        setBotReplying(true)
        const delay = 1200 + Math.min(content.length * 30, 1800)
        setTimeout(async () => {
          getSocket().emit('typing:stop', {
            conversationId,
            userId: otherUser.userId,
          })
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

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      if (!activeConversationId) return
      if (!confirm('Delete this message? This cannot be undone.')) return
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
        // Update locally
        useWaslStore.getState().updateMessage(activeConversationId, m.id, { content: newContent.trim() })
        getSocket().emit('message:reacted', { conversationId: activeConversationId, messageId: m.id })
        toast.success('Message edited')
      } catch {
        toast.error('Failed to edit')
      }
    },
    [activeConversationId]
  )

  // ---- Forward message -----------------------------------------------------
  const handleForwardMessage = useCallback(
    async (m: ChatMessage) => {
      const target = prompt('Enter conversation ID to forward to (or type a name):')
      if (!target) return
      // Try to find a conversation by name
      const conv = useWaslStore.getState().conversations.find(
        (c) => c.name.toLowerCase().includes(target.toLowerCase())
      )
      if (!conv) {
        toast.error('Conversation not found')
        return
      }
      try {
        const res = await fetch(`/api/messages/${m.id}/forward`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetConversationId: conv.id }),
        })
        if (res.ok) {
          const data = await res.json().catch(() => ({}))
          if (data.protected) {
            toast.success(`Forwarded to ${conv.name} (protected)`)
          } else {
            toast.success(`Forwarded to ${conv.name}`)
          }
        } else if (res.status === 403) {
          const err = await res.json().catch(() => null)
          toast.error(err?.error || 'This message is protected by the sender. You cannot forward it.', {
            description: 'Enable "Always allow screenshots & forwarding" in Settings → Privacy to override.',
            duration: 6000,
          })
        } else {
          toast.error('Failed to forward')
        }
      } catch {
        toast.error('Network error')
      }
    },
    []
  )

  const handleSendImage = useCallback(
    async (dataUrl: string, opts?: { protected?: boolean }) => {
      await handleSend(dataUrl, 'image', opts)
    },
    [handleSend]
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
  useEffect(() => {
    if (!activeConversationId || !conversation) return
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
      <div className="flex-1 flex flex-col items-center justify-center wasl-chat-pattern text-center px-6">
        <div className="bg-white/90 dark:bg-[var(--wasl-sidebar-bg)]/90 rounded-2xl px-8 py-8 shadow-lg max-w-md flex flex-col items-center gap-4">
          <WaslLogo size={72} animated />
          <h2 className="text-xl font-semibold text-foreground">
            Welcome to Wasl
          </h2>
          <p className="text-sm text-muted-foreground">
            Select a conversation to start chatting, or tap the + button to create a new chat.
          </p>
        </div>
      </div>
    )
  }

  // Build message groups for date dividers
  let lastDate = ''

  return (
    <div className="flex-1 flex flex-col min-w-0 wasl-chat-pattern">
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
          <WaslAvatar
            name={conversation.name}
            src={conversation.avatar}
            color={conversation.avatarColor}
            size={42}
            online={isOnline}
            showStatus={!conversation.isGroup}
          />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground truncate">
              {conversation.name}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {typingUsers.length > 0 ? (
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
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Loading messages…
          </div>
        ) : (
          <>
            {loadingMore && (
              <div className="text-center text-xs text-muted-foreground py-2">
                Loading older messages…
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
              return (
                <div key={m.id}>
                  {showDate && (
                    <div className="flex justify-center my-3">
                      <div className="wasl-date-pill text-xs px-3 py-1 rounded-lg font-medium">
                        {date}
                      </div>
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
    </div>
  )
}
