'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion'
import {
  Loader2, User, Lock, Mail, Phone, AtSign, Check, X, Sparkles, Eye, EyeOff,
  ShieldCheck, Zap, Users, Smartphone, Monitor, Cpu, Apple, Mic, BarChart3,
  FileSignature, ChevronRight, Globe, MessageCircleHeart,
} from 'lucide-react'
import { toast } from 'sonner'
import { useWaslStore } from '@/lib/store'
import { CirkleMark } from './cirkle-mark'

const DEMO_USERNAME = 'demo'
const DEMO_PASSWORD = 'demo123'

// ── Cirkle color palette ──────────────────────────────────────────────
const C = {
  teal: '#1a4a5a',
  tealLight: '#2a6b7e',
  tealDark: '#123843',
  tealDeep: '#0c2830',
  gold: '#c2a060',
  goldLight: '#e5c98a',
  goldDark: '#9a7a3e',
  rose: '#c25a6e',
  cream: '#fdfcf9',
  creamDim: '#f5efe4',
  charcoal: '#1a1a14',
  white: '#ffffff',
}

// Signature easing — a silky expo-out (iOS-like)
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

// ── Ambient keyframes (loops only — visuals stay inline) ──────────────
const AMBIENT_CSS = `
@keyframes wasl-spin{to{transform:rotate(360deg)}}
@keyframes wasl-float-y{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes wasl-orb-a{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(60px,-40px) scale(1.15)}66%{transform:translate(-30px,30px) scale(0.92)}}
@keyframes wasl-orb-b{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-70px,50px) scale(1.2)}}
@keyframes wasl-orb-c{0%,100%{transform:translate(0,0) scale(1)}40%{transform:translate(40px,60px) scale(0.9)}75%{transform:translate(-50px,-30px) scale(1.1)}}
@keyframes wasl-particle{0%{transform:translateY(0);opacity:0}8%{opacity:var(--p-op,0.5)}92%{opacity:var(--p-op,0.5)}100%{transform:translateY(-110px);opacity:0}}
@keyframes wasl-glow-breath{0%,100%{filter:drop-shadow(0 0 18px rgba(194,160,96,.4)) drop-shadow(0 0 40px rgba(26,74,90,.35))}50%{filter:drop-shadow(0 0 30px rgba(194,160,96,.65)) drop-shadow(0 0 60px rgba(26,74,90,.5))}}
@keyframes wasl-typing{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-4px);opacity:1}}
@keyframes wasl-wave{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
@keyframes wasl-shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes wasl-ring-dash{to{stroke-dashoffset:0}}
@keyframes wasl-check-pop{0%{transform:scale(0)}70%{transform:scale(1.25)}100%{transform:scale(1)}}
.wasl-landing-spin{animation:wasl-spin 30s linear infinite;transform-origin:center}
.wasl-landing-glow{animation:wasl-glow-breath 3.4s ease-in-out infinite}
.wasl-landing-float{animation:wasl-float-y 5.5s ease-in-out infinite}
.wasl-landing-shimmer{background:linear-gradient(90deg,${C.gold},${C.goldLight},${C.gold},${C.goldLight},${C.gold});background-size:200% auto;background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:wasl-shimmer 3.5s linear infinite}
@media (prefers-reduced-motion:reduce){.wasl-landing-spin,.wasl-landing-glow,.wasl-landing-float,.wasl-landing-shimmer{animation:none!important}}
`

// ── Deterministic particle field (hydration-safe) ─────────────────────
const PARTICLES = [
  { l: '6%', t: '78%', s: 3, d: 0, dur: 13, op: 0.55 },
  { l: '14%', t: '88%', s: 2, d: 4, dur: 16, op: 0.4 },
  { l: '22%', t: '70%', s: 2.5, d: 2, dur: 12, op: 0.5 },
  { l: '31%', t: '92%', s: 2, d: 7, dur: 18, op: 0.35 },
  { l: '39%', t: '76%', s: 3.5, d: 1, dur: 14, op: 0.5 },
  { l: '47%', t: '86%', s: 2, d: 5, dur: 15, op: 0.45 },
  { l: '55%', t: '72%', s: 3, d: 3, dur: 13, op: 0.55 },
  { l: '63%', t: '90%', s: 2, d: 8, dur: 17, op: 0.4 },
  { l: '71%', t: '80%', s: 2.5, d: 2, dur: 12, op: 0.5 },
  { l: '79%', t: '94%', s: 3, d: 6, dur: 16, op: 0.45 },
  { l: '87%', t: '74%', s: 2, d: 4, dur: 14, op: 0.4 },
  { l: '94%', t: '84%', s: 2.5, d: 1, dur: 15, op: 0.5 },
]

// ── Entrance choreography (Framer Motion variants) ────────────────────
const stageReveal: Variants = {
  hidden: { opacity: 0, scale: 1.04, filter: 'blur(8px)' },
  show: {
    opacity: 1, scale: 1, filter: 'blur(0px)',
    transition: { duration: 1.1, ease: EASE },
  },
}

const lettersWrap: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.55 } },
}
const letterItem: Variants = {
  hidden: { opacity: 0, y: 34, rotateX: -85, transformOrigin: '50% 100%' },
  show: {
    opacity: 1, y: 0, rotateX: 0,
    transition: { type: 'spring', stiffness: 210, damping: 19 },
  },
}

const riseIn = (delay: number, y = 22): Variants => ({
  hidden: { opacity: 0, y },
  show: { opacity: 1, y: 0, transition: { duration: 0.75, delay, ease: EASE } },
})

const cardIn: Variants = {
  hidden: { opacity: 0, y: 46, scale: 0.96 },
  show: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 120, damping: 17, delay: 0.35 },
  },
}

const formField: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, delay: 0.72 + i * 0.08, ease: EASE },
  }),
}

const bubbleIn: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.92 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 320, damping: 24 } },
  exit: { opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.35 } },
}

// ── Live chat demo script (the product showcase) ──────────────────────
type DemoMsg = {
  side: 'left' | 'right'
  kind: 'text' | 'voice' | 'poll' | 'commit'
  text?: string
  meta?: string
}

const CHAT_DEMO: DemoMsg[] = [
  { side: 'left', kind: 'text', text: 'Beach trip this Friday? 🏖️' },
  { side: 'right', kind: 'text', text: "I'm in! What time are we leaving?" },
  { side: 'left', kind: 'voice', meta: '0:23' },
  { side: 'left', kind: 'poll', text: 'What time?' },
  { side: 'right', kind: 'commit', text: 'Friday beach trip' },
]

// Which visible-counts show a typing indicator before the next message
const TYPING_AT = new Set([0, 2, 3])

// ── Feature chips ──────────────────────────────────────────────────────
const FEATURES = [
  { icon: ShieldCheck, label: 'End-to-end encrypted' },
  { icon: Zap, label: 'Real-time sync' },
  { icon: FileSignature, label: 'Verified commitments' },
]

export function AuthScreen() {
  // ── Form state (unchanged logic) ────────────────────────────────────
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [identifier, setIdentifier] = useState('')
  const [signupIdentifier, setSignupIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean
    available: boolean | null
    message: string
    suggestions: string[]
  }>({ checking: false, available: null, message: '', suggestions: [] })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const setUser = useWaslStore((s) => s.setUser)
  const router = useRouter()
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reduce = useReducedMotion()

  // ── Mounted gate — prevents SSR hydration mismatch from framer-motion
  //    parallax motion values (server renders without transforms).
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // ── Live username availability check (debounced) ────────────────────
  useEffect(() => {
    if (mode !== 'signup' || !usernameTouched) return
    const u = username.trim().toLowerCase()
    if (!u) {
      setUsernameStatus({ checking: false, available: null, message: '', suggestions: [] })
      return
    }
    if (usernameTimer.current) clearTimeout(usernameTimer.current)
    setUsernameStatus((s) => ({ ...s, checking: true }))
    usernameTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?u=${encodeURIComponent(u)}`)
        const data = await res.json()
        setUsernameStatus({ checking: false, available: data.available, message: data.message || '', suggestions: data.suggestions || [] })
      } catch {
        setUsernameStatus({ checking: false, available: null, message: '', suggestions: [] })
      }
    }, 350)
    return () => { if (usernameTimer.current) clearTimeout(usernameTimer.current) }
  }, [username, usernameTouched, mode])

  // ── Auto-generate username from name ────────────────────────────────
  useEffect(() => {
    if (mode !== 'signup' || usernameTouched) return
    const auto = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 15)
    if (auto && auto !== username) setUsername(auto)
  }, [name, usernameTouched, mode, username])

  const authenticate = useCallback(
    async (
      overrideMode?: 'login' | 'signup',
      overrideIdentifier?: string,
      overridePassword?: string,
      overrideName?: string,
      overrideUsername?: string,
      overrideSignupId?: string
    ) => {
      const m = overrideMode ?? mode
      const p = overridePassword ?? password
      setLoading(true)
      try {
        if (m === 'login') {
          const id = overrideIdentifier ?? identifier
          if (!id.trim()) { toast.error('Please enter your email, phone, or username'); return }
          if (!p) { toast.error('Please enter your password'); return }
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: id, password: p }),
          })
          const data = await res.json()
          if (!res.ok) { toast.error(data?.error || 'Login failed'); return }
          setUser(data)
          toast.success(`Welcome to Wasl, ${data.name}!`)
          router.refresh()
        } else {
          const n = (overrideName ?? name).trim()
          const u = (overrideUsername ?? username).trim().toLowerCase()
          const sid = overrideSignupId ?? signupIdentifier
          if (!n || n.length < 2) { toast.error('Please enter your name (at least 2 characters)'); return }
          if (!u || u.length < 3) { toast.error('Please choose a Cirkle username (at least 3 characters)'); return }
          if (!p || p.length < 6) { toast.error('Password must be at least 6 characters'); return }
          const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: sid || undefined, password: p, name: n, username: u }),
          })
          const data = await res.json()
          if (!res.ok) {
            if (data.suggestions?.length) { toast.error(data.error, { description: `Try: ${data.suggestions.join(', ')}` }) }
            else { toast.error(data?.error || 'Sign up failed') }
            return
          }
          setUser(data)
          toast.success(`Welcome to Wasl, ${data.name}!`)
          router.refresh()
        }
      } catch (err) {
        console.error(err)
        toast.error('Network error')
      } finally {
        setLoading(false)
      }
    },
    [mode, identifier, password, name, username, signupIdentifier, setUser, router]
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    void authenticate()
  }

  async function handleDemoLogin() {
    setIdentifier(DEMO_USERNAME)
    setPassword(DEMO_PASSWORD)
    setMode('login')
    setLoading(true)
    try {
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: DEMO_USERNAME, password: DEMO_PASSWORD }),
      })
      if (loginRes.ok) {
        const data = await loginRes.json()
        setUser(data)
        try {
          await fetch('/api/seed-demo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset: true }),
          })
          fetch('/api/seed-schools', { method: 'POST' }).catch(() => {})
        } catch {}
        toast.success(`Welcome to Wasl, ${data.name}!`)
        router.refresh()
        return
      }
      const signupRes = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: '+201001234567', password: DEMO_PASSWORD, name: 'Demo User', username: DEMO_USERNAME }),
      })
      const data = await signupRes.json()
      if (!signupRes.ok) { toast.error(data?.error || 'Failed to start demo'); return }
      setUser(data)
      try {
        await fetch('/api/seed-demo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reset: true }),
        })
      } catch {}
      toast.success(`Welcome to Wasl, ${data.name}!`)
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  // ── Live chat demo loop ─────────────────────────────────────────────
  const [demoVisible, setDemoVisible] = useState(reduce ? CHAT_DEMO.length : 0)
  const [demoVoted, setDemoVoted] = useState(reduce ? true : false)
  const [demoFading, setDemoFading] = useState(false)

  useEffect(() => {
    if (reduce) return // static showcase for reduced motion
    let cancelled = false
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const run = async () => {
      while (!cancelled) {
        setDemoVisible(0); setDemoVoted(false); setDemoFading(false)
        await wait(1300); if (cancelled) break
        setDemoVisible(1) // Layla: beach trip?
        await wait(1500); if (cancelled) break
        setDemoVisible(2) // You: I'm in!
        await wait(1200); if (cancelled) break
        setDemoVisible(3) // Layla: voice note
        await wait(1600); if (cancelled) break
        setDemoVisible(4) // Layla: poll
        await wait(1800); if (cancelled) break
        setDemoVoted(true) // You vote 6pm
        await wait(1500); if (cancelled) break
        setDemoVisible(5) // Commit card
        await wait(6800); if (cancelled) break
        setDemoFading(true)
        await wait(750); if (cancelled) break
      }
    }
    run()
    return () => { cancelled = true }
  }, [reduce])

  // ── Mouse parallax for the stage (desktop only) ─────────────────────
  const stageRef = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 55, damping: 18 })
  const sy = useSpring(my, { stiffness: 55, damping: 18 })
  const phoneX = useTransform(sx, (v) => v * 16)
  const phoneY = useTransform(sy, (v) => v * 10)
  const orbX = useTransform(sx, (v) => v * -26)
  const orbY = useTransform(sy, (v) => v * -18)
  const logoX = useTransform(sx, (v) => v * 7)
  const logoY = useTransform(sy, (v) => v * 5)

  const onStageMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (reduce || !stageRef.current) return
      const r = stageRef.current.getBoundingClientRect()
      mx.set((e.clientX - r.left) / r.width - 0.5)
      my.set((e.clientY - r.top) / r.height - 0.5)
    },
    [reduce, mx, my]
  )

  const loginIdType = identifier.includes('@') ? 'email' : /^\+?[\d\s-]+$/.test(identifier) && identifier.replace(/[\s-]/g, '').length >= 8 ? 'phone' : 'username'
  const LoginIcon = loginIdType === 'email' ? Mail : loginIdType === 'phone' ? Phone : AtSign
  const signupIdType = signupIdentifier.includes('@') ? 'email' : /^\+?[\d\s-]+$/.test(signupIdentifier) && signupIdentifier.replace(/[\s-]/g, '').length >= 8 ? 'phone' : 'username'
  const SignupIdIcon = signupIdType === 'email' ? Mail : signupIdType === 'phone' ? Phone : AtSign

  // ── Shared input styles ─────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '44px',
    padding: '0 12px 0 42px',
    border: `1.5px solid ${C.teal}26`,
    borderRadius: '13px',
    fontSize: '14px',
    fontFamily: 'inherit',
    background: C.white,
    color: C.charcoal,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s, background-color 0.2s',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '12.5px',
    fontWeight: 600,
    color: C.teal,
    marginBottom: '6px',
    display: 'block',
    fontFamily: 'inherit',
    letterSpacing: '0.01em',
  }
  const iconWrapStyle: React.CSSProperties = {
    position: 'absolute',
    left: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: C.goldDark,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
  }

  const wordmark = 'Wasl'

  return (
    <div
      data-theme="cirkle"
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: `linear-gradient(180deg, ${C.cream} 0%, ${C.creamDim} 100%)`,
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: AMBIENT_CSS }} />

      {/* ══ Main split layout ════════════════════════════════════════ */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'stretch', justifyContent: 'center', width: '100%' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 4.4fr)',
            width: '100%',
            maxWidth: '1280px',
            gap: 'clamp(18px, 2.6vw, 40px)',
            padding: 'clamp(12px, 1.8vw, 22px)',
            alignItems: 'center',
          }}
          className="wasl-auth-grid"
        >
          {/* ══════════════ LEFT — Cinematic brand stage ══════════════ */}
          <motion.section
            ref={stageRef}
            variants={stageReveal}
            initial="hidden"
            animate="show"
            onMouseMove={onStageMouseMove}
            className="wasl-auth-stage"
            style={{
              position: 'relative',
              borderRadius: '30px',
              overflow: 'hidden',
              background: `linear-gradient(155deg, ${C.tealDeep} 0%, ${C.tealDark} 34%, ${C.teal} 72%, ${C.tealLight} 100%)`,
              isolation: 'isolate',
            }}
          >
            {/* Ambient aurora orbs — drift on independent loops, parallax on mouse */}
            <motion.div style={mounted ? { position: 'absolute', inset: 0, x: orbX, y: orbY, pointerEvents: 'none' } : { position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <div style={{
                position: 'absolute', top: '-18%', left: '-12%', width: '62%', aspectRatio: '1',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${C.gold}30 0%, transparent 65%)`,
                animation: 'wasl-orb-a 22s ease-in-out infinite',
                filter: 'blur(6px)',
              }} />
              <div style={{
                position: 'absolute', bottom: '-24%', right: '-14%', width: '70%', aspectRatio: '1',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${C.rose}26 0%, transparent 65%)`,
                animation: 'wasl-orb-b 27s ease-in-out infinite',
                filter: 'blur(8px)',
              }} />
              <div style={{
                position: 'absolute', top: '28%', right: '6%', width: '44%', aspectRatio: '1',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${C.tealLight}40 0%, transparent 62%)`,
                animation: 'wasl-orb-c 19s ease-in-out infinite',
                filter: 'blur(10px)',
              }} />
              <div style={{
                position: 'absolute', bottom: '10%', left: '8%', width: '38%', aspectRatio: '1',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${C.goldLight}20 0%, transparent 60%)`,
                animation: 'wasl-orb-a 25s ease-in-out infinite reverse',
                filter: 'blur(12px)',
              }} />
            </motion.div>

            {/* Fine grid overlay — engineering blueprint feel */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
              backgroundImage: `
                linear-gradient(rgba(253,252,249,0.045) 1px, transparent 1px),
                linear-gradient(90deg, rgba(253,252,249,0.045) 1px, transparent 1px)`,
              backgroundSize: '44px 44px',
              maskImage: 'radial-gradient(ellipse 90% 80% at 50% 40%, black 30%, transparent 78%)',
              WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 40%, black 30%, transparent 78%)',
            }} />

            {/* Rising particles */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {PARTICLES.map((p, i) => (
                <span key={i} style={{
                  position: 'absolute',
                  left: p.l, bottom: `calc(100% - ${p.t})`,
                  width: p.s, height: p.s,
                  borderRadius: '50%',
                  background: i % 3 === 0 ? C.goldLight : '#fdfcf9',
                  // @ts-expect-error CSS custom prop
                  '--p-op': p.op,
                  animation: `wasl-particle ${p.dur}s linear ${p.d}s infinite`,
                }} />
              ))}
            </div>

            {/* Stage content */}
            <div style={{
              position: 'relative', zIndex: 2,
              display: 'flex', flexDirection: 'column',
              minHeight: 'min(82vh, 700px)',
              padding: 'clamp(24px, 3.4vw, 42px)',
              gap: 'clamp(14px, 2.2vh, 24px)',
            }}>
              {/* Brand header */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <motion.div
                  variants={riseIn(0.25, 26)}
                  initial="hidden"
                  animate="show"
                  style={mounted ? { x: logoX, y: logoY } : undefined}
                >
                  <div className="wasl-landing-glow wasl-landing-float" style={{ display: 'inline-block' }}>
                    <CirkleMark size={64} animated />
                  </div>
                </motion.div>

                <motion.h1
                  variants={lettersWrap}
                  initial="hidden"
                  animate="show"
                  className="font-display"
                  style={{
                    margin: '18px 0 0',
                    fontSize: 'clamp(2.6rem, 4.6vw, 3.9rem)',
                    fontWeight: 700,
                    letterSpacing: '-0.035em',
                    lineHeight: 1,
                    color: C.white,
                    perspective: 600,
                    display: 'flex',
                  }}
                  aria-label="Wasl"
                >
                  {wordmark.split('').map((ch, i) => (
                    <motion.span key={i} variants={letterItem} style={{ display: 'inline-block', transformStyle: 'preserve-3d' }}>
                      {ch}
                    </motion.span>
                  ))}
                </motion.h1>

                <motion.div variants={riseIn(0.95)} initial="hidden" animate="show" style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 8 }}>
                  <span className="font-arabic" style={{
                    fontSize: '0.72rem',
                    letterSpacing: '0.42em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.55)',
                  }}>دواير</span>
                  <span style={{
                    width: 26, height: 1,
                    background: `linear-gradient(90deg, ${C.gold}, transparent)`,
                  }} />
                  <span className="wasl-landing-shimmer" style={{
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}>Simple. Secure. Connected.</span>
                </motion.div>
              </div>

              {/* Live conversation showcase — the product telling its story */}
              <motion.div
                variants={riseIn(1.15, 30)}
                initial="hidden"
                animate="show"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <motion.div
                  style={mounted ? { x: phoneX, y: phoneY, width: '100%', maxWidth: '460px' } : { width: '100%', maxWidth: '460px' }}
                  className="wasl-landing-float"
                >
                  {/* Phone-frame glass card */}
                  <div style={{
                    borderRadius: '24px',
                    border: '1px solid rgba(253,252,249,0.14)',
                    background: 'rgba(253,252,249,0.06)',
                    backdropFilter: 'blur(18px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(18px) saturate(160%)',
                    boxShadow: `0 24px 70px rgba(0,0,0,0.38), inset 0 1px 0 rgba(253,252,249,0.12)`,
                    overflow: 'hidden',
                  }}>
                    {/* Chat header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '13px 18px',
                      borderBottom: '1px solid rgba(253,252,249,0.1)',
                      background: 'rgba(253,252,249,0.05)',
                    }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: `linear-gradient(135deg, ${C.rose}, ${C.gold})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: C.white, fontSize: 12, fontWeight: 700,
                        boxShadow: `0 0 0 2px rgba(253,252,249,0.15)`,
                      }}>L</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'rgba(253,252,249,0.95)', fontSize: 13.5, fontWeight: 600 }}>Layla Mostafa</div>
                        <div style={{ color: 'rgba(253,252,249,0.5)', fontSize: 11 }}>online</div>
                      </div>
                      <MessageCircleHeart style={{ width: 16, height: 16, color: `${C.gold}99` }} />
                    </div>

                    {/* Messages */}
                    <div style={{
                      padding: '18px 16px 14px',
                      display: 'flex', flexDirection: 'column', gap: 10,
                      minHeight: 236,
                      maxHeight: 260,
                      overflow: 'hidden',
                      justifyContent: 'flex-end',
                      opacity: demoFading ? 0 : 1,
                      transition: 'opacity 0.7s ease',
                    }}>
                      <AnimatePresence initial={false}>
                        {CHAT_DEMO.slice(0, demoVisible).map((m, i) => (
                          <motion.div
                            key={i}
                            variants={bubbleIn}
                            initial="hidden"
                            animate="show"
                            exit="exit"
                            style={{
                              alignSelf: m.side === 'right' ? 'flex-end' : 'flex-start',
                              maxWidth: '82%',
                            }}
                          >
                            {m.kind === 'text' && (
                              <div style={{
                                padding: '9px 14px',
                                borderRadius: m.side === 'right' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                background: m.side === 'right'
                                  ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`
                                  : 'rgba(253,252,249,0.12)',
                                color: m.side === 'right' ? C.charcoal : 'rgba(253,252,249,0.94)',
                                fontSize: 13.5,
                                lineHeight: 1.45,
                                border: m.side === 'right' ? 'none' : '1px solid rgba(253,252,249,0.12)',
                                boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                              }}>{m.text}</div>
                            )}

                            {m.kind === 'voice' && (
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 14px',
                                borderRadius: '16px 16px 16px 4px',
                                background: 'rgba(253,252,249,0.12)',
                                border: '1px solid rgba(253,252,249,0.12)',
                                boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                              }}>
                                <div style={{
                                  width: 28, height: 28, borderRadius: '50%',
                                  background: `linear-gradient(135deg, ${C.rose}, ${C.gold})`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  <Mic style={{ width: 13, height: 13, color: C.white }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 18 }}>
                                  {[0.5, 0.9, 0.6, 1, 0.7, 0.95, 0.55, 0.85, 0.65, 1, 0.5, 0.8, 0.6, 0.9].map((h, j) => (
                                    <span key={j} style={{
                                      width: 2.5, height: `${h * 100}%`,
                                      borderRadius: 2,
                                      background: 'rgba(253,252,249,0.65)',
                                      transformOrigin: 'center',
                                      animation: reduce ? 'none' : `wasl-wave 1.1s ease-in-out ${j * 0.08}s infinite`,
                                    }} />
                                  ))}
                                </div>
                                <span style={{ fontSize: 11, color: 'rgba(253,252,249,0.6)', fontVariantNumeric: 'tabular-nums' }}>{m.meta}</span>
                              </div>
                            )}

                            {m.kind === 'poll' && (
                              <div style={{
                                padding: '12px 14px',
                                borderRadius: '16px 16px 16px 4px',
                                background: 'rgba(253,252,249,0.1)',
                                border: '1px solid rgba(253,252,249,0.12)',
                                boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                                minWidth: 220,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                  <BarChart3 style={{ width: 13, height: 13, color: C.goldLight }} />
                                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(253,252,249,0.92)' }}>{m.text}</span>
                                </div>
                                {[
                                  { label: '5 pm', votes: 1, win: false },
                                  { label: '6 pm', votes: 3, win: true },
                                  { label: '7 pm', votes: 1, win: false },
                                ].map((o, j) => (
                                  <div key={j} style={{ marginBottom: 7 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                      <span style={{ fontSize: 11.5, color: 'rgba(253,252,249,0.85)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                        {demoVoted && o.win && <Check style={{ width: 11, height: 11, color: C.goldLight }} />}
                                        {o.label}
                                      </span>
                                      <span style={{ fontSize: 10.5, color: 'rgba(253,252,249,0.5)' }}>{o.votes}</span>
                                    </div>
                                    <div style={{ height: 4, borderRadius: 3, background: 'rgba(253,252,249,0.1)', overflow: 'hidden' }}>
                                      <motion.div
                                        initial={{ width: '0%' }}
                                        animate={{ width: demoVoted ? `${o.votes / 5 * 100}%` : '0%' }}
                                        transition={{ duration: 0.8, ease: EASE, delay: demoVoted ? j * 0.12 : 0 }}
                                        style={{
                                          height: '100%', borderRadius: 3,
                                          background: o.win
                                            ? `linear-gradient(90deg, ${C.gold}, ${C.goldLight})`
                                            : 'rgba(253,252,249,0.35)',
                                        }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {m.kind === 'commit' && (
                              <div style={{
                                padding: '13px 15px',
                                borderRadius: '16px 16px 4px 16px',
                                background: `linear-gradient(135deg, rgba(194,160,96,0.16), rgba(194,160,96,0.06))`,
                                border: `1px solid ${C.gold}55`,
                                boxShadow: `0 4px 18px rgba(194,160,96,0.14)`,
                                minWidth: 230,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                  <div style={{
                                    width: 26, height: 26, borderRadius: 8,
                                    background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    <FileSignature style={{ width: 13, height: 13, color: C.charcoal }} />
                                  </div>
                                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(253,252,249,0.95)' }}>Commitment · {m.text}</span>
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(253,252,249,0.6)', lineHeight: 1.5 }}>
                                  Friday 6 pm · Sahara Beach · Split costs
                                </div>
                                <div style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  marginTop: 9, padding: '4px 10px',
                                  borderRadius: 99,
                                  background: `${C.gold}22`,
                                  border: `1px solid ${C.gold}44`,
                                  fontSize: 10.5, fontWeight: 600, color: C.goldLight,
                                }}>
                                  <span style={{ display: 'inline-block', animation: 'wasl-check-pop 0.5s ease both' }}>
                                    <Check style={{ width: 11, height: 11 }} />
                                  </span>
                                  Signed by both · hash-verified
                                </div>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </AnimatePresence>

                      {/* Typing indicator */}
                      <AnimatePresence>
                        {TYPING_AT.has(demoVisible) && !demoFading && (
                          <motion.div
                            key="typing"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            style={{ alignSelf: 'flex-start' }}
                          >
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 5,
                              padding: '11px 15px',
                              borderRadius: '16px 16px 16px 4px',
                              background: 'rgba(253,252,249,0.1)',
                              border: '1px solid rgba(253,252,249,0.1)',
                            }}>
                              {[0, 1, 2].map((d) => (
                                <span key={d} style={{
                                  width: 6, height: 6, borderRadius: '50%',
                                  background: 'rgba(253,252,249,0.75)',
                                  animation: `wasl-typing 1.2s ease-in-out ${d * 0.18}s infinite`,
                                }} />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Fake input bar */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '11px 16px',
                      borderTop: '1px solid rgba(253,252,249,0.1)',
                      background: 'rgba(253,252,249,0.04)',
                    }}>
                      <div style={{
                        flex: 1, height: 34, borderRadius: 99,
                        background: 'rgba(253,252,249,0.08)',
                        border: '1px solid rgba(253,252,249,0.09)',
                        display: 'flex', alignItems: 'center',
                        padding: '0 14px',
                        fontSize: 12, color: 'rgba(253,252,249,0.4)',
                      }}>Message Layla…</div>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 4px 14px ${C.gold}55`,
                      }}>
                        <ChevronRight style={{ width: 16, height: 16, color: C.charcoal }} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>

              {/* Feature chips */}
              <motion.div
                variants={riseIn(1.45)}
                initial="hidden"
                animate="show"
                style={{
                  display: 'flex', gap: 10, flexWrap: 'wrap',
                }}
              >
                {FEATURES.map((f, i) => (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 1.5 + i * 0.12, ease: EASE }}
                    whileHover={reduce ? undefined : { y: -3, transition: { duration: 0.2 } }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '8px 14px',
                      borderRadius: 99,
                      background: 'rgba(253,252,249,0.07)',
                      border: '1px solid rgba(253,252,249,0.13)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      color: 'rgba(253,252,249,0.85)',
                      fontSize: 12, fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <f.icon style={{ width: 14, height: 14, color: C.goldLight }} />
                    {f.label}
                  </motion.div>
                ))}
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: 1.5 + 3 * 0.12, ease: EASE }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '8px 14px',
                    borderRadius: 99,
                    background: 'rgba(253,252,249,0.07)',
                    border: '1px solid rgba(253,252,249,0.13)',
                    color: 'rgba(253,252,249,0.85)',
                    fontSize: 12, fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Globe style={{ width: 14, height: 14, color: C.goldLight }} />
                  عربي · English
                </motion.div>
              </motion.div>
            </div>

            {/* Edge highlight — glass rim */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '30px', pointerEvents: 'none',
              boxShadow: `inset 0 1px 0 rgba(253,252,249,0.16), inset 0 0 0 1px rgba(253,252,249,0.05)`,
            }} />
          </motion.section>

          {/* ══════════════ RIGHT — Auth panel ══════════════ */}
          <section
            className="wasl-auth-panel"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '0 4px',
            }}
          >
            {/* Mobile-only compact header (stage is hidden below lg) */}
            <div className="wasl-auth-mobile-header" style={{ display: 'none', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.6, filter: 'blur(8px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                transition={{ duration: 0.7, ease: EASE }}
                className="wasl-landing-glow"
              >
                <CirkleMark size={64} animated />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.25, ease: EASE }}
                className="font-display"
                style={{ margin: '12px 0 0', fontSize: '2.2rem', fontWeight: 700, letterSpacing: '-0.03em', color: C.teal, lineHeight: 1 }}
              >
                Wasl
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.45 }}
                style={{ margin: '6px 0 0', fontSize: 13, color: `${C.teal}b0` }}
              >
                Simple. Secure. Connected.
              </motion.p>
            </div>

            {/* The auth card */}
            <motion.div variants={cardIn} initial="hidden" animate="show" style={{ width: '100%', maxWidth: '440px' }}>
              <div
                className="wasl-glass-strong wasl-glow-card"
                style={{
                  width: '100%',
                  background: 'rgba(253, 252, 249, 0.96)',
                  backdropFilter: 'blur(24px) saturate(200%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(200%)',
                  borderRadius: '26px',
                  border: `1px solid ${C.gold}3d`,
                  boxShadow: 'var(--wasl-shadow-xl), 0 0 46px rgba(194, 160, 96, 0.16)',
                  padding: '24px 26px 22px',
                  boxSizing: 'border-box' as const,
                  position: 'relative' as const,
                  overflow: 'hidden' as const,
                }}
              >
                {/* Top light streak */}
                <div style={{
                  position: 'absolute', top: 0, left: '12%', right: '12%', height: 1,
                  background: `linear-gradient(90deg, transparent, ${C.goldLight}aa, transparent)`,
                }} />

                {/* Mode switcher — animated pill */}
                <motion.div variants={formField} custom={0} initial="hidden" animate="show" style={{ position: 'relative', display: 'flex', padding: 4, background: 'rgba(26, 74, 90, 0.07)', borderRadius: '15px', border: `1px solid ${C.teal}1e`, marginBottom: 16 }}>
                  {(['signup', 'login'] as const).map((tab) => {
                    const active = mode === tab
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setMode(tab)}
                        aria-pressed={active}
                        style={{
                          flex: 1,
                          position: 'relative',
                          padding: '10px 16px',
                          borderRadius: '11px',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontSize: 14,
                          fontWeight: 600,
                          background: 'transparent',
                          color: active ? C.charcoal : `${C.teal}99`,
                          transition: 'color 0.25s',
                          zIndex: 1,
                        }}
                      >
                        {active && (
                          <motion.span
                            layoutId="authModePill"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                            style={{
                              position: 'absolute', inset: 0,
                              borderRadius: '11px',
                              background: `linear-gradient(135deg, ${C.goldLight}, ${C.gold}, ${C.goldDark})`,
                              boxShadow: `0 4px 14px ${C.gold}55`,
                              zIndex: -1,
                            }}
                          />
                        )}
                        {tab === 'signup' ? 'Create account' : 'Log in'}
                      </button>
                    )
                  })}
                </motion.div>

                {/* Heading + form — cross-fades between modes */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={mode}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.32, ease: EASE }}
                  >
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.teal, margin: '0 0 3px', fontFamily: 'inherit', letterSpacing: '-0.01em' }}>
                      {mode === 'signup' ? 'Create your account' : 'Welcome back'}
                    </h2>
                    <p style={{ fontSize: 12.5, color: `${C.teal}99`, margin: '0 0 18px', fontFamily: 'inherit' }}>
                      {mode === 'signup'
                        ? 'Sign up with your Cirkle email or phone.'
                        : 'Log in with your email, phone, or username.'}
                    </p>

                    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {mode === 'signup' ? (
                        <>
                          {/* Name */}
                          <motion.div variants={formField} custom={1} initial="hidden" animate="show">
                            <label style={labelStyle} htmlFor="name">Your name</label>
                            <div style={{ position: 'relative' }}>
                              <span style={iconWrapStyle}><User style={{ width: 16, height: 16 }} /></span>
                              <input
                                id="name"
                                type="text"
                                className="wasl-input-premium"
                                placeholder="e.g. Ahmad Ali"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                autoComplete="name"
                                disabled={loading}
                                style={inputStyle}
                              />
                            </div>
                          </motion.div>

                          {/* Username with live availability */}
                          <motion.div variants={formField} custom={2} initial="hidden" animate="show">
                            <label style={labelStyle} htmlFor="username">Cirkle username</label>
                            <div style={{ position: 'relative' }}>
                              <span style={iconWrapStyle}><AtSign style={{ width: 16, height: 16 }} /></span>
                              <input
                                id="username"
                                type="text"
                                className="wasl-input-premium"
                                placeholder="ahmad_ali"
                                value={username}
                                onChange={(e) => { setUsername(e.target.value); setUsernameTouched(true) }}
                                autoComplete="username"
                                disabled={loading}
                                style={inputStyle}
                              />
                              {usernameStatus.checking && <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}><Loader2 style={{ width: 16, height: 16, animation: 'wasl-spin 0.8s linear infinite' }} /></span>}
                              {!usernameStatus.checking && usernameStatus.available === true && <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#22c55e' }}><Check style={{ width: 16, height: 16 }} /></span>}
                              {!usernameStatus.checking && usernameStatus.available === false && <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#ef4444' }}><X style={{ width: 16, height: 16 }} /></span>}
                            </div>
                          </motion.div>

                          {/* Email/Phone optional */}
                          <motion.div variants={formField} custom={3} initial="hidden" animate="show">
                            <label style={labelStyle} htmlFor="signup-id">Cirkle email or phone <span style={{ fontWeight: 400, color: `${C.teal}66` }}>(optional)</span></label>
                            <div style={{ position: 'relative' }}>
                              <span style={iconWrapStyle}><SignupIdIcon style={{ width: 16, height: 16 }} /></span>
                              <input
                                id="signup-id"
                                type="text"
                                className="wasl-input-premium"
                                placeholder="you@cirkle.app or +20 100 4567"
                                value={signupIdentifier}
                                onChange={(e) => setSignupIdentifier(e.target.value)}
                                autoComplete="off"
                                disabled={loading}
                                style={inputStyle}
                              />
                            </div>
                            <p style={{ fontSize: 10.5, color: `${C.teal}77`, margin: '4px 0 0' }}>
                              Add an email or phone so you can log in later.
                            </p>
                          </motion.div>
                        </>
                      ) : (
                        <motion.div variants={formField} custom={1} initial="hidden" animate="show">
                          <label style={labelStyle} htmlFor="identifier">Email, phone, or username</label>
                          <div style={{ position: 'relative' }}>
                            <span style={iconWrapStyle}><LoginIcon style={{ width: 16, height: 16 }} /></span>
                            <input
                              id="identifier"
                              type="text"
                              className="wasl-input-premium"
                              placeholder="you@cirkle.app, +20…, or @username"
                              value={identifier}
                              onChange={(e) => setIdentifier(e.target.value)}
                              autoComplete="username"
                              disabled={loading}
                              style={inputStyle}
                            />
                          </div>
                        </motion.div>
                      )}

                      {/* Password */}
                      <motion.div variants={formField} custom={mode === 'signup' ? 4 : 2} initial="hidden" animate="show">
                        <label style={labelStyle} htmlFor="password">Password</label>
                        <div style={{ position: 'relative' }}>
                          <span style={iconWrapStyle}><Lock style={{ width: 16, height: 16 }} /></span>
                          <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            className="wasl-input-premium"
                            placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                            disabled={loading}
                            style={{ ...inputStyle, paddingRight: '42px' }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            style={{
                              position: 'absolute',
                              right: 14,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: `${C.teal}99`,
                              padding: 4,
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                          </button>
                        </div>
                      </motion.div>

                      {/* Submit */}
                      <motion.div variants={formField} custom={mode === 'signup' ? 5 : 3} initial="hidden" animate="show">
                        <motion.button
                          type="submit"
                          className="wasl-btn-sheen"
                          disabled={loading || (mode === 'signup' && usernameStatus.available === false)}
                          whileHover={loading ? undefined : { y: -2, boxShadow: `0 10px 28px ${C.gold}70` }}
                          whileTap={loading ? undefined : { scale: 0.985 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                          style={{
                            width: '100%',
                            height: '48px',
                            border: 'none',
                            borderRadius: '13px',
                            fontSize: 14.5,
                            fontWeight: 600,
                            fontFamily: 'inherit',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.65 : 1,
                            background: `linear-gradient(135deg, ${C.goldLight}, ${C.gold}, ${C.goldDark})`,
                            color: C.charcoal,
                            boxShadow: `0 5px 18px ${C.gold}48`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            position: 'relative' as const,
                            overflow: 'hidden' as const,
                          }}
                        >
                          {loading && <Loader2 style={{ width: 16, height: 16, animation: 'wasl-spin 0.8s linear infinite' }} />}
                          {mode === 'signup' ? 'Create account' : 'Log in'}
                          {!loading && <ChevronRight style={{ width: 15, height: 15 }} />}
                        </motion.button>
                      </motion.div>
                    </form>
                  </motion.div>
                </AnimatePresence>

                {/* Divider */}
                <motion.div variants={formField} custom={6} initial="hidden" animate="show" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '15px 0 11px' }}>
                  <div style={{ flex: 1, height: 1, background: `${C.teal}1c` }} />
                  <span style={{ fontSize: 10.5, color: `${C.teal}66`, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>or</span>
                  <div style={{ flex: 1, height: 1, background: `${C.teal}1c` }} />
                </motion.div>

                {/* Demo button */}
                <motion.div variants={formField} custom={7} initial="hidden" animate="show">
                  <motion.button
                    type="button"
                    onClick={handleDemoLogin}
                    disabled={loading}
                    whileHover={loading ? undefined : { y: -1, borderColor: C.gold, background: `${C.gold}14` }}
                    whileTap={loading ? undefined : { scale: 0.99 }}
                    style={{
                      width: '100%',
                      height: '40px',
                      border: `1.5px solid ${C.gold}55`,
                      borderRadius: '13px',
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      background: `${C.gold}0a`,
                      color: C.goldDark,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    {loading ? <Loader2 style={{ width: 15, height: 15, animation: 'wasl-spin 0.8s linear infinite' }} /> : <Sparkles style={{ width: 15, height: 15 }} />}
                    Try the rich demo
                  </motion.button>
                </motion.div>
              </div>
            </motion.div>

            {/* ── Downloads — compact strip below the card ── */}
            <motion.div variants={riseIn(1.5, 16)} initial="hidden" animate="show" style={{ width: '100%', maxWidth: '440px' }}>
              {/* Install PWA CTA */}
              <motion.button
                type="button"
                onClick={() => {
                  const ua = navigator.userAgent
                  const isIPhone = /iPhone/i.test(ua)
                  const isIPad = /iPad/i.test(ua)
                  const isAndroid = /Android/i.test(ua)
                  if (isIPhone || isIPad) {
                    toast.info('📱 Install on iPhone: tap Share → "Add to Home Screen"', { duration: 6000 })
                  } else if (isAndroid) {
                    toast.info('📱 Install on Android: tap Chrome menu (⋮) → "Install app"', { duration: 6000 })
                  } else {
                    toast.info('📱 Open wasl.app on your phone to install the app', { duration: 6000 })
                  }
                }}
                whileHover={{ borderColor: C.gold, background: `${C.gold}14` }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '9px 13px',
                  borderRadius: '13px',
                  border: `1.5px solid ${C.gold}45`,
                  background: `linear-gradient(135deg, ${C.gold}12, ${C.gold}05)`,
                  cursor: 'pointer',
                  marginBottom: 8,
                }}
              >
                <span style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 4px 12px ${C.gold}40`,
                }}>
                  <Smartphone style={{ width: 15, height: 15, color: C.white }} />
                </span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.teal }}>
                    Install mobile app
                  </span>
                  <span style={{ display: 'block', fontSize: 10, color: `${C.teal}88`, marginTop: 1 }}>
                    No app store · works offline · auto-syncs
                  </span>
                </span>
                <Zap style={{ width: 13, height: 13, color: C.gold }} />
              </motion.button>

              {/* Platform tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                {[
                  { icon: Monitor, label: 'macOS', sub: 'Intel', msg: 'macOS Intel build — coming soon to the App Store' },
                  { icon: Apple, label: 'macOS', sub: 'Silicon', msg: 'macOS Apple Silicon build — coming soon to the App Store' },
                  { icon: Monitor, label: 'Windows', sub: 'x64', msg: 'Windows build — coming soon to the Microsoft Store' },
                  { icon: Smartphone, label: 'iOS', sub: 'PWA', msg: 'iOS: open Wasl in Safari → tap Share → "Add to Home Screen"' },
                  { icon: Smartphone, label: 'Android', sub: 'PWA', msg: 'Android: open Wasl in Chrome → tap menu → "Install app"' },
                  { icon: Cpu, label: 'Linux', sub: 'All', msg: 'Linux build — coming soon (.deb / .AppImage / .rpm)' },
                ].map((p, i) => (
                  <motion.button
                    key={i}
                    type="button"
                    onClick={() => toast.info(p.msg)}
                    aria-label={`${p.label} ${p.sub}`}
                    whileHover={{ y: -2, borderColor: `${C.gold}88`, background: `${C.gold}10` }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2.5,
                      padding: '8px 4px 6px',
                      borderRadius: '11px',
                      border: `1px solid ${C.teal}1c`,
                      background: `${C.teal}05`,
                      cursor: 'pointer',
                    }}
                  >
                    <p.icon style={{ width: 14, height: 14, color: C.goldDark }} />
                    <span style={{ fontSize: 9, color: C.teal, fontWeight: 600, lineHeight: 1 }}>{p.label}</span>
                    <span style={{ fontSize: 8, color: `${C.teal}77`, lineHeight: 1 }}>{p.sub}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* Under-card trust line */}
            <motion.div
              variants={riseIn(1.7, 12)}
              initial="hidden"
              animate="show"
              style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}
            >
              {[
                { icon: ShieldCheck, text: 'End-to-end encrypted' },
                { icon: Zap, text: 'Real-time' },
                { icon: Users, text: 'Verified agreements' },
              ].map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, color: `${C.teal}a8`, fontSize: 11, fontWeight: 500 }}>
                  <f.icon style={{ width: 12, height: 12, color: C.goldDark }} />
                  {f.text}
                </div>
              ))}
            </motion.div>
          </section>
        </div>
      </main>

      {/* ══ Footer — pinned to bottom ════════════════════════════════ */}
      <motion.footer
        variants={riseIn(2, 10)}
        initial="hidden"
        animate="show"
        style={{
          marginTop: 'auto',
          textAlign: 'center',
          padding: '10px 24px calc(12px + env(safe-area-inset-bottom, 0px))',
          background: 'transparent',
          color: `${C.teal}90`,
          fontSize: 11,
          fontFamily: 'inherit',
          position: 'relative',
          zIndex: 1,
        }}
      >
        Wasl &copy; {new Date().getFullYear()} &middot; End-to-end inspired messaging &middot; Commit-verified agreements
      </motion.footer>

      {/* Responsive: single column below lg */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 1023px) {
          .wasl-auth-grid { grid-template-columns: 1fr !important; max-width: 520px !important; }
          .wasl-auth-stage { display: none !important; }
          .wasl-auth-mobile-header { display: flex !important; margin-bottom: 4px; }
          .wasl-auth-panel { padding-top: clamp(28px, 7vh, 64px) !important; }
        }
        @media (min-width: 1024px) {
          .wasl-auth-stage { minHeight: min(82vh, 700px) !important; }
        }
      ` }} />
    </div>
  )
}
