'use client'

import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (socket && socket.connected) return socket
  if (!socket) {
    socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    })
  }
  return socket
}

export function connectSocket(userId: string): Socket {
  const s = getSocket()
  if (!s.connected) s.connect()
  // Identify once connected
  if (s.connected) {
    s.emit('user:identify', { userId })
  } else {
    s.once('connect', () => {
      s.emit('user:identify', { userId })
    })
  }
  return s
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}
