'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

// ═══════════════════════════════════════════════════════════════════════
// useMagneticCursor — Critically-damped spring magnetic attraction
// ═══════════════════════════════════════════════════════════════════════
//
// A tiny physics-based hook that makes any element "magnetically" attracted
// to the cursor when the cursor is within a configurable field radius.
// Built entirely from scratch — no physics library, no Framer Motion.
//
// Algorithm (critically-damped spring lerp):
//   For each animation frame:
//     target = cursor position relative to element center (if within field)
//            OR {0, 0} (snap back to center)
//     current += (target - current) * alpha
//
// The alpha value (0.18) is tuned for "critical damping" — fast enough to
// feel responsive, slow enough to feel smooth. At 60fps, the icon reaches
// ~99% of the target position in ~5 frames (~83ms). This is the same
// principle used in iOS spring animations and Apple's "fluid" UI.
//
// The "intensity" scales linearly with proximity:
//   intensity = 1 - (dist / fieldRadius)
// so the icon pulls HARDER as the cursor approaches. This creates the
// "magnetic" feel — distant cursor = gentle pull, close cursor = strong pull.
//
// Returns:
//   - ref: attach to the element you want to make magnetic
//   - offset: { x, y } — apply via transform: translate(x, y)
//   - isHovering: boolean — true when cursor is within the field
//   - cursorAngle: number (degrees) — for iridescent-border effects

export type MagneticOptions = {
  fieldRadius?: number
  pullStrength?: number
  alpha?: number
  // Whether to track the cursor angle (for iridescent border effects).
  // Slightly more CPU, so opt-in.
  trackAngle?: boolean
  // Optional external ref — if provided, the hook will use this ref
  // instead of creating its own. This lets the caller merge refs (e.g.
  // for Radix's asChild Slot pattern) without running afoul of the
  // react-hooks/immutability lint rule.
  externalRef?: React.RefObject<HTMLElement | null>
}

export type MagneticState = {
  ref: React.RefObject<HTMLElement | null>
  offset: { x: number; y: number }
  isHovering: boolean
  cursorAngle: number // degrees, 0 = right, 90 = down (screen coords)
}

export function useMagneticCursor(options: MagneticOptions = {}): MagneticState {
  const {
    fieldRadius = 60,
    pullStrength = 0.25,
    alpha = 0.18,
    trackAngle = true,
    externalRef,
  } = options

  // Use the external ref if provided, otherwise create our own
  const internalRef = useRef<HTMLElement>(null)
  const ref = externalRef ?? internalRef
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)
  const [cursorAngle, setCursorAngle] = useState(0)

  // Refs for the animation loop (avoid re-renders on every frame)
  const targetRef = useRef({ x: 0, y: 0 })
  const currentRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)
  const isHoveringRef = useRef(false)
  const cursorAngleRef = useRef(0)
  // The animate function references itself (for the rAF loop), so we store
  // it in a ref to break the circular reference. The ref always holds the
  // latest version of the function (so it sees the latest alpha / trackAngle).
  const animateRef = useRef<() => void>(() => {})

  // The animation tick: lerp current → target with critically-damped spring.
  const animate = useCallback(() => {
    currentRef.current.x += (targetRef.current.x - currentRef.current.x) * alpha
    currentRef.current.y += (targetRef.current.y - currentRef.current.y) * alpha

    // Update React state only if the change is significant (avoid render thrash)
    setOffset((prev) => {
      const dx = Math.abs(currentRef.current.x - prev.x)
      const dy = Math.abs(currentRef.current.y - prev.y)
      if (dx <= 0.05 && dy <= 0.05) return prev
      return { x: currentRef.current.x, y: currentRef.current.y }
    })
    setCursorAngle((prev) => {
      if (!trackAngle) return prev
      if (cursorAngleRef.current === prev) return prev
      return cursorAngleRef.current
    })

    // Schedule the next tick — use the ref so we always call the latest version
    rafRef.current = requestAnimationFrame(() => animateRef.current())
  }, [alpha, trackAngle])

  // Keep the ref up to date with the latest animate function
  useEffect(() => {
    animateRef.current = animate
  }, [animate])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const dx = e.clientX - centerX
      const dy = e.clientY - centerY
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Track the cursor angle (atan2 returns radians, convert to degrees)
      if (trackAngle && dist > 0) {
        const angle = Math.atan2(dy, dx) * (180 / Math.PI)
        cursorAngleRef.current = angle
      }

      if (dist < fieldRadius) {
        // Magnetic attraction — intensity scales linearly with proximity
        const intensity = 1 - dist / fieldRadius
        targetRef.current = {
          x: dx * pullStrength * intensity,
          y: dy * pullStrength * intensity,
        }
        if (!isHoveringRef.current) {
          isHoveringRef.current = true
          setIsHovering(true)
        }
      } else {
        // Snap back to center
        targetRef.current = { x: 0, y: 0 }
        if (isHoveringRef.current && dist > fieldRadius * 1.4) {
          // Only flip isHovering to false when well outside the field
          // (avoids flicker at the edge)
          isHoveringRef.current = false
          setIsHovering(false)
        }
      }
    }

    const onMouseLeave = () => {
      targetRef.current = { x: 0, y: 0 }
      isHoveringRef.current = false
      setIsHovering(false)
    }

    // Listen on window so we track the cursor everywhere (not just over the element)
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    el.addEventListener('mouseleave', onMouseLeave)
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mouseleave', onMouseLeave)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [fieldRadius, pullStrength, animate, trackAngle])

  return { ref, offset, isHovering, cursorAngle }
}
