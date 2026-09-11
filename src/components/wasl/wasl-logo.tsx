'use client'

import { cn } from '@/lib/utils'
import { useColorTheme } from './color-theme-provider'
import { CirkleMark } from './cirkle-mark'

/**
 * WaslLogo — animated brand mark for Wasl.
 *
 * Inspired by the Cirkle brand language: a golden-teal ring containing a
 * chat bubble, with a gentle "breathe" (opacity) and "float" (translate)
 * animation. The chat bubble has three dots (typing indicator) that pulse
 * to reinforce the "messaging" identity.
 *
 * Variants:
 *  - `animated` — enables the breathe/float + dot pulse loop
 *  - `withWordmark` — renders the "Wasl" wordmark beside the mark
 *  - `monochrome` — strips gradient, uses currentColor (for light-on-dark)
 *  - `variant` — 'auto' (default) picks the palette based on the active
 *    color theme (Wasl green or Cirkle gold). Explicit 'wasl' | 'cirkle'
 *    overrides the auto detection.
 */
export function WaslLogo({
  size = 64,
  className,
  animated = true,
  withWordmark = false,
  wordmarkClassName,
  monochrome = false,
  variant = 'auto',
}: {
  size?: number
  className?: string
  animated?: boolean
  withWordmark?: boolean
  wordmarkClassName?: string
  monochrome?: boolean
  variant?: 'auto' | 'wasl' | 'cirkle'
}) {
  const { colorTheme } = useColorTheme()
  const activeVariant = variant === 'auto' ? colorTheme : variant
  const useCirkle = activeVariant === 'cirkle'
  const gradId = `wasl-grad-${monochrome ? 'mono' : useCirkle ? 'cirkle' : 'color'}`
  const ringGradId = `wasl-ring-${monochrome ? 'mono' : useCirkle ? 'cirkle' : 'color'}`

  // When the Cirkle theme is active (and not monochrome), render the imported
  // Cirkle animated orb (three interlocking rotating rings) instead of the
  // Wasl chat-bubble-in-ring design.
  if (useCirkle && !monochrome) {
    return (
      <div className={cn('flex items-center gap-2.5', className)}>
        <CirkleMark size={size} animated={animated} />
        {withWordmark && (
          <div className={cn('flex flex-col leading-none', wordmarkClassName)}>
            <span className="font-display text-[1.05em] font-semibold tracking-tight wasl-text-gradient-cirkle">
              Wasl
            </span>
            <span className="font-arabic text-[0.7em] text-muted-foreground -mt-0.5">
              وصل
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn('shrink-0', animated && 'wasl-logo-float')}
        aria-label="Wasl logo"
        role="img"
      >
        <defs>
          {monochrome ? (
            <>
              <linearGradient id={gradId} x1="0" y1="0" x2="64" y2="64">
                <stop stopColor="currentColor" />
                <stop offset="1" stopColor="currentColor" />
              </linearGradient>
              <linearGradient id={ringGradId} x1="0" y1="0" x2="64" y2="64">
                <stop stopColor="currentColor" />
                <stop offset="1" stopColor="currentColor" />
              </linearGradient>
            </>
          ) : (
            <>
              <linearGradient id={gradId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                {useCirkle ? (
                  <>
                    <stop stopColor="#E5C98A" />
                    <stop offset="0.5" stopColor="#C2A060" />
                    <stop offset="1" stopColor="#1A4A5A" />
                  </>
                ) : (
                  <>
                    <stop stopColor="#25D366" />
                    <stop offset="0.5" stopColor="#128C7E" />
                    <stop offset="1" stopColor="#075E54" />
                  </>
                )}
              </linearGradient>
              <linearGradient id={ringGradId} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
                {useCirkle ? (
                  <>
                    <stop stopColor="#C2A060" />
                    <stop offset="1" stopColor="#1A4A5A" />
                  </>
                ) : (
                  <>
                    <stop stopColor="#25D366" />
                    <stop offset="1" stopColor="#075E54" />
                  </>
                )}
              </linearGradient>
            </>
          )}
        </defs>

        {/* Outer ring (WhatsApp green→teal gradient) */}
        <circle
          cx="32"
          cy="32"
          r="29"
          stroke={`url(#${ringGradId})`}
          strokeWidth="3.5"
          fill="none"
        />
        {/* Soft inner backdrop */}
        <circle cx="32" cy="32" r="26" fill={`url(#${gradId})`} fillOpacity="0.08" />
        {/* Top-left highlight sweep */}
        <path
          d="M10 22 A 26 26 0 0 1 22 10"
          stroke={`url(#${ringGradId})`}
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
          opacity="0.6"
        />

        {/* Chat bubble (deep teal) with breathing animation */}
        <g
          className={animated ? 'wasl-logo-breathe' : undefined}
          transform="translate(16 18)"
        >
          <path
            d="M0 6C0 2.69 2.69 0 6 0h20c3.31 0 6 2.69 6 6v10c0 3.31-2.69 6-6 6H12l-7 5v-5H6c-3.31 0-6-2.69-6-6V6Z"
            fill={`url(#${gradId})`}
          />
          {/* Three typing dots */}
          <circle cx="9" cy="11" r="2" fill="#FDFCF9" className={animated ? 'wasl-logo-dot' : undefined} style={animated ? { animationDelay: '0s' } : undefined} />
          <circle cx="16" cy="11" r="2" fill="#FDFCF9" className={animated ? 'wasl-logo-dot' : undefined} style={animated ? { animationDelay: '0.18s' } : undefined} />
          <circle cx="23" cy="11" r="2" fill="#FDFCF9" className={animated ? 'wasl-logo-dot' : undefined} style={animated ? { animationDelay: '0.36s' } : undefined} />
        </g>
      </svg>
      {withWordmark && (
        <div className={cn('flex flex-col leading-none', wordmarkClassName)}>
          <span className="font-display text-[1.05em] font-semibold tracking-tight wasl-text-gradient">
            Wasl
          </span>
          <span className="font-arabic text-[0.7em] text-muted-foreground -mt-0.5">
            وصل
          </span>
        </div>
      )}
    </div>
  )
}

/** Compact static SVG favicon (no animation classes, used in layout metadata). */
export function WaslLogoFavicon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width="64"
      height="64"
    >
      <defs>
        <linearGradient id="wasl-fav-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#25D366" />
          <stop offset="0.5" stopColor="#128C7E" />
          <stop offset="1" stopColor="#075E54" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" stroke="url(#wasl-fav-grad)" strokeWidth="3.5" fill="#0B141A" />
      <g transform="translate(16 18)">
        <path d="M0 6C0 2.69 2.69 0 6 0h20c3.31 0 6 2.69 6 6v10c0 3.31-2.69 6-6 6H12l-7 5v-5H6c-3.31 0-6-2.69-6-6V6Z" fill="url(#wasl-fav-grad)" />
        <circle cx="9" cy="11" r="2" fill="#FDFCF9" />
        <circle cx="16" cy="11" r="2" fill="#FDFCF9" />
        <circle cx="23" cy="11" r="2" fill="#FDFCF9" />
      </g>
    </svg>
  )
}
