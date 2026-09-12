// URL detection + lightweight link-preview helpers used by MessageBubble.
//
// We do NOT scrape the target URL server-side (that's unsafe + slow). Instead
// we render a small card with the favicon + domain + visible URL, and make
// the link clickable. The favicon is fetched from Google's public S2 favicon
// service, which is widely used and reliable.

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
