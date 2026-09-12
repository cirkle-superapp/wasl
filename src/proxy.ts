import { NextRequest, NextResponse } from 'next/server'

// Simple in-memory rate limiter for ALL API routes.
// Different limits for different route types.

type RateEntry = { count: number; resetAt: number }
const limits = new Map<string, RateEntry>()

// Clean expired entries every 60s
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of limits) {
    if (entry.resetAt < now) limits.delete(key)
  }
}, 60000)

function checkLimit(key: string, max: number, windowMs: number): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now()
  const entry = limits.get(key)
  if (!entry || entry.resetAt < now) {
    limits.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: max - 1, retryAfter: 0 }
  }
  if (entry.count >= max) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }
  entry.count++
  return { allowed: true, remaining: max - entry.count, retryAfter: 0 }
}

function getIP(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
}

// Rate limit config per route pattern
const ROUTE_LIMITS: { pattern: RegExp; max: number; windowMs: number }[] = [
  { pattern: /\/api\/auth\/(login|signup)/, max: 10, windowMs: 60_000 },     // 10/min for auth
  { pattern: /\/api\/upload/, max: 20, windowMs: 60_000 },                   // 20/min for uploads
  { pattern: /\/api\/(conversations|messages|commits|polls|stories|business)/, max: 60, windowMs: 60_000 }, // 60/min for data
  { pattern: /\/api\//, max: 120, windowMs: 60_000 },                        // 120/min general API
]

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (!pathname.startsWith('/api/')) return NextResponse.next()

  const ip = getIP(req)
  const limit = ROUTE_LIMITS.find(r => r.pattern.test(pathname)) || ROUTE_LIMITS[ROUTE_LIMITS.length - 1]
  const result = checkLimit(`${ip}:${pathname}`, limit.max, limit.windowMs)

  if (!result.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${result.retryAfter}s.` },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfter),
          'X-RateLimit-Limit': String(limit.max),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  const res = NextResponse.next()
  res.headers.set('X-RateLimit-Limit', String(limit.max))
  res.headers.set('X-RateLimit-Remaining', String(result.remaining))
  return res
}

export const config = {
  matcher: '/api/:path*',
}
