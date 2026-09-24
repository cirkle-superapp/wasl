'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, User, Lock, Mail, Phone, AtSign, Check, X, Sparkles, Eye, EyeOff, ShieldCheck, Zap, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useWaslStore } from '@/lib/store'
import { CirkleMark } from './cirkle-mark'

const DEMO_USERNAME = 'demo'
const DEMO_PASSWORD = 'demo123'

// Cirkle color palette
const C = {
  teal: '#1a4a5a',
  tealLight: '#2a6b7e',
  tealDark: '#123843',
  gold: '#c2a060',
  goldLight: '#e5c98a',
  goldDark: '#9a7a3e',
  rose: '#c25a6e',
  cream: '#fdfcf9',
  charcoal: '#1a1a14',
  white: '#ffffff',
}

// Cinematic entrance keyframes — only for animations, all visual styling is inline
const ANIM_CSS = `
@keyframes cinenav-bg{0%{opacity:0;transform:scale(1.1)}100%{opacity:1;transform:scale(1)}}
@keyframes cinenav-logo{0%{opacity:0;transform:scale(0.5) translateY(20px);filter:blur(10px)}50%{opacity:0.5;filter:blur(4px)}100%{opacity:1;transform:scale(1) translateY(0);filter:blur(0)}}
@keyframes cinenav-up{0%{opacity:0;transform:translateY(20px)}100%{opacity:1;transform:translateY(0)}}
@keyframes cinenav-fade{0%{opacity:0}100%{opacity:1}}
@keyframes cinenav-card{0%{opacity:0;transform:translateY(40px) scale(0.95)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes glow-pulse{0%,100%{box-shadow:0 0 30px rgba(194,160,96,0.15),0 0 60px rgba(26,74,90,0.1)}50%{box-shadow:0 0 50px rgba(194,160,96,0.25),0 0 80px rgba(26,74,90,0.15)}}
@keyframes ring-rotate{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
@keyframes ring-pulse{0%,100%{opacity:0.3}50%{opacity:0.8}}
@keyframes float-slow{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
.wasl-cirkle-spin{animation:ring-rotate 30s linear infinite;transform-origin:center}
.wasl-cirkle-glow{animation:ring-pulse 2.5s ease-in-out infinite}
.wasl-float{animation:float-slow 4s ease-in-out infinite}
.wasl-glow-card{animation:glow-pulse 4s ease-in-out infinite}
.wasl-shimmer-text{background:linear-gradient(90deg,${C.gold},${C.goldLight},${C.gold},${C.goldLight},${C.gold});background-size:200% auto;background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:shimmer 3s linear infinite}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`

// Cinematic entrance wrapper — applies the animation with a delay
function Cinematic({ children, delay, anim = 'cinenav-up' }: { children: React.ReactNode; delay: string; anim?: string }) {
  return <div style={{ animation: `${anim} 0.7s cubic-bezier(0.16,1,0.3,1) ${delay} both` }}>{children}</div>
}

export function AuthScreen() {
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

  // Live username availability check (debounced)
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

  // Auto-generate username from name
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
        // Seed the rich demo dataset for this user. The `{ reset: true }`
        // option wipes any previous demo data first so the demo always
        // starts from a known state (great for presentations / sales
        // demos that need predictable, curated content).
        //
        // We split the seeding into TWO calls because Vercel's 10s
        // serverless timeout can't fit all the writes in a single call:
        //   1. /api/seed-demo  — personas, conversations, groups, stories, etc.
        //   2. /api/seed-schools — Nile International School + 3 students
        // Both are idempotent so a partial-failure retry is safe.
        try {
          await fetch('/api/seed-demo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset: true }),
          })
          // Fire-and-forget the school seeding — if it fails, the user can
          // still use the rest of the app.
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
      // After a fresh signup, the user has no data — seed the rich demo
      // dataset so the chat experience is immediately impressive.
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

  const loginIdType = identifier.includes('@') ? 'email' : /^\+?[\d\s-]+$/.test(identifier) && identifier.replace(/[\s-]/g, '').length >= 8 ? 'phone' : 'username'
  const LoginIcon = loginIdType === 'email' ? Mail : loginIdType === 'phone' ? Phone : AtSign
  const signupIdType = signupIdentifier.includes('@') ? 'email' : /^\+?[\d\s-]+$/.test(signupIdentifier) && signupIdentifier.replace(/[\s-]/g, '').length >= 8 ? 'phone' : 'username'
  const SignupIdIcon = signupIdType === 'email' ? Mail : signupIdType === 'phone' ? Phone : AtSign

  // Shared inline style objects — wasl-input-premium class adds the soft
  // green focus glow on top of these base styles.
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '44px',
    padding: '0 12px 0 40px',
    border: `1px solid ${C.teal}33`,
    borderRadius: '12px',
    fontSize: '14px',
    fontFamily: 'inherit',
    background: C.cream,
    color: C.charcoal,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s, background-color 0.2s',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: C.teal,
    marginBottom: '6px',
    display: 'block',
    fontFamily: 'inherit',
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

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ANIM_CSS }} />
      <div
        className="wasl-mesh-bg wasl-mesh-animated"
        data-theme="cirkle"
        style={{
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: `linear-gradient(135deg, ${C.teal} 0%, ${C.tealLight} 40%, ${C.teal} 70%, ${C.gold} 100%)`,
          position: 'relative',
          overflow: 'hidden',
        }}>
        {/* Futuristic background glow orbs */}
        <div style={{
          position: 'absolute',
          top: '-100px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${C.gold}33 0%, transparent 60%)`,
          animation: 'cinenav-fade 2s ease-out 0.5s both',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-200px',
          right: '-100px',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${C.rose}22 0%, transparent 60%)`,
          animation: 'cinenav-fade 2s ease-out 1s both',
          pointerEvents: 'none',
        }} />

        {/* Hero section */}
        <div style={{
          textAlign: 'center',
          padding: '40px 24px 20px',
          position: 'relative',
          zIndex: 1,
        }}>
          {/* Logo orb — staggered slide-up entrance + persistent float +
              soft gold glow drop-shadow for a premium feel. Enlarged to 96px. */}
          <div className="wasl-anim-slide-up wasl-stagger-1">
            <div
              className="wasl-float"
              style={{
                display: 'inline-block',
                marginBottom: '16px',
                filter: 'drop-shadow(0 0 24px rgba(194, 160, 96, 0.45)) drop-shadow(0 0 48px rgba(26, 74, 90, 0.25))',
              }}
            >
              <CirkleMark size={96} animated />
            </div>
          </div>

          <div className="wasl-anim-slide-up wasl-stagger-2">
            <h1 className="wasl-shimmer-text" style={{
              fontSize: '2.5rem',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              margin: '0 0 4px',
              lineHeight: 1,
            }}>Wasl</h1>
          </div>

          <div className="wasl-anim-slide-up wasl-stagger-3">
            <p style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: '0.875rem',
              margin: '0 0 16px',
              letterSpacing: '0.05em',
            }}>Simple. Secure. Connected.</p>
          </div>

          <Cinematic delay="0.9s">
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '20px',
              flexWrap: 'wrap' as const,
            }}>
              {[
                { icon: <ShieldCheck style={{ width: 14, height: 14 }} />, text: 'End-to-end encrypted' },
                { icon: <Zap style={{ width: 14, height: 14 }} />, text: 'Real-time' },
                { icon: <Users style={{ width: 14, height: 14 }} />, text: 'Verified agreements' },
              ].map((f, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '11px',
                  fontWeight: 500,
                }}>
                  {f.icon}
                  {f.text}
                </div>
              ))}
            </div>
          </Cinematic>
        </div>

        {/* Glassmorphism card */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px 40px',
          position: 'relative',
          zIndex: 1,
        }}>
          <div className="wasl-anim-spring-in">
            <div
              className="wasl-glow-card wasl-glass-strong"
              style={{
                width: '100%',
                maxWidth: '420px',
                background: 'rgba(253, 252, 249, 0.95)',
                backdropFilter: 'blur(24px) saturate(200%)',
                WebkitBackdropFilter: 'blur(24px) saturate(200%)',
                borderRadius: '24px',
                border: `1px solid ${C.gold}44`,
                boxShadow: 'var(--wasl-shadow-xl), 0 0 40px rgba(194, 160, 96, 0.18)',
                padding: '32px 28px 28px',
                boxSizing: 'border-box' as const,
              }}>
              {/* Tab switcher — staggered slide-up entrance. */}
              <div
                className="wasl-anim-slide-up wasl-stagger-4"
                style={{
                  display: 'flex',
                  padding: '4px',
                  background: `rgba(26, 74, 90, 0.06)`,
                  borderRadius: '14px',
                  border: `1px solid ${C.teal}22`,
                  marginBottom: '24px',
                }}
              >
                {(['signup', 'login'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMode(tab)}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '14px',
                      fontWeight: 600,
                      transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
                      ...(mode === tab
                        ? { background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, color: C.charcoal, boxShadow: `0 4px 12px ${C.gold}44` }
                        : { background: 'transparent', color: C.teal + '99' }),
                    }}
                  >
                    {tab === 'signup' ? 'Sign up' : 'Log in'}
                  </button>
                ))}
              </div>

              {/* Heading */}
              <Cinematic delay="1.3s">
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: C.teal,
                  margin: '0 0 4px',
                  fontFamily: 'inherit',
                }}>
                  {mode === 'signup' ? 'Create your account' : 'Welcome back'}
                </h2>
                <p style={{
                  fontSize: '13px',
                  color: C.teal + '99',
                  margin: '0 0 24px',
                  fontFamily: 'inherit',
                }}>
                  {mode === 'signup'
                    ? 'Sign up with your Cirkle email or phone.'
                    : 'Log in with your email, phone, or username.'}
                </p>
              </Cinematic>

              {/* Form — staggered entrance via the form element itself. */}
              <form onSubmit={submit} className="wasl-anim-slide-up wasl-stagger-5" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {mode === 'signup' ? (
                  <>
                    {/* Name + Username */}
                    <div>
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
                    </div>

                    <div>
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
                        {usernameStatus.checking && <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}><Loader2 style={{ width: 16, height: 16, animation: 'ring-rotate 0.8s linear infinite' }} /></span>}
                        {!usernameStatus.checking && usernameStatus.available === true && <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#22c55e' }}><Check style={{ width: 16, height: 16 }} /></span>}
                        {!usernameStatus.checking && usernameStatus.available === false && <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#ef4444' }}><X style={{ width: 16, height: 16 }} /></span>}
                      </div>
                    </div>

                    {/* Email/Phone (optional) */}
                    <div>
                      <label style={labelStyle} htmlFor="signup-id">Cirkle email or phone <span style={{ fontWeight: 400, color: C.teal + '66' }}>(optional)</span></label>
                      <div style={{ position: 'relative' }}>
                        <span style={iconWrapStyle}><SignupIdIcon style={{ width: 16, height: 16 }} /></span>
                        <input
                          id="signup-id"
                          type="text"
                          className="wasl-input-premium"
                          placeholder="you@cirkle.app or +20 100 123 4567"
                          value={signupIdentifier}
                          onChange={(e) => setSignupIdentifier(e.target.value)}
                          autoComplete="off"
                          disabled={loading}
                          style={inputStyle}
                        />
                      </div>
                      <p style={{ fontSize: '11px', color: C.teal + '77', margin: '4px 0 0' }}>
                        Add an email or phone so you can log in later.
                      </p>
                    </div>
                  </>
                ) : (
                  <div>
                    <label style={labelStyle} htmlFor="identifier">Email, phone, or username</label>
                    <div style={{ position: 'relative' }}>
                      <span style={iconWrapStyle}><LoginIcon style={{ width: 16, height: 16 }} /></span>
                      <input
                        id="identifier"
                        type="text"
                        className="wasl-input-premium"
                        placeholder="you@cirkle.app, +20..., or @username"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        autoComplete="username"
                        disabled={loading}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                )}

                {/* Password */}
                <div>
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
                      style={{ ...inputStyle, paddingRight: '40px' }}
                    />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: 14,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          color: C.teal + '99',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                      </button>
                    </div>
                  </div>

                {/* Submit button — wasl-btn-sheen adds a moving highlight sweep
                    on hover. Combined with the gold gradient for premium CTA. */}
                <div className="wasl-anim-slide-up wasl-stagger-6">
                  <button
                    type="submit"
                    className="wasl-btn-sheen"
                    disabled={loading || (mode === 'signup' && usernameStatus.available === false)}
                    style={{
                      width: '100%',
                      height: '44px',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                      background: `linear-gradient(135deg, ${C.goldLight}, ${C.gold}, ${C.goldDark})`,
                      color: C.charcoal,
                      boxShadow: `0 4px 16px ${C.gold}44`,
                      transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      position: 'relative' as const,
                      overflow: 'hidden' as const,
                    }}
                    onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${C.gold}66` } }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 16px ${C.gold}44` }}
                  >
                    {loading && <Loader2 style={{ width: 16, height: 16, animation: 'ring-rotate 0.8s linear infinite' }} />}
                    {mode === 'signup' ? 'Sign up' : 'Log in'}
                  </button>
                </div>
              </form>

              {/* Divider */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                margin: '20px 0 16px',
              }}>
                <div style={{ flex: 1, height: '1px', background: C.teal + '22' }} />
                <span style={{ fontSize: '11px', color: C.teal + '66', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
                <div style={{ flex: 1, height: '1px', background: C.teal + '22' }} />
              </div>

              {/* Demo button */}
              <div className="wasl-anim-slide-up wasl-stagger-6">
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  disabled={loading}
                  style={{
                    width: '100%',
                    height: '40px',
                    border: `1px solid ${C.gold}55`,
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    background: 'transparent',
                    color: C.goldDark,
                    transition: 'all 0.25s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = `${C.gold}11`; e.currentTarget.style.borderColor = C.gold }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = `${C.gold}55` }}
                >
                  {loading ? <Loader2 style={{ width: 16, height: 16, animation: 'ring-rotate 0.8s linear infinite' }} /> : <Sparkles style={{ width: 16, height: 16 }} />}
                  Try the rich demo
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <Cinematic delay="2s">
          <footer style={{
            textAlign: 'center',
            padding: '12px 24px',
            color: 'rgba(255,255,255,0.6)',
            fontSize: '11px',
            fontFamily: 'inherit',
            position: 'relative',
            zIndex: 1,
          }}>
            Wasl &copy; {new Date().getFullYear()} &middot; End-to-end inspired messaging &middot; Commit-verified agreements
          </footer>
        </Cinematic>
      </div>
    </>
  )
}
