// URL detection + lightweight link-preview helpers used by MessageBubble.
//
// We do NOT scrape the target URL server-side (that's unsafe + slow). Instead
// we render a small card with the favicon + domain + visible URL, and make
// the link clickable. The favicon is fetched from Google's public S2 favicon
// service, which is widely used and reliable.
//
// For richer previews (title + description + image), the MessageBubble can
// call `fetchOgPreview(href)` which hits our `/api/link-preview` endpoint.

const URL_RE =
  /(\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.!?,;:)\]]|[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s<>"']*)?)/gi

export type DetectedLink = {
  raw: string
  href: string // normalized with protocol
  domain: string
  path: string
}

export function findUrls(text: string): DetectedLink[] {
  const out: DetectedLink[] = []
  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0]
    if (raw.length < 5) continue
    let href = raw
    if (!/^https?:\/\//i.test(href)) {
      href = 'https://' + href.replace(/^www\./i, '')
    }
    try {
      const url = new URL(href)
      // Skip if the "domain" is just a number + TLD that looks like a filename
      // or file extension (e.g. "image.png"). Only allow links with a real
      // domain that has a dot AND a known-ish TLD (length >= 2).
      if (!url.hostname.includes('.')) continue
      const parts = url.hostname.split('.')
      const tld = parts[parts.length - 1]
      if (tld.length < 2) continue
      out.push({
        raw,
        href,
        domain: url.hostname.replace(/^www\./, ''),
        path: url.pathname + (url.search || ''),
      })
    } catch {
      // ignore invalid URLs
    }
  }
  // Dedupe by href
  const seen = new Set<string>()
  return out.filter((l) => {
    if (seen.has(l.href)) return false
    seen.add(l.href)
    return true
  })
}

export function faviconUrl(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    domain
  )}&sz=${size}`
}

// Pretty-print the path: trim leading/trailing slash, truncate long paths.
export function prettyPath(path: string, max = 40): string {
  let p = path.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!p) return ''
  if (p.length > max) p = p.slice(0, max - 1) + '…'
  return '/' + p
}

// ---- OpenGraph preview (richer cards) -------------------------------------
// Fetched asynchronously from our /api/link-preview endpoint. Returns null if
// the fetch fails or the preview has no title/description/image (in which
// case the caller should fall back to the favicon-based card).

export type OgPreview = {
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
}

// Simple in-memory cache so we don't refetch the same URL on every re-render.
// This is per-tab (module-scoped) and is cleared on page reload.
const ogCache = new Map<string, OgPreview | null>()

export async function fetchOgPreview(href: string): Promise<OgPreview | null> {
  // Check cache first
  if (ogCache.has(href)) {
    return ogCache.get(href) || null
  }
  // Mark as "loading" by setting null — prevents duplicate fetches.
  ogCache.set(href, null)
  try {
    const res = await fetch(
      `/api/link-preview?url=${encodeURIComponent(href)}`,
      { cache: 'no-store' }
    )
    if (!res.ok) {
      return null
    }
    const data: OgPreview = await res.json()
    // Only cache if there's something useful to show
    const useful = data.title || data.description || data.image
    ogCache.set(href, useful ? data : null)
    return useful ? data : null
  } catch {
    return null
  }
}
