// Simple in-memory rate limiter for API routes.
// Zero-cost, no external dependencies (no Redis needed).
// Limits per IP + per route. Sliding window approach.

type RateLimitEntry = {
  count: number
  resetAt: number
}

const limits = new Map<string, RateLimitEntry>()

// Clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of limits) {
    if (entry.resetAt < now) limits.delete(key)
  }
}, 60000)

/**
 * Check rate limit for a given key (e.g. `${ip}:${route}`).
 * Returns { allowed: boolean, remaining: number, resetAt: number }.
 *
 * @param key - Unique identifier (e.g. IP + route)
 * @param maxRequests - Max requests in the window
 * @param windowMs - Window duration in milliseconds
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = limits.get(key)

  if (!entry || entry.resetAt < now) {
    // New window
    limits.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs }
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt }
}

/** Get the client IP from a Next.js request. */
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return 'unknown'
}
