// ═══════════════════════════════════════════════════════════════════════
// Server-side socket.io client (Task 94 fix)
// ═══════════════════════════════════════════════════════════════════════
//
// A SINGLE long-lived socket.io-client connection from the Next.js server
// to the chat-service (port 3003). Used by API routes (e.g.
// POST /api/conversations/[id]/messages) to broadcast real-time events
// when the request didn't come from a chat-app client (e.g. from curl,
// PWA without socket.io loaded, scheduled-batch sends, API token
// integrations from Task 89, etc.).
//
// Why a single connection (not one per request):
//   - Performance: a single TCP connection is reused for all broadcasts
//   - Resource: socket.io has connection overhead (~10KB per socket)
//   - Stability: the connection auto-reconnects via socket.io's built-in
//     reconnection logic
//
// This file is server-only — never import from client code.

import { io, type Socket } from 'socket.io-client'

let _serverSocket: Socket | null = null

const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3003'

/**
 * Get (or create) the single server-side socket.io connection to the
 * chat-service. The connection is lazily created on first use.
 */
function getServerSocket(): Socket {
  if (_serverSocket && _serverSocket.connected) return _serverSocket
  if (!_serverSocket) {
    _serverSocket = io(CHAT_SERVICE_URL, {
      path: '/',
      transports: ['websocket'],  // server-to-server, no need for polling fallback
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 5000,
      // We're a "system" client — don't identify as a user (no user:identify)
    })
    _serverSocket.on('connect', () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[server-socket] connected to chat-service', CHAT_SERVICE_URL)
      }
    })
    _serverSocket.on('disconnect', (reason) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[server-socket] disconnected:', reason)
      }
    })
    _serverSocket.on('connect_error', (err) => {
      // Silent — the chat-service might be down. Messages still get saved
      // in DB; they just won't broadcast in real-time until the service
      // is back up.
    })
  }
  if (!_serverSocket.connected) {
    _serverSocket.connect()
  }
  return _serverSocket
}

/**
 * Broadcast a new message to all clients in a conversation room.
 * Used by the messages API after creating a message — ensures real-time
 * delivery even when the request didn't come from a chat-app client.
 *
 * Fire-and-forget: if the chat-service is down, the message is still
 * saved in DB; recipients will see it on their next conversation fetch.
 */
export function broadcastMessage(payload: {
  conversationId: string
  message: {
    id: string
    conversationId: string
    senderId: string
    content: string
    type: string
    status: string
    createdAt: string | Date
  }
}): void {
  try {
    const socket = getServerSocket()
    // Emit the same 'message:send' event the chat-app would emit — the
    // chat-service handler broadcasts to all sockets in the conversation
    // room via io.to(`conversation:${id}`).emit('message:received', ...).
    socket.emit('message:send', payload)
  } catch {
    // Silent — never let a broadcast failure fail the API response
  }
}

/**
 * Broadcast a conversation:updated event (used when a conversation's
 * last message changes — e.g. scheduled batch sent a message).
 */
export function broadcastConversationUpdate(payload: {
  conversationId: string
  lastMessage: {
    content: string
    type: string
    senderId: string
    createdAt: string | Date
  }
}): void {
  try {
    const socket = getServerSocket()
    socket.emit('conversation:updated', payload)
  } catch {
    // Silent
  }
}
