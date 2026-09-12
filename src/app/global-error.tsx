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
    
    // If it's a ChunkLoadError, auto-reload after 1 second
    if (
      error?.message?.includes('ChunkLoadError') ||
      error?.message?.includes('Failed to load chunk') ||
      error?.name === 'ChunkLoadError'
    ) {
      console.log('[Wasl] ChunkLoadError detected — auto-reloading')
      const timer = setTimeout(() => window.location.reload(), 1000)
      return () => clearTimeout(timer)
    }
  }, [error])

  return (
    <html lang="en">
      <body style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#0b141a', color: '#e9edef' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            Wasl is reloading…
          </h2>
          <p style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1.5rem' }}>
            {error?.message?.includes('ChunkLoadError')
              ? 'Refreshing to load the latest version.'
              : 'Something went wrong.'}
          </p>
          <button onClick={reset} style={{ padding: '0.5rem 1.5rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#e9edef', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
