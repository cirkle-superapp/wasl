'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to Sentry (or console fallback)
    import('@/lib/sentry').then(({ captureError }) => {
      captureError(error, { source: 'global-error', digest: error.digest })
    })

    // If it's a ChunkLoadError, clear caches + hard reload with cache-bust
    if (
      error?.message?.includes('ChunkLoadError') ||
      error?.message?.includes('Failed to load chunk') ||
      error?.name === 'ChunkLoadError'
    ) {
      console.log('[Wasl] ChunkLoadError detected — clearing cache + reloading')
      // Clear all browser caches so stale chunks are purged
      if ('caches' in window) {
        caches.keys().then((keys) => {
          Promise.all(keys.map((k) => caches.delete(k))).then(() => {
            // Force a hard reload that bypasses the browser cache
            const loc = window.location
            loc.href = loc.pathname + '?_t=' + Date.now()
          })
        })
      } else {
        // No Cache API — just reload with cache-bust
        const w = window as any
        w.location.assign(w.location.pathname + '?_t=' + Date.now())
      }
      return
    }
  }, [error])

  return (
    <html lang="en">
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Fraunces, Georgia, serif', background: '#1a4a5a', color: '#fdfcf9' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem', fontFamily: 'Tajawal, sans-serif', letterSpacing: '0.4em', opacity: 0.5 }}>
            دواير
          </div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontFamily: 'Fraunces, Georgia, serif' }}>
            Wasl is reloading…
          </h2>
          <p style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1.5rem' }}>
            {error?.message?.includes('ChunkLoadError')
              ? 'Clearing cache to load the latest version.'
              : 'Something went wrong.'}
          </p>
          <button onClick={reset} style={{ padding: '0.5rem 1.5rem', borderRadius: '0.5rem', border: '1px solid rgba(229,201,138,0.3)', background: 'transparent', color: '#e5c98a', cursor: 'pointer', fontFamily: 'inherit' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
