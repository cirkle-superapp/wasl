'use client'

import { useState, useRef, useEffect, useCallback, ReactNode } from 'react'
import {
  Sparkles,
  Search,
  Send,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMagneticCursor } from '@/hooks/use-magnetic-cursor'
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ═══════════════════════════════════════════════════════════════════════
// SmartChatMenu — state-of-the-art chat header dropdown trigger
// ═══════════════════════════════════════════════════════════════════════
//
// Replaces the generic MoreVertical (3-dot) icon with a unique custom
// "triangle-of-dots" SVG icon wrapped in a magnetic glassmorphic button.
//
// Features (all built from scratch — no Framer Motion, no physics library):
//
//   1. Triangle-dot SVG icon — unique to Wasl (every other chat app uses
//      3 vertical dots; we use a triangle formation). Rotates 180° when
//      the dropdown is open via CSS `:has([aria-expanded=true])`.
//
//   2. Magnetic cursor attraction — the button position lerps toward the
//      cursor with a critically-damped spring (alpha=0.18, ~5-frame
//      convergence at 60fps) when the cursor is within a 70px field.
//
//   3. Particle burst on click — 8 SVG sparkles radiate outward with
//      ease-out-cubic motion + opacity fade. 600ms total duration.
//
//   4. Rotating conic-gradient ring — a subtle "AI is always processing"
//      glow that rotates 360° every 4 seconds (CSS animation).
//
//   5. Iridescent border — the border color hue shifts based on the
//      cursor's angle relative to the button center (atan2). As the
//      cursor moves around the button, the border cycles through the
//      spectrum.
//
//   6. Long-press radial menu — holding the button for 300ms reveals
//      4 quick actions arranged in a semicircle (AI summary, search,
//      insights, batch). This is separate from the regular dropdown
//      (which opens on a quick click).
//
//   7. Contextual badge — a pulsing dot in the top-right shows the
//      count of pending items (action items, scheduled batches, contact
//      requests) so the user knows there's something waiting.
//
// Integration:
//   <SmartChatMenu pendingCount={N} onQuickAction={fn}>
//     <DropdownMenuContent>
//       <DropdownMenuItem>...</DropdownMenuItem>
//     </DropdownMenuContent>
//   </SmartChatMenu>
//
//   The SmartChatMenu renders the trigger button; you pass the actual
//   dropdown content (DropdownMenuContent + items) as children. Radix
//   handles the open/close state internally; we use CSS `[aria-expanded]`
//   selectors to morph the icon when open.

type Particle = {
  id: number
  angle: number // degrees
  distance: number // px from center (animates 0 → maxDistance)
  lifetime: number // 0 → 1 (1 = death)
}

type SmartChatMenuProps = {
  children: ReactNode
  // Count of pending items to show as a badge
  pendingCount?: number
  // Optional: callbacks for the long-press radial quick-actions
  onQuickAction?: (action: 'summary' | 'search' | 'insights' | 'batch') => void
  // Optional: extra className for the button
  className?: string
}

const MAX_PARTICLES = 8
const PARTICLE_LIFETIME_MS = 600
const LONG_PRESS_MS = 300

export function SmartChatMenu({
  children,
  pendingCount = 0,
  onQuickAction,
  className,
}: SmartChatMenuProps) {
  const [particles, setParticles] = useState<Particle[]>([])
  const [longPressActive, setLongPressActive] = useState(false)
  // Controlled dropdown open state — we manage this ourselves so we can
  // distinguish between a quick click (open dropdown) and a long-press
  // (show radial menu instead).
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const longPressTimerRef = useRef<number | null>(null)
  const hasFiredRef = useRef(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // ── Magnetic cursor attraction ────────────────────────────────────────
  // We pass our own buttonRef to the hook via the externalRef option,
  // so the hook uses OUR ref (which is mutable from our perspective).
  // This avoids the react-hooks/immutability lint rule that prevents
  // modifying refs returned from hooks.
  const { offset, isHovering, cursorAngle } = useMagneticCursor({
    fieldRadius: 70,
    pullStrength: 0.22,
    alpha: 0.18,
    trackAngle: true,
    externalRef: buttonRef as React.RefObject<HTMLElement | null>,
  })

  // Ref callback that lets Radix's `asChild` Slot attach its own ref while
  // we also keep a reference for ourselves (used by the long-press
  // outside-click detection).
  const setRef = useCallback((el: HTMLButtonElement | null) => {
    buttonRef.current = el
  }, [])

  // ── Iridescent border color (hue shifts with cursor angle) ───────────
  // atan2 returns -180 to 180. Normalize to 0-360. Use the angle directly
  // as the hue for a smooth rainbow rotation as the cursor moves around.
  const iridescentHue = ((cursorAngle + 180) % 360 + 360) % 360
  const iridescentColor = `hsl(${iridescentHue}, 65%, 55%)`
  const iridescentGlow = `hsla(${iridescentHue}, 65%, 55%, 0.4)`

  // ── Particle burst on click ──────────────────────────────────────────
  // 8 particles spread evenly (every 45deg), each animates from center
  // outward over 600ms with ease-out-cubic + opacity fade.
  const triggerParticleBurst = useCallback(() => {
    const burstId = Date.now()
    const newParticles: Particle[] = Array.from({ length: MAX_PARTICLES }, (_, i) => ({
      id: burstId + i,
      angle: (i * 360) / MAX_PARTICLES,
      distance: 0,
      lifetime: 0,
    }))
    setParticles(newParticles)

    const startTime = performance.now()
    let rafId: number
    const maxDistance = 36 // px from button center

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / PARTICLE_LIFETIME_MS)
      // Ease-out cubic for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3)
      setParticles((prev) =>
        prev.map((p) => ({
          ...p,
          distance: eased * maxDistance,
          lifetime: progress,
        })),
      )
      if (progress < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        // Clear particles after the animation completes
        setParticles([])
      }
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // ── Long-press detection ──────────────────────────────────────────────
  // We differentiate between a click (quick tap) and a long-press (300ms+).
  // On long-press, we open the radial quick-actions menu instead of the
  // regular dropdown.
  //
  // CRITICAL: we call preventDefault() on pointerdown to stop Radix's
  // DropdownMenuTrigger from opening the dropdown prematurely (which
  // would conflict with the long-press radial menu). Then on pointerup,
  // if it was a short tap, we manually toggle the dropdown.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only respond to primary button (left click / touch)
    if (e.button !== 0) return
    // Prevent Radix from opening the dropdown on pointerdown — we'll
    // manage the open state ourselves based on whether this was a short
    // tap or a long-press.
    e.preventDefault()
    hasFiredRef.current = false
    longPressTimerRef.current = window.setTimeout(() => {
      if (!hasFiredRef.current) {
        hasFiredRef.current = true
        setLongPressActive(true)
        // Haptic-like visual feedback: trigger a particle burst
        triggerParticleBurst()
      }
    }, LONG_PRESS_MS)
  }, [triggerParticleBurst])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    // If the long-press already fired, don't trigger click
    if (hasFiredRef.current) return
    hasFiredRef.current = true
    // Regular click → particle burst + toggle dropdown
    triggerParticleBurst()
    setDropdownOpen((prev) => !prev)
  }, [triggerParticleBurst])

  const handlePointerLeave = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    }
  }, [])

  // Close the radial menu when clicking outside
  useEffect(() => {
    if (!longPressActive) return
    const onClick = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setLongPressActive(false)
      }
    }
    // Defer attaching so the click that triggered the long-press doesn't
    // immediately close it
    const id = window.setTimeout(() => {
      window.addEventListener('click', onClick)
    }, 100)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('click', onClick)
    }
  }, [longPressActive])

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <div className="relative">
        <DropdownMenuTrigger asChild>
          <button
            ref={setRef}
            type="button"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onPointerCancel={handlePointerLeave}
            aria-label="Chat actions"
            title="Actions · long-press for quick actions"
            className={cn('wasl-smart-menu-button relative flex items-center justify-center w-9 h-9 rounded-full', className)}
            style={{
              transform: `translate(${offset.x.toFixed(2)}px, ${offset.y.toFixed(2)}px)`,
              ['--iridescent-color' as any]: iridescentColor,
              ['--iridescent-glow' as any]: iridescentGlow,
            }}
          >
            {/* Rotating conic-gradient ring */}
            <span className="wasl-smart-menu-ring" aria-hidden />

            {/* Particle burst overlay */}
            {particles.length > 0 && (
              <span className="wasl-smart-menu-particles" aria-hidden>
                {particles.map((p) => {
                  const rad = (p.angle * Math.PI) / 180
                  const x = Math.cos(rad) * p.distance
                  const y = Math.sin(rad) * p.distance
                  return (
                    <span
                      key={p.id}
                      className="wasl-smart-menu-particle"
                      style={{
                        transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${1 - p.lifetime})`,
                        opacity: 1 - p.lifetime,
                      }}
                    />
                  )
                })}
              </span>
            )}

            {/* Custom triangle-dot SVG icon */}
            <SmartMenuIcon isHovering={isHovering} />

            {/* Contextual badge (pending items) */}
            {pendingCount > 0 && (
              <span
                className="wasl-smart-menu-badge"
                aria-label={`${pendingCount} pending item${pendingCount === 1 ? '' : 's'}`}
              >
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>

        {/* Long-press radial quick-actions menu */}
        {longPressActive && onQuickAction && (
          <div className="wasl-radial-menu" role="menu" aria-label="Quick actions">
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close quick actions"
              onClick={() => setLongPressActive(false)}
              tabIndex={-1}
            />
            {RADIAL_ACTIONS.map((action, i) => {
              const Icon = action.icon
              // Arrange in a QUARTER-CIRCLE on the LEFT-DOWN side of the
              // button (natural direction for a button in the top-right
              // corner — items radiate toward the chat content area).
              // 4 actions span 0° (straight left) to 90° (straight down).
              const angle = (i * 90) / (RADIAL_ACTIONS.length - 1)
              const rad = (angle * Math.PI) / 180
              const radius = 60 // px from button center
              // cos(angle) is positive (0 to 1) → x = -cos*radius is negative (leftward)
              // sin(angle) is positive (0 to 1) → y = sin*radius is positive (downward)
              const x = -Math.cos(rad) * radius
              const y = Math.sin(rad) * radius
              return (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  aria-label={action.label}
                  title={action.label}
                  className="wasl-radial-menu-item"
                  style={{
                    transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`,
                    animationDelay: `${i * 40}ms`,
                  }}
                  onClick={() => {
                    onQuickAction(action.id as any)
                    setLongPressActive(false)
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              )
            })}
          </div>
        )}

        {/* Render the parent's dropdown content (existing DropdownMenuContent) */}
        {children}
      </div>
    </DropdownMenu>
  )
}

// ── Custom triangle-dot SVG icon ─────────────────────────────────────────
// Three dots arranged in a triangle formation (top-center, bottom-left,
// bottom-right). Unique to Wasl — no other chat app uses this shape.
//
// Morph states (handled in CSS via [aria-expanded] selectors on the parent
// button, so we don't need React state):
//   • Closed: triangle pointing DOWN (3 dots at top-center, bottom-left, bottom-right)
//   • Hovered: rotates 30° (subtle "I'm alive" cue)
//   • Open: rotates 180° (triangle points UP — visually communicates "open")
function SmartMenuIcon({ isHovering }: { isHovering: boolean }) {
  // The CSS handles the rotation based on the parent button's aria-expanded
  // state. We add the isHovering class for the subtle hover-rotate.
  // Note: we set explicit width/height inline + flex-shrink: 0 because
  // Tailwind's `w-5 h-5` was being overridden by the parent's flex layout
  // (the SVG was rendering at 2×20px instead of 20×20px).
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      width={20}
      height={20}
      className={cn('wasl-smart-menu-icon', isHovering && 'is-hovering')}
      style={{ width: 20, height: 20, flex: '0 0 20px' }}
      aria-hidden
    >
      {/* Triangle of dots — top center */}
      <circle cx="12" cy="6.5" r="2.4" className="wasl-smart-menu-dot wasl-smart-menu-dot-1" />
      {/* Bottom left */}
      <circle cx="6.8" cy="15.8" r="2.4" className="wasl-smart-menu-dot wasl-smart-menu-dot-2" />
      {/* Bottom right */}
      <circle cx="17.2" cy="15.8" r="2.4" className="wasl-smart-menu-dot wasl-smart-menu-dot-3" />
    </svg>
  )
}

// ── Radial quick-actions ─────────────────────────────────────────────────
const RADIAL_ACTIONS = [
  { id: 'summary', label: 'AI summary', icon: Sparkles },
  { id: 'search', label: 'Search messages', icon: Search },
  { id: 'insights', label: 'Chat insights', icon: BarChart3 },
  { id: 'batch', label: 'Schedule batch', icon: Send },
] as const
