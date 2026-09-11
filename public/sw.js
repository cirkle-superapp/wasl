// Wasl Service Worker — PWA offline support + push notification handler.
// This is a basic service worker that caches the app shell for offline use.

const CACHE_NAME = 'wasl-v1'
const APP_SHELL = ['/', '/manifest.webmanifest', '/logo.svg', '/wasl-favicon.svg']

// Install — pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  )
  self.skipWaiting()
})

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  )
  self.clients.claim()
})

// Fetch — network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  // Skip non-GET + cross-origin
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  // Skip API + Socket.io + Next.js internal
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/_next/')) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((response) => {
            // Cache successful responses
            if (response.ok && response.type === 'basic') {
              const clone = response.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
            }
            return response
          })
          .catch(() => cached || caches.match('/'))
      )
    })
  )
})

// Push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'Wasl', body: 'New message' }
  try {
    if (event.data) data = event.data.json()
  } catch {
    if (event.data?.text) data.body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Wasl', {
      body: data.body || 'You have a new message',
      icon: '/wasl-favicon.svg',
      badge: '/wasl-favicon.svg',
      tag: data.tag || 'wasl-notification',
      data: data.url ? { url: data.url } : {},
    })
  )
})

// Notification click — focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const client = clients.find((c) => c.url.includes(self.location.origin))
      if (client) {
        client.focus()
        client.navigate(targetUrl)
      } else {
        self.clients.openWindow(targetUrl)
      }
    })
  )
})
