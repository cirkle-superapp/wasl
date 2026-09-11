'use client'

import { cn } from '@/lib/utils'

/**
 * CirkleMark — the animated Cirkle brand orb (imported from Cirkle's
 * src/components/brand/circle-mark.tsx).
 *
 * Three interlocking golden rings (representing the circles/social concept)
 * rotating slowly around a central dot. The gradient runs gold → rose → teal
 * (Cirkle's signature palette).
 *
 * Animations:
 *  - `wasl-cirkle-spin` — 30s linear rotation of the ring group
 *  - `wasl-cirkle-pulse-glow` — 2.5s gold halo pulse on the center dot
 *  - `wasl-cirkle-splash-in` — optional one-shot scale+blur entrance (splash)
 *
 * Props:
 *  - `size` — pixel size (default 40)
 *  - `animated` — enable the rotation + glow (default true)
 *  - `splash` — play the one-shot splash-in entrance (default false)
 *  - `className` — extra classes
 */
export function CirkleMark({
  size = 40,
  animated = true,
  splash = false,
  className,
}: {
  size?: number
  animated?: boolean
  splash?: boolean
  className?: string
}) {
  // Unique gradient id per instance to avoid collisions when multiple marks
  // are on the same page (sidebar header + chat empty state).
  const gradId = `cirkle-grad-${Math.random().toString(36).slice(2, 8)}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        'shrink-0',
        animated && 'wasl-cirkle-spin',
        splash && 'wasl-cirkle-splash-in',
        className
      )}
      aria-label="Cirkle mark"
      role="img"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E5C98A" />
          <stop offset="50%" stopColor="#C25A6E" />
          <stop offset="100%" stopColor="#1A4A5A" />
        </linearGradient>
      </defs>
      {/* Three interlocking rings — Cirkle's signature orb */}
      <circle cx="50" cy="32" r="22" stroke={`url(#${gradId})`} strokeWidth="1.5" opacity="0.9" />
      <circle cx="32" cy="60" r="22" stroke={`url(#${gradId})`} strokeWidth="1.5" opacity="0.9" />
      <circle cx="68" cy="60" r="22" stroke={`url(#${gradId})`} strokeWidth="1.5" opacity="0.9" />
      {/* Center dot with pulse glow */}
      <circle
        cx="50"
        cy="50"
        r="6"
        fill={`url(#${gradId})`}
        className={animated ? 'wasl-cirkle-pulse-glow' : undefined}
      />
    </svg>
  )
}

/**
 * CirkleMarkFavicon — static (non-animated) version of the Cirkle orb for
 * use as a favicon / PWA icon.
 */
export function CirkleMarkFavicon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width="100"
      height="100"
    >
      <defs>
        <linearGradient id="cirkle-fav-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E5C98A" />
          <stop offset="50%" stopColor="#C25A6E" />
          <stop offset="100%" stopColor="#1A4A5A" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill="#1A1A14" />
      <circle cx="50" cy="32" r="22" stroke="url(#cirkle-fav-grad)" strokeWidth="1.5" opacity="0.9" />
      <circle cx="32" cy="60" r="22" stroke="url(#cirkle-fav-grad)" strokeWidth="1.5" opacity="0.9" />
      <circle cx="68" cy="60" r="22" stroke="url(#cirkle-fav-grad)" strokeWidth="1.5" opacity="0.9" />
      <circle cx="50" cy="50" r="6" fill="url(#cirkle-fav-grad)" />
    </svg>
  )
}
