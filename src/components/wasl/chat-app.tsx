'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Link2, Users } from 'lucide-react'
import { useWaslStore } from '@/lib/store'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket'
import { Sidebar } from './sidebar'
import { ChatWindow } from './chat-window'
import { ContactInfoPanel } from './contact-info-panel'
import { NewChatDialog } from './new-chat-dialog'
import { SettingsDialog } from './settings-dialog'
import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog'
import { QuickReplyToast } from './quick-reply-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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

  // ---- Scheduled message processor ----------------------------------------
  // Polls /api/scheduled-messages/process every 60s to send due messages.
  // This is a lightweight client-side scheduler — the endpoint is idempotent
  // so multiple clients calling it is safe. Also fires once on mount.
  useEffect(() => {
    const processScheduled = () => {
      fetch('/api/scheduled-messages/process', { method: 'POST' })
        .then((r) => r.json())
        .then((data) => {
          // If any messages were sent, refresh the conversation list so the
          // sidebar updates with the new last-message previews.
          if (data?.sent > 0) {
            fetch('/api/conversations', { cache: 'no-store' })
              .then((r) => r.json())
              .then((d) => {
                if (d.conversations) setConversations(d.conversations)
              })
              .catch(() => {})
          }
        })
        .catch(() => {})
    }
    // Fire once immediately on mount, then every 60s.
    processScheduled()
    const interval = setInterval(processScheduled, 60_000)
    return () => clearInterval(interval)
  }, [setConversations])

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

    // Track socket connection state for the chat-header indicator.
    // We use a 3-second grace period before showing 'reconnecting' — this
    // prevents the "Reconnecting…" pill from flashing on every page load
    // during the initial socket.io handshake (which may include a brief
    // polling→websocket upgrade delay).
    let hasConnectedOnce = socket.connected
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function clearReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    function onConnect() {
      hasConnectedOnce = true
      clearReconnectTimer()
      setSocketStatus('connected')
    }
    function onDisconnect() {
      // Only show 'disconnected' if we were previously connected — otherwise
      // it's just the initial connection attempt failing, which is 'connecting'.
      if (hasConnectedOnce) {
        clearReconnectTimer()
        setSocketStatus('disconnected')
      }
    }
    function onReconnectAttempt() {
      // Debounce: only show 'reconnecting' after 3s of continuous failure.
      // If the socket connects within 3s, the timer is cancelled and the
      // status stays at 'connected' (or 'connecting' for the first attempt).
      if (!reconnectTimer && hasConnectedOnce) {
        reconnectTimer = setTimeout(() => {
          setSocketStatus('reconnecting')
        }, 3000)
      }
    }
    function onReconnect() {
      clearReconnectTimer()
      setSocketStatus('connected')
    }
    function onReconnectError() {
      // Same debounce as onReconnectAttempt — don't flash the indicator
      // for brief polling failures during the websocket upgrade.
      if (!reconnectTimer && hasConnectedOnce) {
        reconnectTimer = setTimeout(() => {
          setSocketStatus('reconnecting')
        }, 3000)
      }
    }
    function onConnectError() {
      // connect_error fires on the initial connection attempt. Don't show
      // 'reconnecting' for this — the socket is still trying for the first
      // time, not reconnecting.
    }
    setSocketStatus(socket.connected ? 'connected' : 'connecting')
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
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

      // ---- In-app quick-reply toast ----------------------------------------
      // When a new message arrives in a conversation that is NOT currently
      // active (the user is viewing a different chat), show an in-app toast
      // with the sender name, message preview, and a quick-reply input.
      // This lets the user reply without switching conversations.
      const currentActiveId = useWaslStore.getState().activeConversationId
      if (
        payload.lastMessage &&
        payload.lastMessage.senderId !== user.id &&
        currentActiveId !== payload.conversationId
      ) {
        const conv = useWaslStore.getState().conversations.find(
          (c) => c.id === payload.conversationId
        )
        const senderName =
          conv?.participants.find(
            (p) => p.userId === payload.lastMessage.senderId
          )?.name || 'Someone'
        const msgPreview = payload.lastMessage.content.slice(0, 80)
        const convId = payload.conversationId

        // Use a unique toast ID per conversation so rapid messages from the
        // same chat replace the previous toast instead of stacking.
        const toastId = `quick-reply-${convId}`
        toast.custom(
          (t) => (
            <QuickReplyToast
              senderName={senderName}
              messagePreview={msgPreview}
              onReply={async (text) => {
                try {
                  const res = await fetch(
                    `/api/conversations/${convId}/messages`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ content: text, type: 'text' }),
                    }
                  )
                  if (res.ok) {
                    toast.success('Reply sent', { id: toastId })
                    // Emit via socket so the recipient sees it immediately
                    // and our own sidebar updates.
                    getSocket().emit('message:send', {
                      conversationId: convId,
                      content: text,
                      type: 'text',
                    })
                  } else {
                    toast.error('Failed to send reply', { id: toastId })
                  }
                } catch {
                  toast.error('Network error', { id: toastId })
                }
              }}
              onOpen={() => {
                toast.dismiss(t.id)
                setActiveConversation(convId)
              }}
            />
          ),
          { id: toastId, duration: 8000 }
        )
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
      clearReconnectTimer()
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
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
      <KeyboardShortcutsDialog />

      {/* Invite-link join dialog. Reads `?join={token}` from the URL so the
          same link works whether the visitor is logged in already or signs
          up / logs in fresh (the URL is preserved across router.refresh()). */}
      <Suspense fallback={null}>
        <JoinViaInviteDialog />
      </Suspense>
    </div>
  )
}

// ---------------------------------------------------------------------------
// JoinViaInviteDialog — when the URL contains `?join={token}`, prompts the
// logged-in user to confirm joining the group. On accept, POSTs to
// /api/conversations/join with the token. After the request resolves (either
// success or failure), the `?join=` param is stripped from the URL so the
// dialog doesn't re-show on the next render.
//
// State is held by the *inner* component, which is keyed by the token so it
// remounts cleanly whenever the URL changes (avoids setState-in-effect).
// ---------------------------------------------------------------------------

function JoinViaInviteDialog() {
  const searchParams = useSearchParams()
  const token = searchParams.get('join')

  if (!token) return null
  return <JoinViaInviteDialogInner key={token} token={token} />
}

function JoinViaInviteDialogInner({ token }: { token: string }) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const { setActiveConversation, setConversations } = useWaslStore()
  const [joining, setJoining] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Strip `?join=...` from the URL without changing anything else (preserves
  // the rest of the query string if any).
  const clearJoinParam = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('join')
    const qs = params.toString()
    router.replace(qs ? `/?${qs}` : '/', { scroll: false })
  }, [router, searchParams])

  async function handleAccept() {
    setJoining(true)
    setErrorMessage(null)
    try {
      const res = await fetch('/api/conversations/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMessage(data?.error || 'Invalid or expired invite link')
        setJoining(false)
        return
      }
      // Refresh the conversation list so the newly-joined group appears in
      // the sidebar, then set it as active so the chat window opens.
      try {
        const convRes = await fetch('/api/conversations', { cache: 'no-store' })
        if (convRes.ok) {
          const convData = await convRes.json()
          if (Array.isArray(convData.conversations)) {
            setConversations(convData.conversations)
          }
        }
      } catch {
        // ignore — the join itself succeeded
      }
      if (data?.conversationId) {
        setActiveConversation(data.conversationId)
      }
      const alreadyMember = !!data?.alreadyMember
      toast.success(
        alreadyMember
          ? "You're already a member of this group"
          : 'Joined the group via invite link'
      )
      // Clearing the URL param unmounts this component naturally.
      clearJoinParam()
    } catch {
      setErrorMessage('Network error')
      setJoining(false)
    }
  }

  function handleDecline() {
    clearJoinParam()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleDecline()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-full bg-[var(--wasl-teal)]/15 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] flex items-center justify-center">
              <Link2 className="w-4 h-4" />
            </div>
            <DialogTitle>Join group?</DialogTitle>
          </div>
          <DialogDescription>
            You&apos;ve been invited to join a Wasl group via an invite link.
            {errorMessage ? (
              <span className="block mt-2 text-destructive">{errorMessage}</span>
            ) : (
              <>
                {' '}
                Once you accept, you&apos;ll be added as a member and can
                start sending messages.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md bg-muted/40 border border-border/60 p-2.5 text-xs text-muted-foreground flex items-center gap-2">
          <Users className="w-3.5 h-3.5 shrink-0" />
          <code className="break-all">
            {typeof window !== 'undefined'
              ? `${window.location.origin}/?join=${token}`
              : `/?join=${token}`}
          </code>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleDecline}
            disabled={joining}
          >
            Decline
          </Button>
          <Button
            onClick={handleAccept}
            disabled={joining}
            className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
          >
            {joining ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Joining…
              </>
            ) : (
              'Accept'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
