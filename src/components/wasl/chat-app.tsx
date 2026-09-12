'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useWaslStore } from '@/lib/store'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket'
import { Sidebar } from './sidebar'
import { ChatWindow } from './chat-window'
import { ContactInfoPanel } from './contact-info-panel'
import { NewChatDialog } from './new-chat-dialog'
import { SettingsDialog } from './settings-dialog'
import type { ChatMessage, Conversation } from '@/lib/store'

export function ChatApp({ user }: { user: any }) {
  const {
    setUser,
    activeConversationId,
    setActiveConversation,
    setConversations,
    upsertConversation,
    setUserOnline,
    setOnlineUsers,
    setTyping,
    setSocketStatus,
    setShowProfilePanel,
    showProfilePanel,
  } = useWaslStore()
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const beforeUnloadHandler = useRef<(() => void) | null>(null)

  // Derive mobile view from active conversation selection
  const mobileView: 'list' | 'chat' = activeConversationId ? 'chat' : 'list'

  // Bootstrap user state
  useEffect(() => {
    setUser(user)
    // Mark self as online and start heartbeat
    fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: true }),
    }).catch(() => {})
    // Initial conversations load
    fetch('/api/conversations', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        setConversations(data.conversations || [])
      })
      .catch((e) => console.error(e))
    // Load my phone numbers
    fetch('/api/phone-numbers', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.phoneNumbers) {
          setUser({ ...user, phoneNumbers: data.phoneNumbers })
        }
      })
      .catch((e) => console.error(e))
     
  }, [user.id])

  // Close contact info panel when conversation changes
  useEffect(() => {
    setShowProfilePanel(false)
  }, [activeConversationId, setShowProfilePanel])

  // Heartbeat presence
  useEffect(() => {
    heartbeatRef.current = setInterval(() => {
      fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: true }),
      }).catch(() => {})
    }, 30000)
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [])

  // Mark offline on tab close — use a Blob with explicit application/json
  // content-type so the Next.js route handler's req.json() can parse the body.
  // (navigator.sendBeacon defaults to text/plain;charset=UTF-8 which makes
  // req.json() throw, so the offline signal was never persisted.)
  useEffect(() => {
    beforeUnloadHandler.current = () => {
      try {
        const blob = new Blob([JSON.stringify({ online: false })], {
          type: 'application/json',
        })
        navigator.sendBeacon('/api/profile', blob)
      } catch {}
    }
    const handler = () => beforeUnloadHandler.current?.()
    window.addEventListener('beforeunload', handler)
    return () => {
      window.removeEventListener('beforeunload', handler)
    }
  }, [])

  // ---- Connect socket and set up global listeners ----------------------------
  useEffect(() => {
    if (!user?.id) return
    const socket = connectSocket(user.id)

    // Track socket connection state for the chat-header indicator
    function onConnect() {
      setSocketStatus(socket.connected ? 'connected' : 'connecting')
    }
    function onDisconnect() {
      setSocketStatus('disconnected')
    }
    function onReconnectAttempt() {
      setSocketStatus('reconnecting')
    }
    function onReconnect() {
      setSocketStatus('connected')
    }
    function onReconnectError() {
      setSocketStatus('reconnecting')
    }
    setSocketStatus(socket.connected ? 'connected' : 'connecting')
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.io.on('reconnect_attempt', onReconnectAttempt)
    socket.io.on('reconnect', onReconnect)
    socket.io.on('reconnect_error', onReconnectError)

    function onPresenceUpdate(payload: {
      userId: string
      online: boolean
      lastSeen: string
    }) {
      if (!payload) return
      setUserOnline(payload.userId, payload.online)
    }

    function onOnlineUsers(payload: { users: string[] }) {
      if (!payload) return
      setOnlineUsers(payload.users)
    }

    function onTyping(payload: {
      conversationId: string
      userId: string
      name?: string
      typing: boolean
    }) {
      if (!payload) return
      setTyping(payload.conversationId, payload.userId, payload.typing)
    }

    function onConversationUpdated(payload: {
      conversationId: string
      lastMessage: {
        content: string
        type: string
        senderId: string
        createdAt: string
      }
    }) {
      if (!payload || !payload.conversationId) return
      // Desktop notification when tab is not focused + message from someone else
      if (payload.lastMessage && payload.lastMessage.senderId !== user.id) {
        if (typeof document !== 'undefined' && document.hidden) {
          try {
            if (Notification.permission === 'granted') {
              const conv = useWaslStore.getState().conversations.find(
                (c) => c.id === payload.conversationId
              )
              const senderName =
                conv?.participants.find(
                  (p) => p.userId === payload.lastMessage.senderId
                )?.name || 'Someone'
              new Notification(`${senderName} on Wasl`, {
                body: payload.lastMessage.content.slice(0, 100),
                icon: '/wasl-favicon.svg',
                tag: payload.conversationId,
              })
            }
          } catch {}
        }
      }
      // Refresh just this conversation to get last message + unread count
      fetch(`/api/conversations`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((data) => {
          const target = (data.conversations || []).find(
            (c: Conversation) => c.id === payload.conversationId
          )
          if (target) upsertConversation(target)
        })
        .catch(() => {})
    }

    function onConversationUpserted(payload: { conversationId: string }) {
      if (!payload || !payload.conversationId) return
      fetch(`/api/conversations`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((data) => {
          const target = (data.conversations || []).find(
            (c: Conversation) => c.id === payload.conversationId
          )
          if (target) upsertConversation(target)
        })
        .catch(() => {})
    }

    socket.on('presence:update', onPresenceUpdate)
    socket.on('online-users', onOnlineUsers)
    socket.on('typing:update', onTyping)
    socket.on('conversation:updated', onConversationUpdated)
    socket.on('conversation:upserted', onConversationUpserted)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.io.off('reconnect_attempt', onReconnectAttempt)
      socket.io.off('reconnect', onReconnect)
      socket.io.off('reconnect_error', onReconnectError)
      socket.off('presence:update', onPresenceUpdate)
      socket.off('online-users', onOnlineUsers)
      socket.off('typing:update', onTyping)
      socket.off('conversation:updated', onConversationUpdated)
      socket.off('conversation:upserted', onConversationUpserted)
    }
  }, [user?.id, setUserOnline, setOnlineUsers, setTyping, upsertConversation, setSocketStatus])

  // Cleanup socket on unmount
  useEffect(() => {
    return () => {
      // do not disconnect on conversation switch; only on full unmount
      // (we want the socket to persist across re-renders)
    }
  }, [])

  // Back button on mobile - clears active conversation which collapses chat back to list
  const handleBack = useCallback(() => {
    setActiveConversation(null)
  }, [setActiveConversation])

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[var(--wasl-chat-bg)]">
      {/* Sidebar - hidden on mobile when in chat view */}
      <aside
        className={`w-full md:w-[360px] lg:w-[400px] xl:w-[420px] shrink-0 border-r border-border h-full ${
          mobileView === 'chat' ? 'hidden md:flex' : 'flex'
        } flex-col`}
      >
        <Sidebar
          onNewChat={() => setNewChatOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </aside>

      {/* Chat window */}
      <main
        className={`flex-1 min-w-0 h-full ${
          mobileView === 'list' ? 'hidden md:flex' : 'flex'
        } flex-col`}
      >
        <ChatWindow onBack={handleBack} onOpenInfo={() => setShowProfilePanel(true)} />
      </main>

      {/* Contact info panel */}
      {showProfilePanel && (
        <aside className="hidden lg:block w-[360px] xl:w-[400px] shrink-0 h-full">
          <ContactInfoPanel onClose={() => setShowProfilePanel(false)} />
        </aside>
      )}

      {/* Mobile contact info as overlay */}
      {showProfilePanel && (
        <div className="lg:hidden fixed inset-0 z-50 bg-white dark:bg-[var(--wasl-sidebar-bg)]">
          <ContactInfoPanel onClose={() => setShowProfilePanel(false)} />
        </div>
      )}

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
