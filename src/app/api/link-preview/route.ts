import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Simple in-memory cache for link previews. Each entry is cached for 10 minutes.
// We cap the cache at 200 entries to avoid unbounded memory growth.
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const CACHE_MAX = 200
const cache = new Map<string, { data: any; expiresAt: number }>()

function evictCache() {
  if (cache.size <= CACHE_MAX) return
  // Remove the oldest entries (FIFO — Map preserves insertion order)
  const toRemove = cache.size - CACHE_MAX
  const iter = cache.keys()
  for (let i = 0; i < toRemove; i++) {
    cache.delete(iter.next().value)
  }
}

// GET /api/link-preview?url=<url>
// Fetches OpenGraph + Twitter Card meta tags from the target URL and returns
// a normalized preview object: { title, description, image, siteName, url }.
// The fetch is done server-side to avoid CORS issues and to keep the user's
// IP private from the target site.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 })
  }

  // Validate URL
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (!parsedUrl.protocol.startsWith('http')) {
      return NextResponse.json({ error: 'Only HTTP(S) URLs are supported' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  // Check cache
  const cacheKey = parsedUrl.href
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  try {
    // Fetch the page HTML. We set a short timeout and limit the response size
    // to avoid hanging on slow servers. We only need the <head> section, so
    // we can stop reading after we've seen enough HTML.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Use a desktop browser User-Agent so sites return the full HTML
        // (some sites serve minimal HTML to bots).
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const data = { url: cacheKey, title: null, description: null, image: null, siteName: null }
      cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS })
      evictCache()
      return NextResponse.json(data)
    }

    // Read only the first ~100KB of HTML — meta tags are in <head> which is
    // always at the beginning of the document.
    const reader = res.body?.getReader()
    if (!reader) {
      const data = { url: cacheKey, title: null, description: null, image: null, siteName: null }
      cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS })
      evictCache()
      return NextResponse.json(data)
    }

    let html = ''
    const decoder = new TextDecoder()
    let bytesRead = 0
    const MAX_BYTES = 100 * 1024 // 100KB

    while (bytesRead < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      bytesRead += value.length
      // Stop early if we've seen the end of </head>
      if (html.includes('</head>')) break
    }
    reader.cancel()

    // Extract meta tags using regex (fast and avoids parsing the full DOM).
    // We look for: og:title, og:description, og:image, og:site_name,
    // twitter:title, twitter:description, twitter:image, and <title>.
    const getMeta = (property: string): string | null => {
      // Match <meta property="og:title" content="..." /> or
      // <meta name="twitter:title" content="..." />
      const re = new RegExp(
        `<meta\\s+(?:property|name)=["']${property}["']\\s+content=["']([^"']*)["']`,
        'i'
      )
      const match = html.match(re)
      return match ? match[1].trim() : null
    }

    const title =
      getMeta('og:title') ||
      getMeta('twitter:title') ||
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ||
      null

    const description =
      getMeta('og:description') ||
      getMeta('twitter:description') ||
      getMeta('description') ||
      null

    let image =
      getMeta('og:image') ||
      getMeta('twitter:image') ||
      null

    // Make image URL absolute if it's relative
    if (image && !image.startsWith('http')) {
      try {
        image = new URL(image, parsedUrl.origin).href
      } catch {
        // keep relative if URL parsing fails
      }
    }

    const siteName = getMeta('og:site_name') || parsedUrl.hostname.replace(/^www\./, '')

    const data = {
      url: cacheKey,
      title,
      description,
      image,
      siteName,
    }

    // Cache the result
    cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS })
    evictCache()

    return NextResponse.json(data)
  } catch {
    // On any error (timeout, network, etc.), return a minimal preview so the
    // UI can still show the favicon-based fallback card.
    const data = {
      url: cacheKey,
      title: null,
      description: null,
      image: null,
      siteName: parsedUrl.hostname.replace(/^www\./, ''),
    }
    cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS })
    evictCache()
    return NextResponse.json(data)
  }
}
