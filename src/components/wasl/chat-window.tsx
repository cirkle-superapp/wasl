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
import { EditMessageDialog } from './edit-message-dialog'
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
    bumpMessageReadCount,
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
    bookmarkedMessageIds,
    setBookmarked,
    startCall,
    activeCall,
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
  // Chat wallpaper — user-selectable from contact info panel (stored in localStorage)
  const [wallpaperClass, setWallpaperClass] = useState<string>(() => {
    try { return localStorage.getItem('wasl-chat-wallpaper') || 'wasl-chat-pattern' } catch { return 'wasl-chat-pattern' }
  })
  // Approved businesses owned by the user — used for the "send as business" selector
  const [businesses, setBusinesses] = useState<Array<{ id: string; name: string; avatarColor?: string | null }>>([])
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  // Tracks how many NEW messages have arrived while the user was scrolled up
  // (away from the bottom). Drives a badge on the scroll-to-bottom button.
  const [unreadSinceScrollUp, setUnreadSinceScrollUp] = useState(0)
  const [botReplying, setBotReplying] = useState(false)
  // Drop zone state — shown when a file is dragged over the chat window
  const [isDragging, setIsDragging] = useState(false)
  // True while one or more drag-dropped files are uploading to /api/upload.
  // Drives a small floating "Uploading…" chip + disables further drops.
  const [isUploading, setIsUploading] = useState(false)
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

  // Whether the current user is an admin of the active group conversation.
  // Used to gate the admin-pinning flow (admins can pin/unpin ANY message in
  // a group, not just their own). 1-on-1 conversations have no admin role —
  // only the message sender can pin there.
  const isGroupAdmin = !!conversation?.isGroup && !!conversation.participants.find(
    (p) => p.userId === user?.id && p.role === 'admin'
  )

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

      // Emit READ status for messages from others that weren't already 'read'.
      // The GET endpoint already marked them as 'read' on the server (it
      // updates `lastReadAt` + sets message.status='read' before returning),
      // but the response carries the OLD status (the findMany ran before the
      // updateMany), so we filter for "not yet read" here to avoid
      // double-counting on subsequent loads (e.g. when the user scrolls up to
      // load older pages). This socket emit is what drives the sender's
      // "Read by all" indicator in real-time (Task 37-b) — without it, the
      // sender would only see the updated read state on their next refetch.
      const othersUnreadMsgIds = msgs
        .filter((m) => m.senderId !== user?.id && m.status !== 'read')
        .map((m) => m.id)
      if (othersUnreadMsgIds.length > 0) {
        getSocket().emit('message:status', {
          conversationId: activeConversationId,
          messageIds: othersUnreadMsgIds,
          status: 'read',
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

      // If the user is scrolled up (away from the bottom), increment the
      // "new messages" badge on the scroll-to-bottom button so they know
      // there's something new to read. We DON'T auto-scroll because the
      // user deliberately scrolled up to read older messages.
      if (!wasNearBottomRef.current) {
        setUnreadSinceScrollUp((n) => n + 1)
      }

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
      // When another participant marks messages as READ, also incrementally
      // update the per-recipient read summary (readCount / readByEveryone) on
      // the affected outgoing messages. The server doesn't push the full
      // per-recipient breakdown over the socket — we derive it locally by
      // treating each 'read' event from a distinct participant as +1 read.
      // `bumpMessageReadCount` is a no-op for messages without `totalRecipients`
      // (incoming messages / older state), and clamps to the total so a repeat
      // 'read' event from the same participant doesn't double-count.
      if (payload.status === 'read' && payload.byUserId !== user?.id) {
        bumpMessageReadCount(activeConversationId, payload.messageIds)
      }
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
  }, [activeConversationId, user?.id, addMessage, updateMessageStatus, bumpMessageReadCount, upsertCommit, removeMessage])

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
    setUnreadSinceScrollUp(0)
  }

  // ---- Scroll to a specific message (by ID) ---------------------------------
  // Used by the "jump to message" feature from the StarredMessagesDialog
  // and the ChatSearchDialog. Listens for a custom window event so any
  // component can trigger it.
  useEffect(() => {
    function onJumpToMessage(e: Event) {
      const messageId = (e as CustomEvent<string>).detail
      if (!messageId) return
      // Prefer the scroll container scope, but fall back to a document-wide
      // search if the ref isn't attached yet (e.g. during a re-render cycle)
      // or if the message lives outside the current scroll container.
      const target =
        (scrollRef.current?.querySelector(
          `[data-message-id="${messageId}"]`
        ) as HTMLElement | null) ||
        (document.querySelector(
          `[data-message-id="${messageId}"]`
        ) as HTMLElement | null)
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
    // "Delete for me" — local-only hide. Same UI removal as a full delete,
    // but we deliberately do NOT broadcast via socket: other participants
    // should still see the message. The DeletedForMe row on the server keeps
    // it filtered out of this user's future message fetches.
    function onMessageHiddenForMe(e: Event) {
      const messageId = (e as CustomEvent<string>).detail
      if (!messageId || !activeConversationId) return
      removeMessage(activeConversationId, messageId)
    }
    window.addEventListener('wasl:jump-to-message', onJumpToMessage as EventListener)
    window.addEventListener('wasl:message-deleted', onMessageDeleted as EventListener)
    window.addEventListener('wasl:message-hidden-for-me', onMessageHiddenForMe as EventListener)
    return () => {
      window.removeEventListener('wasl:jump-to-message', onJumpToMessage as EventListener)
      window.removeEventListener('wasl:message-deleted', onMessageDeleted as EventListener)
      window.removeEventListener('wasl:message-hidden-for-me', onMessageHiddenForMe as EventListener)
    }
  }, [activeConversationId, removeMessage])

  // Listen for wallpaper changes from the contact info panel
  useEffect(() => {
    function onWallpaperChange(e: Event) {
      const detail = (e as CustomEvent<string>).detail
      if (detail) setWallpaperClass(detail)
    }
    window.addEventListener('wasl:wallpaper-change', onWallpaperChange as EventListener)
    return () => window.removeEventListener('wasl:wallpaper-change', onWallpaperChange as EventListener)
  }, [])

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
    async (content: string, type: string = 'text', opts?: { protected?: boolean; businessId?: string }) => {
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
            businessId: opts?.businessId,
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
        otherUser.phone &&
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

  // ---- Bookmark (Save for later) -------------------------------------------
  // Toggles the bookmark state for a message. Optimistically updates the
  // `bookmarkedMessageIds` set in the store, then fires the API request.
  // The store always replaces the Set reference (instead of mutating) so
  // consumers subscribed to the set re-render correctly.
  const handleBookmark = useCallback(
    async (messageId: string) => {
      const isCurrentlyBookmarked = useWaslStore
        .getState()
        .bookmarkedMessageIds.has(messageId)
      // Optimistic update
      setBookmarked(messageId, !isCurrentlyBookmarked)
      try {
        if (isCurrentlyBookmarked) {
          // To DELETE a bookmark we need its row id. We don't store bookmark
          // ids in the store (only message ids), so re-fetch the list and
          // find the row matching this message.
          const res = await fetch('/api/bookmarks', { cache: 'no-store' })
          if (res.ok) {
            const data = await res.json()
            const found = (data.bookmarks || []).find(
              (b: { message: { id: string }; id: string }) =>
                b.message.id === messageId
            )
            if (found?.id) {
              await fetch(`/api/bookmarks/${found.id}`, { method: 'DELETE' })
              toast.success('Bookmark removed')
            } else {
              // Already removed server-side — reset store to be safe.
              setBookmarked(messageId, false)
            }
          }
        } else {
          const res = await fetch('/api/bookmarks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId }),
          })
          if (res.status === 409) {
            // Already bookmarked server-side — make sure store reflects that.
            setBookmarked(messageId, true)
          }
          if (res.ok || res.status === 409) {
            toast.success('Message bookmarked')
          } else {
            const data = await res.json().catch(() => null)
            toast.error(data?.error || 'Failed to bookmark')
            setBookmarked(messageId, false)
          }
        }
      } catch (e) {
        console.error(e)
        // Revert optimistic update on failure
        setBookmarked(messageId, isCurrentlyBookmarked)
        toast.error('Network error')
      }
    },
    [setBookmarked]
  )

  const handleCopyMessage = useCallback(async (m: ChatMessage) => {
    try {
      // Copy with markdown formatting preserved (bold, italic, code, links)
      const content = m.content || ''
      await navigator.clipboard.writeText(content)
      toast.success('Copied to clipboard', {
        description: content.includes('**') || content.includes('*') || content.includes('`')
          ? 'Markdown formatting preserved'
          : undefined,
      })
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
  // Opens the EditMessageDialog (replaces the old `prompt()` flow). The
  // dialog enforces the 15-minute edit window client-side AND the server
  // rejects the PATCH past that window with a 403, so we get a clean error
  // toast if the window elapses while the dialog is open.
  const [editMessage, setEditMessage] = useState<ChatMessage | null>(null)
  const handleEditMessage = useCallback(
    (m: ChatMessage) => {
      setEditMessage(m)
    },
    []
  )
  const handleEditSaved = useCallback(
    (messageId: string, newContent: string) => {
      if (!activeConversationId) return
      // Update locally — set both the new content AND the edited flag so
      // the "edited" indicator appears immediately.
      useWaslStore.getState().updateMessage(activeConversationId, messageId, {
        content: newContent,
        edited: true,
      })
      // Broadcast so other clients refetch the message. Reuses the existing
      // `message:reacted` channel that the chat-window already listens on for
      // reaction / pin / star / bookmark updates.
      getSocket().emit('message:reacted', {
        conversationId: activeConversationId,
        messageId,
      })
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

  // ---- Voice / Video call (Cirkle-inspired WebRTC) --------------------------
  // Initiates an outgoing 1:1 call. Group calls are not yet supported — the
  // button is hidden for group conversations. If a call is already in
  // progress, clicking again focuses the existing overlay (no-op).
  const handleStartCall = useCallback(
    (callType: 'audio' | 'video') => {
      if (!conversation || !user) {
        toast.error('Conversation or user missing — cannot start call')
        return
      }
      if (conversation.isGroup) {
        toast.info('Group calls are coming soon — start a 1-on-1 chat to call.')
        return
      }
      const peer = conversation.participants.find((p) => p.userId !== user.id)
      if (!peer) {
        toast.error('Could not find the other participant')
        return
      }
      if (activeCall) {
        // A call is already in progress — don't start a second one.
        toast.info('A call is already in progress')
        return
      }
      startCall({
        conversationId: conversation.id,
        peerUserId: peer.userId,
        peerName: peer.name,
        peerAvatarColor: peer.avatarColor,
        callType,
        direction: 'outgoing',
        startedAt: Date.now(),
      })
    },
    [conversation, user, activeCall, startCall]
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

  // ---- Drag-and-drop file upload -------------------------------------------
  // Accepts images (<=1.5MB), PDF / document / audio (<=5MB). Routes every
  // dropped file through the /api/upload endpoint (which returns a
  // `{ url, type, name, size }` payload), then sends a chat message with the
  // returned URL as the content.
  //
  // For PDF / document / audio we also embed `name` + `size` into the message
  // content as a small JSON blob so the message-bubble can render a proper
  // file-attachment card with the original filename + human-readable size.
  // Image messages store the URL verbatim (the existing `<img>` renderer in
  // message-bubble handles both data URLs and `/uploads/...` URLs).
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
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragDepthRef.current = 0
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files || [])
      if (files.length === 0) return
      if (isUploading) return // already busy — ignore concurrent drops

      setIsUploading(true)
      let sentCount = 0
      try {
        for (const file of files) {
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
              type: 'image' | 'pdf' | 'document' | 'audio'
              name: string
              size: number
            } = await res.json()
            // Build the message content. Images store the URL as-is so the
            // existing <img> renderer keeps working. Other types embed
            // name + size as JSON so the bubble can render a file card.
            const content =
              data.type === 'image'
                ? data.url
                : JSON.stringify({
                    url: data.url,
                    name: data.name,
                    size: data.size,
                  })
            await handleSend(content, data.type)
            sentCount += 1
            toast.success(`Sent ${file.name}`, { id: toastId })
          } catch (err) {
            const msg = err instanceof Error ? err.message : `Failed to upload ${file.name}`
            toast.error(msg, { id: toastId })
          }
        }
        if (sentCount > 1) {
          toast.success(`Sent ${sentCount} files`)
        }
      } finally {
        setIsUploading(false)
      }
    },
    [handleSend, isUploading]
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

  // ---- Fetch user's approved businesses (for "send as business" selector) ---
  useEffect(() => {
    fetch('/api/business')
      .then((r) => r.json())
      .then((data) => {
        const approved = (data.businesses || []).filter(
          (b: any) => b.status === 'approved'
        )
        setBusinesses(
          approved.map((b: any) => ({
            id: b.id,
            name: b.name,
            avatarColor: b.avatarColor,
          }))
        )
      })
      .catch(() => {})
  }, [])

  // ---- Mark messages read on initial load -----------------------------------
  // Capture the initial unread count BEFORE clearing it — used to show the
  // "Unread messages" separator between the last read message and the first
  // unread message. The separator stays as a visual marker even after the
  // messages are marked as read.
  const initialUnreadRef = useRef<number>(0)
  useEffect(() => {
    if (!activeConversationId || !conversation) return
    initialUnreadRef.current = conversation.unreadCount || 0
    // Reset the "new messages since scroll-up" counter when switching chats.
    setUnreadSinceScrollUp(0)
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
    const conversationCount = conversations.length
    const groupCount = conversations.filter(c => c.isGroup).length
    const unreadTotal = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
    return (
      <div className={cn('flex-1 flex flex-col items-center justify-center text-center px-6 overflow-y-auto wasl-scroll', wallpaperClass)}>
        <div className="wasl-anim-spring-in bg-white/90 dark:bg-[var(--wasl-sidebar-bg)]/90 rounded-2xl px-8 py-8 shadow-lg max-w-md flex flex-col items-center gap-4 my-auto">
          <div className="wasl-empty-orb" style={{ isolation: 'isolate' }}>
            <WaslLogo size={72} animated />
          </div>
          <h2 className="text-xl font-semibold text-foreground">
            Welcome to Wasl
          </h2>
          <p className="text-sm text-muted-foreground">
            {conversationCount > 0
              ? `You have ${conversationCount} conversation${conversationCount === 1 ? '' : 's'}. Select one to start chatting.`
              : 'Tap the + button to create a new chat.'}
          </p>
          {/* Stats row */}
          {conversationCount > 0 && (
            <div className="flex items-center justify-center gap-4 w-full py-2">
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold text-[var(--wasl-green)]">{conversationCount}</span>
                <span className="text-[10px] text-muted-foreground">Chats</span>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]">{groupCount}</span>
                <span className="text-[10px] text-muted-foreground">Groups</span>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold text-amber-500">{unreadTotal}</span>
                <span className="text-[10px] text-muted-foreground">Unread</span>
              </div>
            </div>
          )}
          {/* Feature hint cards */}
          <div className="grid grid-cols-2 gap-2 w-full mt-2">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-left hover:border-[var(--wasl-green)]/30 transition-colors">
              <Lock className="w-4 h-4 text-[var(--wasl-green)] mb-1" />
              <div className="text-[11px] font-medium text-foreground">Protected messages</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Lock icon in composer</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-left hover:border-[var(--wasl-teal)]/30 transition-colors">
              <Paperclip className="w-4 h-4 text-[var(--wasl-teal)] mb-1" />
              <div className="text-[11px] font-medium text-foreground">Drag & drop</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Images, PDF, docs, audio</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-left hover:border-amber-500/30 transition-colors">
              <Sparkles className="w-4 h-4 text-amber-500 mb-1" />
              <div className="text-[11px] font-medium text-foreground">AI powered</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Summary, tone, replies</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-left hover:border-sky-500/30 transition-colors">
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
      className={cn('flex-1 flex flex-col min-w-0 relative', wallpaperClass)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay — shown only while a file is being dragged over */}
      {isDragging && (
        <div className="wasl-glass-strong wasl-anim-scale-in absolute inset-0 z-40 border-2 border-dashed border-[var(--wasl-green)] rounded-lg flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-[var(--wasl-sidebar-bg)] rounded-xl px-6 py-4 shadow-lg flex items-center gap-3">
            <Paperclip className="w-6 h-6 text-[var(--wasl-green)] rotate-45" />
            <div>
              <div className="font-semibold text-foreground">
                Drop file to send
              </div>
              <div className="text-xs text-muted-foreground">
                Image · PDF · Document · Audio · max 5MB
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Upload-in-progress chip — shown while a drag-dropped file is being
          POSTed to /api/upload. Mirrors the drop overlay's bottom-center area
          but is a small floating badge so it doesn't block the chat. */}
      {isUploading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-white dark:bg-[var(--wasl-sidebar-bg)] rounded-full shadow-lg border border-border px-4 py-2">
          <span className="w-3 h-3 rounded-full border-2 border-[var(--wasl-green)] border-t-transparent animate-spin" />
          <span className="text-xs font-medium text-foreground">Uploading…</span>
        </div>
      )}
      {/* Pinned message bar — shows the currently pinned message at the top
          of the chat. Clicking it scrolls to the pinned message. The "Unpin"
          button is only visible to the message sender and (in groups) to
          admins — non-admins viewing someone else's message cannot unpin. */}
      {messages.find((m) => m.pinned) && (() => {
        const pinned = messages.find((m) => m.pinned)!
        const pinnedSender = conversation.participants.find((p) => p.userId === pinned.senderId)?.name
        // Mirror the API's authorization matrix: sender OR (in a group) admin.
        const canUnpin = pinned.senderId === user?.id || isGroupAdmin
        return (
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('wasl:jump-to-message', { detail: pinned.id }))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                window.dispatchEvent(new CustomEvent('wasl:jump-to-message', { detail: pinned.id }))
              }
            }}
            className="wasl-pinned-bar wasl-glass-soft w-full flex items-center gap-2.5 px-4 py-2 border-b border-[var(--wasl-green)]/20 hover:bg-[var(--wasl-green)]/10 transition-colors text-left group/pin cursor-pointer"
            style={{ backgroundColor: 'color-mix(in oklab, var(--wasl-green) 8%, color-mix(in oklab, var(--background) 60%, transparent))' }}
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
            {canUnpin && (
              <button
                type="button"
                title="Unpin message"
                className="inline-flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wasl-green)]/40"
                onClick={(e) => {
                  e.stopPropagation()
                  void handlePinMessage(pinned)
                }}
              >
                <PinOff className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )
      })()}
      {/* Chat header */}
      <div className="wasl-glass-soft px-3 sm:px-4 py-2.5 flex items-center gap-3 border-b border-border" style={{ boxShadow: 'var(--wasl-shadow-sm)' }}>
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
              src={conversation.avatar}
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
                <span className="text-[var(--wasl-green)] font-medium inline-flex items-center gap-1">
                  <span className="inline-flex items-center gap-1" style={{ filter: 'drop-shadow(0 0 4px color-mix(in oklab, var(--wasl-green) 40%, transparent))' }}>
                    <span className="wasl-typing-dot w-1 h-1 bg-[var(--wasl-green)] rounded-full inline-block" />
                    <span className="wasl-typing-dot w-1 h-1 bg-[var(--wasl-green)] rounded-full inline-block" />
                    <span className="wasl-typing-dot w-1 h-1 bg-[var(--wasl-green)] rounded-full inline-block" />
                  </span>
                  <span className="ml-0.5">{conversation.isGroup ? `${typingUsers[0]} is typing…` : 'typing…'}</span>
                </span>
              ) : !conversation.isGroup && isOnline ? (
                <span className="inline-flex items-center gap-1 text-[var(--wasl-green)] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--wasl-green)] inline-block wasl-online-dot" />
                  online
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
          {!conversation?.isGroup && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="flex"
                onClick={() => handleStartCall('video')}
                title="Video call"
                aria-label="Start video call"
                disabled={!!activeCall}
              >
                <Video className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="flex"
                onClick={() => handleStartCall('audio')}
                title="Voice call"
                aria-label="Start voice call"
                disabled={!!activeCall}
              >
                <Phone className="w-5 h-5" />
              </Button>
            </>
          )}
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
              const senderName = m.senderLabel || conversation.participants.find(
                (p) => p.userId === m.senderId
              )?.name
              // Sender's @username (for the portal-aware "@username · Real Name"
              // bubble header). Resolved from the conversation's participants.
              // For business-as messages (senderLabel set), the username is
              // hidden by the SenderHeader component.
              const senderUsername = conversation.participants.find(
                (p) => p.userId === m.senderId
              )?.username
              const replyToMsg = m.replyToId
                ? messages.find((mm) => mm.id === m.replyToId)
                : null
              // Resolve the display name of the original sender so the reply
              // quote inside the bubble can show "Amira Hassan" instead of the
              // generic "Replied to" placeholder. Falls back to undefined
              // (MessageBubble handles the missing-name case).
              const replyToSenderName = replyToMsg
                ? conversation.participants.find(
                    (p) => p.userId === replyToMsg.senderId
                  )?.name
                : undefined
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
                  className={`wasl-message-wrapper ${m.senderId === user?.id ? 'wasl-bubble-enter-right' : 'wasl-bubble-enter-left'}`}
                  title={new Date(m.createdAt).toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                >
                  {showDate && (
                    <div className="flex justify-center my-3 sticky top-2 z-10">
                      <div className="wasl-date-pill">
                        {date}
                      </div>
                    </div>
                  )}
                  {showUnreadSeparator && (
                    <div className="wasl-unread-separator flex justify-center my-3 select-none">
                      <span className="wasl-glass-soft border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full">
                        Unread messages
                      </span>
                    </div>
                  )}
                  <div className="group mb-1.5">
                    <MessageBubble
                      message={m}
                      senderName={senderName}
                      senderUsername={senderUsername}
                      isGroup={conversation.isGroup}
                      replyTo={replyToMsg}
                      replyToSenderName={replyToSenderName}
                      onReact={(emoji) => handleReact(m.id, emoji)}
                      onReply={() => setReplyTo(m)}
                      onStar={() => handleStar(m.id)}
                      onBookmark={() => handleBookmark(m.id)}
                      onCopy={() => handleCopyMessage(m)}
                      onDelete={() => handleDeleteMessage(m.id)}
                      onEdit={() => handleEditMessage(m)}
                      onForward={() => handleForwardMessage(m)}
                      onPin={() => handlePinMessage(m)}
                      starred={m.starred}
                      bookmarked={bookmarkedMessageIds.has(m.id)}
                      reactions={m.reactions}
                      currentUserId={user?.id}
                      // The sender can always pin/unpin their own message; in a
                      // group, admins can also pin/unpin anyone's message.
                      canPin={m.senderId === user?.id || isGroupAdmin}
                    />
                  </div>
                </div>
              )
            })}
            {/* Typing indicator — shows who is typing with avatar in groups */}
            {typingUsers.length > 0 && (
              <div className="flex justify-start mb-2 wasl-msg-in">
                <div className="flex items-end gap-1.5">
                  {/* Show a small avatar of the first typing user in groups */}
                  {conversation.isGroup && typingUsers[0] && (() => {
                    const typer = conversation.participants.find(
                      (p) => p.name?.split(' ')[0] === typingUsers[0]
                    )
                    return typer ? (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mb-0.5"
                        style={{ backgroundColor: typer.avatarColor || 'var(--wasl-green)' }}
                      >
                        {typer.name?.charAt(0).toUpperCase()}
                      </div>
                    ) : null
                  })()}
                  <div className="wasl-bubble-in px-3 py-2 shadow-sm flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground mr-1">
                      {conversation.isGroup
                        ? typingUsers.length === 1
                          ? `${typingUsers[0]} is typing`
                          : `${typingUsers.length} people are typing`
                        : 'typing'}
                    </span>
                    <span className="wasl-typing-dot w-1.5 h-1.5 bg-[var(--wasl-green)] rounded-full inline-block" />
                    <span className="wasl-typing-dot w-1.5 h-1.5 bg-[var(--wasl-green)] rounded-full inline-block" />
                    <span className="wasl-typing-dot w-1.5 h-1.5 bg-[var(--wasl-green)] rounded-full inline-block" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}

        {/* Scroll-to-bottom button — shows a badge with the count of new
            messages that arrived while the user was scrolled up. */}
        {showScrollBtn && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="wasl-scroll-bottom-btn wasl-anim-scale-in sticky bottom-4 ml-auto mr-2 w-10 h-10 rounded-full flex items-center justify-center text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] hover:bg-muted transition-colors z-10 relative"
            title="Scroll to latest"
            aria-label={`Scroll to latest${unreadSinceScrollUp > 0 ? ` (${unreadSinceScrollUp} new)` : ''}`}
          >
            <ChevronDown className="w-5 h-5" />
            {unreadSinceScrollUp > 0 && (
              <span
                key={unreadSinceScrollUp}
                className="wasl-badge-bounce absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--wasl-light)] text-white text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ring-white dark:ring-[var(--wasl-sidebar-bg)]"
              >
                {unreadSinceScrollUp > 99 ? '99+' : unreadSinceScrollUp}
              </span>
            )}
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
        businesses={businesses}
        onOpenTone={() => setToneOpen(true)}
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
        messageSenderId={forwardMessage?.senderId}
        messageSenderName={
          forwardMessage && conversation
            ? conversation.participants.find((p) => p.userId === forwardMessage.senderId)?.name
            : undefined
        }
        messageProtected={forwardMessage?.protected}
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

      {/* Edit message dialog — replaces the old `prompt()`-based edit flow.
          Enforces the 15-minute edit window client-side (countdown + disabled
          Save button) and surfaces the server's 403 as a clean error toast. */}
      <EditMessageDialog
        open={!!editMessage}
        onOpenChange={(v) => {
          if (!v) setEditMessage(null)
        }}
        message={editMessage}
        conversationId={activeConversationId}
        onEdited={handleEditSaved}
      />
    </div>
  )
}
