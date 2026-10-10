'use client'

import type { CSSProperties } from 'react'

// ═══════════════════════════════════════════════════════════════════════
// Wasl Icon System — State-of-the-art duotone SVG icons (Task 95)
// ═══════════════════════════════════════════════════════════════════════
//
// Hand-crafted SVG icons with a "duotone" design language:
//   • Layer 1: soft rounded background shape (low-opacity brand color)
//   • Layer 2: bold foreground stroke (full-opacity brand color)
//   • Gradient definitions using Wasl's brand palette
//
// No external icon library. Every path is hand-drawn for a unique,
// premium look that stands out from the generic lucide-react icons
// used by every other chat app.
//
// Design language:
//   • 24×24 viewBox
//   • 2px stroke width (rounded)
//   • Rounded line caps + joins
//   • Gradient fills (teal→green or gold→amber)
//   • Soft background blob for duotone depth
//
// Inspired by: Linear, Vercel, Stripe, Arc Browser icon systems.

type IconProps = {
  size?: number
  className?: string
  style?: CSSProperties
}

// Brand colors (solid — more reliable than gradient URLs across browsers)
const TEAL_GRADIENT = '#009588'
const GOLD_GRADIENT = '#C2A060'
const ROSE_GRADIENT = '#E8466E'
const BLUE_GRADIENT = '#3B82F6'

// Shared gradient definitions (rendered once, referenced by id)
export function WaslIconGradients() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <linearGradient id={TEAL_GRADIENT} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#009588" />
          <stop offset="100%" stopColor="#00C897" />
        </linearGradient>
        <linearGradient id={GOLD_GRADIENT} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C2A060" />
          <stop offset="100%" stopColor="#E5C98A" />
        </linearGradient>
        <linearGradient id={ROSE_GRADIENT} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E8466E" />
          <stop offset="100%" stopColor="#F5708C" />
        </linearGradient>
        <linearGradient id={BLUE_GRADIENT} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// ── Helper: wraps the SVG with consistent props ──────────────────────────
function IconShell({
  size = 20,
  className,
  style,
  children,
}: {
  size?: number
  className?: string
  style?: CSSProperties
  children: React.ReactNode
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
      aria-hidden
    >
      {children}
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Chat header icons
// ═══════════════════════════════════════════════════════════════════════

/** Video call — modern camera with lens + signal waves */
export function WaslVideoCall({ size = 20, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Soft background blob */}
      <rect x="2" y="6" width="14" height="12" rx="4" fill={TEAL_GRADIENT} opacity="0.12" />
      {/* Camera body */}
      <rect x="2" y="6" width="14" height="12" rx="4" stroke={TEAL_GRADIENT} strokeWidth="2" strokeLinejoin="round" />
      {/* Lens flare */}
      <path d="M16 10l5-3v10l-5-3" stroke={TEAL_GRADIENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Inner lens dot */}
      <circle cx="9" cy="12" r="2" fill={TEAL_GRADIENT} opacity="0.5" />
    </IconShell>
  )
}

/** Phone call — modern phone with signal waves */
export function WaslPhoneCall({ size = 20, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Signal waves (background) */}
      <path d="M16 4c2 1 3 3 3 5" stroke={TEAL_GRADIENT} strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      <path d="M18 2c3 1.5 4.5 4.5 4.5 7.5" stroke={TEAL_GRADIENT} strokeWidth="2" strokeLinecap="round" opacity="0.15" />
      {/* Phone body */}
      <path
        d="M5 3c-1 0-2 1-2 2v1c0 8 6 14 14 14h1c1 0 2-1 2-2v-2.5c0-.5-.3-1-.8-1.2l-3.2-1.6c-.5-.3-1.1-.2-1.5.2l-1.3 1.3c-2-1-4-3-5-5l1.3-1.3c.4-.4.5-1 .2-1.5L7.2 3.8C7 3.3 6.5 3 6 3H5z"
        fill={TEAL_GRADIENT}
        opacity="0.15"
      />
      <path
        d="M5 3c-1 0-2 1-2 2v1c0 8 6 14 14 14h1c1 0 2-1 2-2v-2.5c0-.5-.3-1-.8-1.2l-3.2-1.6c-.5-.3-1.1-.2-1.5.2l-1.3 1.3c-2-1-4-3-5-5l1.3-1.3c.4-.4.5-1 .2-1.5L7.2 3.8C7 3.3 6.5 3 6 3H5z"
        stroke={TEAL_GRADIENT}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </IconShell>
  )
}

/** Search — magnifier with gradient handle */
export function WaslSearch({ size = 20, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Background glow */}
      <circle cx="11" cy="11" r="7" fill={GOLD_GRADIENT} opacity="0.1" />
      {/* Lens ring */}
      <circle cx="11" cy="11" r="7" stroke={GOLD_GRADIENT} strokeWidth="2" />
      {/* Inner highlight */}
      <circle cx="9" cy="9" r="2" fill={GOLD_GRADIENT} opacity="0.3" />
      {/* Handle */}
      <path d="M16 16l4.5 4.5" stroke={GOLD_GRADIENT} strokeWidth="2.5" strokeLinecap="round" />
    </IconShell>
  )
}

/** Back arrow (mobile) — with motion trail */
export function WaslArrowLeft({ size = 20, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Motion trail */}
      <path d="M20 12H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" strokeDasharray="2 3" />
      {/* Arrow */}
      <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Arrow head fill */}
      <path d="M8 12l6-6v3l-3 3 3 3v3l-6-6z" fill="currentColor" opacity="0.1" />
    </IconShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Dropdown menu icons
// ═══════════════════════════════════════════════════════════════════════

/** Contact info — gradient info circle */
export function WaslInfo({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      <circle cx="12" cy="12" r="9" fill={BLUE_GRADIENT} opacity="0.1" />
      <circle cx="12" cy="12" r="9" stroke={BLUE_GRADIENT} strokeWidth="2" />
      <circle cx="12" cy="8" r="1.2" fill={BLUE_GRADIENT} />
      <path d="M12 11v6" stroke={BLUE_GRADIENT} strokeWidth="2" strokeLinecap="round" />
    </IconShell>
  )
}

/** AI Sparkles — modern 4-point star with gradient */
export function WaslSparkles({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Main sparkle */}
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" fill={TEAL_GRADIENT} opacity="0.2" />
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" stroke={TEAL_GRADIENT} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Small sparkle */}
      <path d="M18 14l.7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14z" fill={TEAL_GRADIENT} opacity="0.5" />
    </IconShell>
  )
}

/** Chat insights — modern bar chart with gradient */
export function WaslChart({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Background bars */}
      <rect x="4" y="12" width="3" height="8" rx="1.5" fill={TEAL_GRADIENT} opacity="0.15" />
      <rect x="10.5" y="8" width="3" height="12" rx="1.5" fill={TEAL_GRADIENT} opacity="0.15" />
      <rect x="17" y="4" width="3" height="16" rx="1.5" fill={TEAL_GRADIENT} opacity="0.15" />
      {/* Foreground bars */}
      <rect x="4" y="14" width="3" height="6" rx="1.5" stroke={TEAL_GRADIENT} strokeWidth="1.5" />
      <rect x="10.5" y="10" width="3" height="10" rx="1.5" stroke={TEAL_GRADIENT} strokeWidth="1.5" />
      <rect x="17" y="6" width="3" height="14" rx="1.5" stroke={TEAL_GRADIENT} strokeWidth="1.5" />
    </IconShell>
  )
}

/** Health score — modern heart with pulse */
export function WaslHeart({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Background heart */}
      <path d="M12 21s-7-4.5-7-10c0-2.5 2-4.5 4.5-4.5 1.5 0 2.5.5 2.5 1.5 0-1 1-1.5 2.5-1.5C17 6.5 19 8.5 19 11c0 5.5-7 10-7 10z" fill={ROSE_GRADIENT} opacity="0.12" />
      {/* Heart outline */}
      <path d="M12 21s-7-4.5-7-10c0-2.5 2-4.5 4.5-4.5 1.5 0 2.5.5 2.5 1.5 0-1 1-1.5 2.5-1.5C17 6.5 19 8.5 19 11c0 5.5-7 10-7 10z" stroke={ROSE_GRADIENT} strokeWidth="2" strokeLinejoin="round" />
      {/* Pulse line */}
      <path d="M8 12h2l1-3 2 5 1-2h2" stroke={ROSE_GRADIENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </IconShell>
  )
}

/** Action items — modern checklist with gradient */
export function WaslChecklist({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Background items */}
      <rect x="3" y="4" width="6" height="6" rx="2" fill={GOLD_GRADIENT} opacity="0.1" />
      <rect x="3" y="14" width="6" height="6" rx="2" fill={GOLD_GRADIENT} opacity="0.1" />
      {/* Checkmarks */}
      <path d="M4.5 7l1.5 1.5L8 5.5" stroke={GOLD_GRADIENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 17l1.5 1.5L8 15.5" stroke={GOLD_GRADIENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Lines */}
      <path d="M12 7h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M12 17h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    </IconShell>
  )
}

/** Tone adjuster — modern wand with sparkle */
export function WaslWand({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Wand body */}
      <path d="M4 20L14 10" stroke={GOLD_GRADIENT} strokeWidth="2.5" strokeLinecap="round" />
      {/* Wand tip */}
      <rect x="13" y="8" width="4" height="4" rx="1" transform="rotate(45 15 10)" fill={GOLD_GRADIENT} opacity="0.3" />
      <rect x="13" y="8" width="4" height="4" rx="1" transform="rotate(45 15 10)" stroke={GOLD_GRADIENT} strokeWidth="1.5" />
      {/* Sparkles */}
      <path d="M18 3l.8 2.2L21 6l-2.2.8L18 9l-.8-2.2L15 6l2.2-.8L18 3z" fill={GOLD_GRADIENT} opacity="0.5" />
      <circle cx="8" cy="5" r="1" fill={GOLD_GRADIENT} opacity="0.4" />
    </IconShell>
  )
}

/** Send / Schedule — modern paper plane with trail */
export function WaslSend({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Trail */}
      <path d="M4 12L20 4" stroke={TEAL_GRADIENT} strokeWidth="1" strokeDasharray="1 4" opacity="0.3" />
      {/* Plane body */}
      <path d="M20 4L4 12l6 2 2 6 8-16z" fill={TEAL_GRADIENT} opacity="0.15" />
      <path d="M20 4L4 12l6 2 2 6 8-16z" stroke={TEAL_GRADIENT} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Inner fold line */}
      <path d="M10 14l4-4" stroke={TEAL_GRADIENT} strokeWidth="1.5" strokeLinecap="round" />
    </IconShell>
  )
}

/** Copy — modern copy squares with gradient */
export function WaslCopy({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Background square */}
      <rect x="8" y="8" width="12" height="12" rx="3" fill={BLUE_GRADIENT} opacity="0.1" />
      <rect x="8" y="8" width="12" height="12" rx="3" stroke={BLUE_GRADIENT} strokeWidth="2" />
      {/* Front square */}
      <rect x="4" y="4" width="12" height="12" rx="3" fill="white" fillOpacity="0.8" />
      <rect x="4" y="4" width="12" height="12" rx="3" stroke={BLUE_GRADIENT} strokeWidth="2" />
    </IconShell>
  )
}

/** Lock — modern shield/lock hybrid */
export function WaslLock({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Background */}
      <rect x="5" y="10" width="14" height="11" rx="3" fill={GOLD_GRADIENT} opacity="0.1" />
      {/* Lock body */}
      <rect x="5" y="10" width="14" height="11" rx="3" stroke={GOLD_GRADIENT} strokeWidth="2" />
      {/* Shackle */}
      <path d="M8 10V7c0-2 2-4 4-4s4 2 4 4v3" stroke={GOLD_GRADIENT} strokeWidth="2" strokeLinecap="round" />
      {/* Keyhole */}
      <circle cx="12" cy="15" r="1.5" fill={GOLD_GRADIENT} />
      <path d="M12 16.5V18" stroke={GOLD_GRADIENT} strokeWidth="1.5" strokeLinecap="round" />
    </IconShell>
  )
}

/** Trash / Delete — modern trash with gradient */
export function WaslTrash({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Background bin */}
      <path d="M6 7h12l-1 14c0 1-1 2-2 2H9c-1 0-2-1-2-2L6 7z" fill={ROSE_GRADIENT} opacity="0.08" />
      <path d="M6 7h12l-1 14c0 1-1 2-2 2H9c-1 0-2-1-2-2L6 7z" stroke={ROSE_GRADIENT} strokeWidth="2" strokeLinejoin="round" />
      {/* Lid */}
      <path d="M4 7h16" stroke={ROSE_GRADIENT} strokeWidth="2" strokeLinecap="round" />
      {/* Handle */}
      <path d="M10 4h4" stroke={ROSE_GRADIENT} strokeWidth="2" strokeLinecap="round" />
      {/* Lines */}
      <path d="M10 11v6M14 11v6" stroke={ROSE_GRADIENT} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </IconShell>
  )
}

/** Timer — modern stopwatch with gradient */
export function WaslTimer({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Background circle */}
      <circle cx="12" cy="14" r="7" fill={GOLD_GRADIENT} opacity="0.1" />
      <circle cx="12" cy="14" r="7" stroke={GOLD_GRADIENT} strokeWidth="2" />
      {/* Top button */}
      <path d="M10 4h4" stroke={GOLD_GRADIENT} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 4V7" stroke={GOLD_GRADIENT} strokeWidth="2" strokeLinecap="round" />
      {/* Clock hand */}
      <path d="M12 14l3-2" stroke={GOLD_GRADIENT} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="14" r="1" fill={GOLD_GRADIENT} />
    </IconShell>
  )
}

/** Users / Group — modern people icon */
export function WaslUsers({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      {/* Background */}
      <circle cx="9" cy="8" r="3.5" fill={TEAL_GRADIENT} opacity="0.1" />
      <circle cx="9" cy="8" r="3.5" stroke={TEAL_GRADIENT} strokeWidth="2" />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5" stroke={TEAL_GRADIENT} strokeWidth="2" strokeLinecap="round" />
      {/* Second person */}
      <circle cx="17" cy="9" r="2.5" fill={TEAL_GRADIENT} opacity="0.1" />
      <circle cx="17" cy="9" r="2.5" stroke={TEAL_GRADIENT} strokeWidth="1.5" opacity="0.6" />
      <path d="M15 20c0-2 1.5-4 3.5-4s3.5 2 3.5 4" stroke={TEAL_GRADIENT} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </IconShell>
  )
}

/** Paperclip — modern attachment */
export function WaslPaperclip({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      <path d="M16 8l-7 7c-1.5 1.5-4 1.5-5.5 0s-1.5-4 0-5.5l7-7c1-1 2.5-1 3.5 0s1 2.5 0 3.5l-7 7c-.5.5-1.5.5-2 0s-.5-1.5 0-2l6-6" stroke={GOLD_GRADIENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </IconShell>
  )
}

/** Pin — modern pin with gradient */
export function WaslPin({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      <path d="M12 2c-3 0-5 2-5 5 0 3 2 4 2 7h6c0-3 2-4 2-7 0-3-2-5-5-5z" fill={GOLD_GRADIENT} opacity="0.15" />
      <path d="M12 2c-3 0-5 2-5 5 0 3 2 4 2 7h6c0-3 2-4 2-7 0-3-2-5-5-5z" stroke={GOLD_GRADIENT} strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 14v8" stroke={GOLD_GRADIENT} strokeWidth="2" strokeLinecap="round" />
    </IconShell>
  )
}

/** Chevron down — modern chevron with gradient shadow */
export function WaslChevronDown({ size = 16, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      <path d="M6 10l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.2" transform="translate(0 2)" />
    </IconShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Sidebar icons
// ═══════════════════════════════════════════════════════════════════════

/** New chat — modern plus with gradient circle */
export function WaslPlus({ size = 20, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      <circle cx="12" cy="12" r="9" fill={TEAL_GRADIENT} opacity="0.1" />
      <path d="M12 7v10M7 12h10" stroke={TEAL_GRADIENT} strokeWidth="2.5" strokeLinecap="round" />
    </IconShell>
  )
}

/** Settings — modern gear with gradient */
export function WaslSettings({ size = 20, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      <circle cx="12" cy="12" r="3.5" fill={GOLD_GRADIENT} opacity="0.15" />
      <circle cx="12" cy="12" r="3.5" stroke={GOLD_GRADIENT} strokeWidth="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M5 19l2-2" stroke={GOLD_GRADIENT} strokeWidth="2" strokeLinecap="round" />
    </IconShell>
  )
}

/** Announcements — modern building with gradient */
export function WaslAnnounce({ size = 20, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      <rect x="4" y="8" width="16" height="12" rx="2" fill={TEAL_GRADIENT} opacity="0.1" />
      <rect x="4" y="8" width="16" height="12" rx="2" stroke={TEAL_GRADIENT} strokeWidth="2" />
      <path d="M8 8V5c0-1 1-2 2-2h4c1 0 2 1 2 2v3" stroke={TEAL_GRADIENT} strokeWidth="2" strokeLinecap="round" />
      <path d="M9 14h6" stroke={TEAL_GRADIENT} strokeWidth="1.5" strokeLinecap="round" />
    </IconShell>
  )
}

/** Contacts — modern address book with gradient */
export function WaslContact({ size = 20, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      <rect x="4" y="3" width="16" height="18" rx="3" fill={BLUE_GRADIENT} opacity="0.08" />
      <rect x="4" y="3" width="16" height="18" rx="3" stroke={BLUE_GRADIENT} strokeWidth="2" />
      <circle cx="12" cy="10" r="3" fill={BLUE_GRADIENT} opacity="0.15" />
      <circle cx="12" cy="10" r="3" stroke={BLUE_GRADIENT} strokeWidth="1.5" />
      <path d="M7 17c0-2.5 2.5-4 5-4s5 1.5 5 4" stroke={BLUE_GRADIENT} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 7h1M7 10h1M7 13h1" stroke={BLUE_GRADIENT} strokeWidth="1.5" strokeLinecap="round" />
    </IconShell>
  )
}

/** Bookmarks — modern bookmark with gradient */
export function WaslBookmark({ size = 20, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      <path d="M6 3h12v18l-6-4-6 4V3z" fill={GOLD_GRADIENT} opacity="0.1" />
      <path d="M6 3h12v18l-6-4-6 4V3z" stroke={GOLD_GRADIENT} strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 9h4M10 13h4" stroke={GOLD_GRADIENT} strokeWidth="1.5" strokeLinecap="round" />
    </IconShell>
  )
}

/** Bell — modern notification bell with gradient */
export function WaslBell({ size = 20, className, style }: IconProps) {
  return (
    <IconShell size={size} className={className} style={style}>
      <path d="M6 16c0-4 2-8 6-8s6 4 6 8v2H6v-2z" fill={TEAL_GRADIENT} opacity="0.1" />
      <path d="M6 16c0-4 2-8 6-8s6 4 6 8v2H6v-2z" stroke={TEAL_GRADIENT} strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 18h16" stroke={TEAL_GRADIENT} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 20c0 1 .9 2 2 2s2-1 2-2" stroke={TEAL_GRADIENT} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="7" r="1.5" fill={TEAL_GRADIENT} opacity="0.5" />
    </IconShell>
  )
}
