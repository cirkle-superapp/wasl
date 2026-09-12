// Sentry error monitoring — zero-cost with fallback to console.
// If SENTRY_DSN is set, errors are sent to Sentry (free tier: 5K errors/month).
// If not set, errors are logged to console only.

const SENTRY_DSN = process.env.SENTRY_DSN || ''

export function captureError(error: Error | string, context?: Record<string, any>) {
  const msg = typeof error === 'string' ? error : error.message
  const stack = typeof error === 'string' ? '' : error.stack || ''
  
  // Always log to console
  console.error('[Wasl Error]', msg, context || '', stack)
  
  // If Sentry DSN is configured, send to Sentry
  if (SENTRY_DSN) {
    try {
      // In production with @sentry/node installed, this would use Sentry.captureException
      // For now, we use the Sentry REST API directly (zero-cost, no SDK needed)
      fetch('https://sentry.io/api/1/store/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sentry-Auth': `Sentry sentry_key=${SENTRY_DSN}` },
        body: JSON.stringify({
          event_id: Math.random().toString(36).slice(2),
          message: msg,
          level: 'error',
          platform: 'node',
          extra: context,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {}) // Fire and forget
    } catch {}
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  console[level === 'error' ? 'error' : 'log']('[Wasl]', message)
}
