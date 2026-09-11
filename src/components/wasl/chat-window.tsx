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
} from 'lucide-react'
import { WaslAvatar } from './wasl-avatar'
import { MessageBubble } from './message-bubble'
import { MessageInput } from './message-input'
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
  } = useWaslStore()

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

    socket.on('message:received', onMessageReceived)
    socket.on('message:status', onStatus)

    return () => {
      socket.off('message:received', onMessageReceived)
      socket.off('message:status', onStatus)
    }
  }, [activeConversationId, user?.id, addMessage, updateMessageStatus])

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
    // Load more when near top
    if (el.scrollTop < 40 && hasMore && !loadingMore && !loading) {
      void loadMore()
    }
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
    async (content: string, type: string = 'text') => {
      if (!activeConversationId || !user?.id) return
      const res = await fetch(
        `/api/conversations/${activeConversationId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, type, replyToId: replyTo?.id }),
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
    },
    [activeConversationId, user?.id, replyTo, addMessage, setReplyTo, conversation, upsertConversation]
  )

  const handleSendImage = useCallback(
    async (dataUrl: string) => {
      await handleSend(dataUrl, 'image')
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
        <div className="bg-white/90 dark:bg-[var(--wasl-sidebar-bg)]/90 rounded-2xl px-8 py-6 shadow-lg max-w-md">
          <h2 className="text-xl font-semibold mb-1 text-foreground">
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
          <Button variant="ghost" size="icon" onClick={onOpenInfo}>
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
              <DropdownMenuItem onClick={handleCopyLast}>
                <Copy className="w-4 h-4 mr-2" /> Copy last message
              </DropdownMenuItem>
              {conversation.isGroup && (
                <DropdownMenuItem onClick={() => toast.info('Group members')}>
                  <Users className="w-4 h-4 mr-2" /> Group members
                </DropdownMenuItem>
              )}
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
                    />
                    {!m.type.startsWith('system') && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity text-right text-[10px] text-muted-foreground pr-1 hidden sm:block">
                        {formatChatTimestamp(m.createdAt)}
                      </div>
                    )}
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
      </div>

      {/* Input */}
      <MessageInput
        conversationId={activeConversationId}
        onSend={handleSend}
        onTypingChange={onTypingChange}
        onSendImage={handleSendImage}
      />
    </div>
  )
}
