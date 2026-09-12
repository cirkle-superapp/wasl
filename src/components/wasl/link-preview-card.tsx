'use client'

import { useState, useEffect } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { faviconUrl, fetchOgPreview, type OgPreview } from '@/lib/link-preview'

// Link preview card — renders below text messages that contain URLs.
//
// On mount, fetches OpenGraph meta tags from our /api/link-preview endpoint.
// While loading, shows the favicon-based fallback card (so the user sees
// something immediately). Once loaded, shows the richer card with title +
// description + image (if available).
//
// If the OG fetch fails or returns nothing useful, the fallback card stays.
export function LinkPreviewCard({
  href,
  domain,
  path,
}: {
  href: string
  domain: string
  path: string
}) {
  const [og, setOg] = useState<OgPreview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchOgPreview(href)
      .then((data) => {
        if (!cancelled) {
          setOg(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [href])

  // Rich card with OG data (title + description + image)
  if (og && (og.title || og.description)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-1.5 mb-1 flex flex-col rounded-lg border border-foreground/10 bg-foreground/[0.03] dark:bg-foreground/[0.06] hover:bg-foreground/[0.06] dark:hover:bg-foreground/[0.1] transition-colors max-w-[280px] no-underline group/link overflow-hidden"
      >
        {/* OG image (if available) */}
        {og.image && (
          <div className="w-full h-32 overflow-hidden bg-muted/30">
            <img
              src={og.image}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        )}
        <div className="p-2 flex items-start gap-2 min-w-0">
          {/* Favicon (always shown) */}
          <img
            src={faviconUrl(og.siteName || domain, 32)}
            alt=""
            width={20}
            height={20}
            className="w-5 h-5 rounded shrink-0 bg-white mt-0.5"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
          <div className="min-w-0 flex-1">
            {/* Title */}
            {og.title && (
              <div className="text-[12px] font-semibold text-foreground truncate leading-snug">
                {og.title}
              </div>
            )}
            {/* Description (truncated to 2 lines) */}
            {og.description && (
              <div className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                {og.description}
              </div>
            )}
            {/* Site name */}
            <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
              <span className="truncate">{og.siteName || domain}</span>
              <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-50 group-hover/link:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>
      </a>
    )
  }

  // Fallback card: favicon + domain + path (shown while loading or when OG
  // data is not available)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-1.5 mb-1 flex items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.03] dark:bg-foreground/[0.06] hover:bg-foreground/[0.06] dark:hover:bg-foreground/[0.1] transition-colors p-2 max-w-[280px] no-underline group/link"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 text-muted-foreground shrink-0 animate-spin" />
      ) : (
        <img
          src={faviconUrl(domain, 32)}
          alt=""
          width={20}
          height={20}
          className="w-5 h-5 rounded shrink-0 bg-white"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-foreground truncate">
          {domain}
        </div>
        {path && (
          <div className="text-[10px] text-muted-foreground truncate">
            {path}
          </div>
        )}
      </div>
      <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 opacity-50 group-hover/link:opacity-100 transition-opacity" />
    </a>
  )
}
