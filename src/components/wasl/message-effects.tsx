'use client'

import { useEffect, useRef } from 'react'

// ═══════════════════════════════════════════════════════════════════════
// MessageEffects — Canvas-based particle effects (Task 96)
// ═══════════════════════════════════════════════════════════════════════
//
// iMessage-style message effects built entirely from scratch using the
// Canvas API + requestAnimationFrame. NO external animation library.
//
// Effects:
//   • confetti — colorful rectangles falling with gravity + rotation
//   • hearts — heart shapes floating upward with sway
//   • sparkles — 4-point stars twinkling + fading
//   • fireworks — burst from center with radial particles
//   • balloons — small circles rising with string
//   • stars — 5-point stars rotating + settling
//
// Each effect runs for ~3 seconds, then the component self-removes.

export type EffectType = 'confetti' | 'hearts' | 'sparkles' | 'fireworks' | 'balloons' | 'stars'

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  vr: number
  size: number
  color: string
  alpha: number
  shape: 'rect' | 'circle' | 'star' | 'heart'
}

const EFFECT_DURATIONS = 3000 // ms
const COLORS = ['#009588', '#C2A060', '#E8466E', '#3B82F6', '#F59E0B', '#8B5CF6', '#10B981']

export function MessageEffect({ effect, onComplete }: { effect: EffectType; onComplete?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    // Use a non-null typed reference for use inside the rAF closure
    // (TypeScript can't narrow through async callbacks)
    const c: CanvasRenderingContext2D = ctx

    const parent = canvas.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const w = rect.width
    const h = rect.height
    canvas.width = w
    canvas.height = h

    const cx = w / 2
    const cy = h / 2
    const particles: Particle[] = []

    // Initialize particles based on effect type
    const count = effect === 'fireworks' ? 24 : 16
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const speed = 2 + Math.random() * 3
      let p: Particle

      switch (effect) {
        case 'confetti':
          p = {
            x: cx + (Math.random() - 0.5) * w * 0.3,
            y: cy,
            vx: (Math.random() - 0.5) * 4,
            vy: -3 - Math.random() * 4,
            rotation: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.3,
            size: 4 + Math.random() * 4,
            color: COLORS[i % COLORS.length],
            alpha: 1,
            shape: 'rect',
          }
          break
        case 'hearts':
          p = {
            x: cx + (Math.random() - 0.5) * 30,
            y: cy,
            vx: (Math.random() - 0.5) * 1.5,
            vy: -2 - Math.random() * 2,
            rotation: 0,
            vr: 0,
            size: 8 + Math.random() * 6,
            color: ['#E8466E', '#F5708C', '#FF6B9D'][i % 3],
            alpha: 1,
            shape: 'heart',
          }
          break
        case 'sparkles':
          p = {
            x: cx + Math.cos(angle) * 20,
            y: cy + Math.sin(angle) * 20,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            rotation: 0,
            vr: 0,
            size: 3 + Math.random() * 5,
            color: ['#C2A060', '#E5C98A', '#FDE68A'][i % 3],
            alpha: 1,
            shape: 'star',
          }
          break
        case 'fireworks':
          p = {
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed * 1.5,
            vy: Math.sin(angle) * speed * 1.5,
            rotation: 0,
            vr: 0,
            size: 2 + Math.random() * 3,
            color: COLORS[i % COLORS.length],
            alpha: 1,
            shape: 'circle',
          }
          break
        case 'balloons':
          p = {
            x: cx + (Math.random() - 0.5) * 40,
            y: cy + 10,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -1.5 - Math.random() * 1.5,
            rotation: 0,
            vr: 0,
            size: 6 + Math.random() * 4,
            color: COLORS[i % COLORS.length],
            alpha: 1,
            shape: 'circle',
          }
          break
        case 'stars':
          p = {
            x: cx + Math.cos(angle) * 15,
            y: cy + Math.sin(angle) * 15,
            vx: Math.cos(angle) * speed * 0.5,
            vy: Math.sin(angle) * speed * 0.5,
            rotation: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.1,
            size: 5 + Math.random() * 4,
            color: COLORS[i % COLORS.length],
            alpha: 1,
            shape: 'star',
          }
          break
      }
      particles.push(p)
    }

    const startTime = performance.now()
    let rafId: number

    function draw(now: number) {
      const elapsed = now - startTime
      const progress = elapsed / EFFECT_DURATIONS
      c.clearRect(0, 0, w, h)

      for (const p of particles) {
        // Apply physics
        p.x += p.vx
        p.y += p.vy
        p.rotation += p.vr

        // Effect-specific physics
        if (effect === 'confetti') {
          p.vy += 0.15 // gravity
          p.alpha = 1 - progress * 0.8
        } else if (effect === 'hearts' || effect === 'balloons') {
          p.vx += Math.sin(elapsed * 0.003 + p.x) * 0.05 // sway
          p.alpha = 1 - progress * 0.7
        } else if (effect === 'sparkles' || effect === 'stars') {
          p.vx *= 0.96 // friction
          p.vy *= 0.96
          p.alpha = 1 - progress
        } else if (effect === 'fireworks') {
          p.vy += 0.08 // slight gravity
          p.vx *= 0.97
          p.vy *= 0.97
          p.alpha = 1 - progress * 1.2
        }

        if (p.alpha <= 0) continue

        c.save()
        c.globalAlpha = Math.max(0, p.alpha)
        c.translate(p.x, p.y)
        c.rotate(p.rotation)
        c.fillStyle = p.color

        switch (p.shape) {
          case 'rect':
            c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5)
            break
          case 'circle':
            c.beginPath()
            c.arc(0, 0, p.size, 0, Math.PI * 2)
            c.fill()
            break
          case 'star':
            drawStar(c, p.size)
            break
          case 'heart':
            drawHeart(c, p.size)
            break
        }
        c.restore()
      }

      if (progress < 1) {
        rafId = requestAnimationFrame(draw)
      } else {
        onComplete?.()
      }
    }

    rafId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafId)
  }, [effect, onComplete])

  return <canvas ref={canvasRef} className="wasl-msg-effect-canvas" />
}

// ── Shape drawing helpers ──────────────────────────────────────────────

function drawStar(ctx: CanvasRenderingContext2D, size: number) {
  const spikes = 4
  const outer = size
  const inner = size * 0.3
  ctx.beginPath()
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2
    const x = Math.cos(angle) * r
    const y = Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}

function drawHeart(ctx: CanvasRenderingContext2D, size: number) {
  const s = size / 2
  ctx.beginPath()
  ctx.moveTo(0, s * 0.3)
  ctx.bezierCurveTo(0, -s * 0.5, -s, -s * 0.5, -s, 0)
  ctx.bezierCurveTo(-s, s * 0.5, 0, s * 0.8, 0, s)
  ctx.bezierCurveTo(0, s * 0.8, s, s * 0.5, s, 0)
  ctx.bezierCurveTo(s, -s * 0.5, 0, -s * 0.5, 0, s * 0.3)
  ctx.closePath()
  ctx.fill()
}
