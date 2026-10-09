'use client'

import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (socket && socket.connected) return socket
  if (!socket) {
    // Determine the socket.io connection URL based on the environment:
    //
    // 1. Development (localhost:3000): connect DIRECTLY to the chat-service
    //    on port 3003. The page origin (port 3000) is the Next.js dev
    //    server, which doesn't proxy socket.io.
    //
    // 2. Production / Caddy gateway: use the XTransformPort query param
    //    so Caddy forwards the socket.io connection from the page origin
    //    to port 3003. This is the correct approach for deployed environments
    //    where the page and chat-service are behind the same gateway.
    const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port === '3000'
    const socketUrl = isDev
      ? 'http://localhost:3003'
      : '/?XTransformPort=3003'

    socket = io(socketUrl, {
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

// ── Device identification (Task 93) ───────────────────────────────────
// Generate a stable per-device UUID (stored in localStorage so the same
// browser/install always sends the same deviceId). This lets the
// chat-service + /api/devices track multi-device sessions.
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    let id = localStorage.getItem('wasl-device-id')
    if (!id) {
      // Generate a v4-ish UUID (crypto.randomUUID if available, fallback to
      // Math.random-based)
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        id = crypto.randomUUID()
      } else {
        id = 'dev_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
      }
      localStorage.setItem('wasl-device-id', id)
    }
    return id
  } catch {
    return 'unknown'
  }
}

// Parse a human-friendly device name from the user-agent.
// e.g. "iPhone Safari", "Android Chrome", "Desktop Firefox", "iPad"
export function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Unknown device'
  const ua = navigator.userAgent
  // Detect platform
  const isIPhone = /iPhone/i.test(ua)
  const isIPad = /iPad/i.test(ua)
  const isIPod = /iPod/i.test(ua)
  const isAndroid = /Android/i.test(ua)
  const isMacOS = /Macintosh|Mac OS X/i.test(ua) && !isIPhone && !isIPad
  const isWindows = /Windows/i.test(ua) && !isAndroid
  const isLinux = /Linux/i.test(ua) && !isAndroid

  // Detect browser
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua)
  const isChrome = /Chrome|CriOS/i.test(ua)
  const isFirefox = /Firefox|FxiOS/i.test(ua)
  const isEdge = /Edg/i.test(ua)

  let browser = 'Browser'
  if (isEdge) browser = 'Edge'
  else if (isFirefox) browser = 'Firefox'
  else if (isChrome) browser = 'Chrome'
  else if (isSafari) browser = 'Safari'

  let platform = 'Desktop'
  if (isIPhone) platform = 'iPhone'
  else if (isIPad) platform = 'iPad'
  else if (isIPod) platform = 'iPod'
  else if (isAndroid) {
    // Detect Android tablet (rough heuristic)
    platform = /Tablet|Nexus 9|Nexus 10|SM-T/i.test(ua) ? 'Android Tablet' : 'Android Phone'
  }
  else if (isMacOS) platform = 'macOS'
  else if (isWindows) platform = 'Windows'
  else if (isLinux) platform = 'Linux'

  return `${platform} · ${browser}`
}

// Detect if the app is running as an installed PWA (vs in a browser tab).
export function isPWA(): boolean {
  if (typeof window === 'undefined') return false
  // iOS: standalone mode
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari: navigator.standalone
  if ((navigator as any).standalone === true) return true
  // Check the URL parameter we set when launching from the manifest shortcuts
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get('source') === 'pwa') return true
  } catch { /* ignore */ }
  return false
}

export function connectSocket(userId: string): Socket {
  const s = getSocket()
  if (!s.connected) s.connect()

  // ── Multi-device identification (Task 93) ──────────────────────────
  // Pass the deviceId + deviceName + isPWA flag so the chat-service can:
  //   1. Notify the user's OTHER active devices that a new device signed in
  //   2. Track per-device presence for the Devices dialog
  const identifyPayload = {
    userId,
    deviceId: getDeviceId(),
    deviceName: getDeviceName(),
    isPWA: isPWA(),
  }

  if (s.connected) {
    s.emit('user:identify', identifyPayload)
  } else {
    s.once('connect', () => {
      s.emit('user:identify', identifyPayload)
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
