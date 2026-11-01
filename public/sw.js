// Wasl Service Worker — PWA offline support + push notification handler.
// Caches the app shell for offline use.

// v2 — HTML navigations are now network-first (a cache-first "/" permanently
// served the logged-out auth screen to signed-in users after reload).
const CACHE_NAME = 'wasl-v2'
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

// Fetch:
//  - HTML navigations → NETWORK-FIRST (never serve a stale auth/chat shell
//    while online; fall back to cache only when offline).
//  - Immutable static assets (/_next/static, images, fonts) → CACHE-FIRST.
//  - API + Socket.io → always network (never cached).
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  // Skip non-GET + cross-origin
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  // Skip API + Socket.io + Next.js internal data requests
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/_next/data')) return

  // DEV SAFEGUARD: on a dev port (any explicit port like :3000), Next.js
  // chunk URLs are NOT content-hashed — caching them serves stale code
  // after every server restart. Only cache on production origins
  // (default ports 80/443, where port === '').
  if (self.location.port !== '') return

  const isNavigation =
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html')
  const isImmutableStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/_next/image') ||
    /\.(?:svg|png|jpg|jpeg|webp|gif|ico|woff2?|ttf|css|js|webmanifest|mp3|wav)$/.test(url.pathname)

  if (isNavigation) {
    // Network-first for the document — a stale cached shell is worse than
    // no cache at all: it locks users out (or in) of the wrong screen.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('/'))
        )
    )
    return
  }

  if (isImmutableStatic) {
    // Cache-first for fingerprinted/immutable assets
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok && response.type === 'basic') {
              const clone = response.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
            }
            return response
          })
      )
    )
  }
  // Everything else: default browser behaviour (no respondWith)
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
