import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ----- In-memory state -------------------------------------------------------
// socket.id -> userId
const socketToUser = new Map<string, string>()
// userId -> Set<socket.id> (same user can have multiple tabs)
const userSockets = new Map<string, Set<string>>()

// typing state: conversationId -> userId -> last typing timestamp
const typingMap = new Map<string, Map<string, number>>()

const TYPING_TIMEOUT_MS = 4000

function getUserIdsOnline(): string[] {
  return Array.from(userSockets.keys())
}

function isUserOnline(userId: string): boolean {
  const sockets = userSockets.get(userId)
  return !!sockets && sockets.size > 0
}

function broadcastPresence(userId: string, online: boolean) {
  io.emit('presence:update', { userId, online, lastSeen: new Date().toISOString() })
}

// ----- Helpers ----------------------------------------------------------------
function joinConversationRoom(socketId: string, conversationId: string) {
  io.in(socketId).socketsJoin(`conversation:${conversationId}`)
}

// ----- Socket event handlers --------------------------------------------------
io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`)

  // A client identifies itself after auth
  socket.on('user:identify', (data: { userId: string }) => {
    if (!data || !data.userId) return
    const { userId } = data

    const wasOnline = isUserOnline(userId)
    socketToUser.set(socket.id, userId)
    if (!userSockets.has(userId)) userSockets.set(userId, new Set())
    userSockets.get(userId)!.add(socket.id)

    if (!wasOnline) broadcastPresence(userId, true)

    // Tell the client who is currently online
    socket.emit('online-users', { users: getUserIdsOnline() })

    console.log(`[socket] identified: ${userId} via ${socket.id}`)
  })

  // A client subscribes to a conversation room (for broadcasts)
  socket.on('conversation:join', (data: { conversationId: string }) => {
    if (!data || !data.conversationId) return
    joinConversationRoom(socket.id, data.conversationId)
    socket.emit('conversation:joined', { conversationId: data.conversationId })
  })

  socket.on('conversation:leave', (data: { conversationId: string }) => {
    if (!data || !data.conversationId) return
    io.in(socket.id).socketsLeave(`conversation:${data.conversationId}`)
  })

  // New message broadcast (client already persisted via REST API)
  socket.on(
    'message:send',
    (data: {
      conversationId: string
      message: {
        id: string
        conversationId: string
        senderId: string
        content: string
        type: string
        status: string
        createdAt: string
      }
    }) => {
      if (!data || !data.conversationId || !data.message) return
      // Broadcast to everyone in the conversation room (including sender for echo/confirmation if needed)
      io.to(`conversation:${data.conversationId}`).emit('message:received', {
        conversationId: data.conversationId,
        message: data.message,
      })

      // Notify conversation list subscribers that the conversation was updated
      io.emit('conversation:updated', {
        conversationId: data.conversationId,
        lastMessage: {
          content: data.message.content,
          type: data.message.type,
          senderId: data.message.senderId,
          createdAt: data.message.createdAt,
        },
      })
    }
  )

  // Message status updates (delivered / read)
  socket.on(
    'message:status',
    (data: {
      conversationId: string
      messageIds: string[]
      status: 'delivered' | 'read'
      byUserId: string
    }) => {
      if (!data || !data.conversationId || !data.messageIds?.length) return
      io.to(`conversation:${data.conversationId}`).emit('message:status', {
        conversationId: data.conversationId,
        messageIds: data.messageIds,
        status: data.status,
        byUserId: data.byUserId,
      })
    }
  )

  // Typing indicator
  socket.on(
    'typing:start',
    (data: { conversationId: string; userId: string; name?: string }) => {
      if (!data || !data.conversationId || !data.userId) return
      let conv = typingMap.get(data.conversationId)
      if (!conv) {
        conv = new Map()
        typingMap.set(data.conversationId, conv)
      }
      conv.set(data.userId, Date.now())

      socket.to(`conversation:${data.conversationId}`).emit('typing:update', {
        conversationId: data.conversationId,
        userId: data.userId,
        name: data.name,
        typing: true,
      })
    }
  )

  socket.on('typing:stop', (data: { conversationId: string; userId: string }) => {
    if (!data || !data.conversationId || !data.userId) return
    const conv = typingMap.get(data.conversationId)
    conv?.delete(data.userId)

    socket.to(`conversation:${data.conversationId}`).emit('typing:update', {
      conversationId: data.conversationId,
      userId: data.userId,
      typing: false,
    })
  })

  // Conversation created/updated broadcast (for chat list refresh)
  socket.on('conversation:upserted', (data: { conversationId: string; participants: string[] }) => {
    if (!data || !data.conversationId) return
    // Notify all participants that they have a new/updated conversation
    for (const userId of data.participants || []) {
      // emit to that user's sockets
      const sockets = userSockets.get(userId)
      if (sockets) {
        for (const sid of sockets) {
          io.to(sid).emit('conversation:upserted', {
            conversationId: data.conversationId,
          })
        }
      }
    }
  })

  // Commit created/updated broadcast — Cirkle-inspired commitment feature.
  // The REST API persists the commit; the socket just relays the change to
  // everyone in the conversation room so cards update in real time.
  socket.on(
    'commit:updated',
    (data: {
      conversationId: string
      commitId: string
    }) => {
      if (!data || !data.conversationId || !data.commitId) return
      io.to(`conversation:${data.conversationId}`).emit('commit:updated', {
        conversationId: data.conversationId,
        commitId: data.commitId,
      })
    }
  )

  // Message reaction / star / delete broadcast — relays a "message changed"
  // signal to everyone in the conversation room so other clients refetch the
  // single message and update reactions / starred / deletion state.
  socket.on(
    'message:reacted',
    (data: { conversationId: string; messageId: string }) => {
      if (!data || !data.conversationId || !data.messageId) return
      io.to(`conversation:${data.conversationId}`).emit('message:reacted', {
        conversationId: data.conversationId,
        messageId: data.messageId,
      })
    }
  )

  socket.on('disconnect', () => {
    const userId = socketToUser.get(socket.id)
    socketToUser.delete(socket.id)

    if (userId) {
      const sockets = userSockets.get(userId)
      if (sockets) {
        sockets.delete(socket.id)
        if (sockets.size === 0) {
          userSockets.delete(userId)
          broadcastPresence(userId, false)
        }
      }
      // Clean up typing state for this user across conversations
      for (const [convId, users] of typingMap.entries()) {
        if (users.has(userId)) {
          users.delete(userId)
          io.to(`conversation:${convId}`).emit('typing:update', {
            conversationId: convId,
            userId,
            typing: false,
          })
        }
      }
    }

    console.log(`[socket] disconnected: ${socket.id}`)
  })

  socket.on('error', (error) => {
    console.error(`[socket] error (${socket.id}):`, error)
  })
})

// ----- Typing timeout cleaner -------------------------------------------------
setInterval(() => {
  const now = Date.now()
  for (const [convId, users] of typingMap.entries()) {
    for (const [userId, ts] of users.entries()) {
      if (now - ts > TYPING_TIMEOUT_MS) {
        users.delete(userId)
        io.to(`conversation:${convId}`).emit('typing:update', {
          conversationId: convId,
          userId,
          typing: false,
        })
      }
    }
  }
}, 2000)

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`Wasl chat service (socket.io) running on port ${PORT}`)
})

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down...`)
  io.close(() => {
    httpServer.close(() => {
      console.log('Wasl chat service closed')
      process.exit(0)
    })
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
