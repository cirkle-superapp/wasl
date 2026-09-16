'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, User, Lock, Mail, Phone, AtSign, Check, X, Sparkles, Eye, EyeOff, ShieldCheck, Zap, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useWaslStore } from '@/lib/store'
import { useColorTheme } from './color-theme-provider'
import { WaslLogo } from './wasl-logo'
import { cn } from '@/lib/utils'

const DEMO_USERNAME = 'demo'
const DEMO_PASSWORD = 'demo123'

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  // Unified identifier for login: email / phone / username
  const [identifier, setIdentifier] = useState('')
  // Signup fields
  const [signupIdentifier, setSignupIdentifier] = useState('') // email or phone
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
  const { colorTheme } = useColorTheme()
  const isCirkle = colorTheme === 'cirkle'
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live username availability check (debounced)
  useEffect(() => {
    if (mode !== 'signup') return
    if (!usernameTouched) return
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
        setUsernameStatus({
          checking: false,
          available: data.available,
          message: data.message || '',
          suggestions: data.suggestions || [],
        })
      } catch {
        setUsernameStatus({ checking: false, available: null, message: '', suggestions: [] })
      }
    }, 350)
    return () => {
      if (usernameTimer.current) clearTimeout(usernameTimer.current)
    }
  }, [username, usernameTouched, mode])

  // Auto-generate a username from the name (live, until the user edits it)
  useEffect(() => {
    if (mode !== 'signup') return
    if (usernameTouched) return
    const auto = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 15)
    if (auto && auto !== username) {
      setUsername(auto)
    }
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
          if (!id.trim()) {
            toast.error('Please enter your email, phone, or username')
            return
          }
          if (!p) {
            toast.error('Please enter your password')
            return
          }
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: id, password: p }),
          })
          const data = await res.json()
          if (!res.ok) {
            toast.error(data?.error || 'Login failed')
            return
          }
          setUser(data)
          toast.success(`Welcome to Wasl, ${data.name}!`)
          router.refresh()
        } else {
          // signup
          const n = (overrideName ?? name).trim()
          const u = (overrideUsername ?? username).trim().toLowerCase()
          const sid = overrideSignupId ?? signupIdentifier
          if (!n || n.length < 2) {
            toast.error('Please enter your name (at least 2 characters)')
            return
          }
          if (!u || u.length < 3) {
            toast.error('Please choose a Cirkle username (at least 3 characters)')
            return
          }
          if (!p || p.length < 6) {
            toast.error('Password must be at least 6 characters')
            return
          }
          const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              identifier: sid || undefined,
              password: p,
              name: n,
              username: u,
            }),
          })
          const data = await res.json()
          if (!res.ok) {
            if (data.suggestions?.length) {
              toast.error(data.error, { description: `Try: ${data.suggestions.join(', ')}` })
            } else {
              toast.error(data?.error || 'Sign up failed')
            }
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
      // Try login first
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: DEMO_USERNAME, password: DEMO_PASSWORD }),
      })
      if (loginRes.ok) {
        const data = await loginRes.json()
        setUser(data)
        toast.success(`Welcome to Wasl, ${data.name}!`)
        router.refresh()
        return
      }
      // Sign up the demo account
      const signupRes = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: '+201001234567',
          password: DEMO_PASSWORD,
          name: 'Demo User',
          username: DEMO_USERNAME,
        }),
      })
      const data = await signupRes.json()
      if (!signupRes.ok) {
        toast.error(data?.error || 'Failed to start demo')
        return
      }
      setUser(data)
      toast.success(`Welcome to Wasl, ${data.name}!`)
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  // Detect identifier type for the login input icon
  const loginIdType = identifier.includes('@')
    ? 'email'
    : /^\+?[\d\s-]+$/.test(identifier) && identifier.replace(/[\s-]/g, '').length >= 8
    ? 'phone'
    : 'username'
  const LoginIcon = loginIdType === 'email' ? Mail : loginIdType === 'phone' ? Phone : AtSign

  // Detect signup identifier type for the icon
  const signupIdType = signupIdentifier.includes('@')
    ? 'email'
    : /^\+?[\d\s-]+$/.test(signupIdentifier) && signupIdentifier.replace(/[\s-]/g, '').length >= 8
    ? 'phone'
    : 'username'
  const SignupIdIcon = signupIdType === 'email' ? Mail : signupIdType === 'phone' ? Phone : AtSign

  return (
    <div className="min-h-screen w-full flex flex-col">
      {/* Top hero banner — compact with logo + tagline + trust badges */}
      <div
        className={cn(
          'text-white py-6 px-6',
          isCirkle
            ? 'wasl-gradient-hero-cirkle'
            : 'bg-gradient-to-br from-[var(--wasl-teal)] via-[var(--wasl-teal)] to-[var(--wasl-teal-dark)]'
        )}
      >
        <div className="max-w-md mx-auto text-center space-y-3">
          <div className={cn('inline-flex items-center justify-center wasl-auth-logo-float', isCirkle && 'wasl-cirkle-splash-in')}>
            <WaslLogo size={64} animated />
          </div>
          <h1
            className={cn(
              'text-3xl font-bold tracking-tight',
              isCirkle && 'wasl-text-gradient-cirkle'
            )}
          >
            Wasl
          </h1>
          <p className="text-white/85 text-xs leading-relaxed">
            Simple. Secure. Connected.
          </p>
          {/* Trust badges */}
          <div className="flex items-center justify-center gap-4 mt-3">
            <div className="wasl-feature-pill text-white/70 text-[10px]">
              <ShieldCheck className="w-3 h-3" /> End-to-end encrypted
            </div>
            <div className="wasl-feature-pill text-white/70 text-[10px]">
              <Zap className="w-3 h-3" /> Real-time
            </div>
            <div className="wasl-feature-pill text-white/70 text-[10px]">
              <Users className="w-3 h-3" /> Verified agreements
            </div>
          </div>
        </div>
      </div>

      {/* Form area pinned to bottom */}
      <div className="flex-1 flex items-center justify-center bg-[var(--wasl-chat-bg)] px-6 py-8">
        <div className="w-full max-w-md bg-white dark:bg-[var(--wasl-sidebar-bg)] rounded-2xl shadow-xl border border-border p-7 space-y-5">
          {/* Tab switcher — segmented control for Sign up / Log in */}
          <div className="relative flex p-1 bg-muted/50 rounded-xl border border-border/60">
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={cn(
                'flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 relative z-10',
                mode === 'signup'
                  ? 'text-white shadow-sm bg-[var(--wasl-green)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className={cn(
                'flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 relative z-10',
                mode === 'login'
                  ? 'text-white shadow-sm bg-[var(--wasl-green)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Log in
            </button>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold text-foreground">
              {mode === 'signup' ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === 'signup'
                ? 'Sign up with your Cirkle email or phone. We will auto-suggest a username.'
                : 'Log in with your email, phone number, or username.'}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'login' ? (
              <>
                {/* Login: unified identifier */}
                <div className="space-y-2">
                  <Label htmlFor="identifier">Email, phone, or username</Label>
                  <div className="relative">
                    <LoginIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="identifier"
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="you@cirkle.app, +20..., or @username"
                      className="wasl-auth-input pl-9"
                      autoComplete="username"
                      disabled={loading}
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      className="wasl-auth-input pl-9 pr-9"
                      autoComplete="current-password"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Signup: name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Your name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Ahmad Ali"
                      className="wasl-auth-input pl-9"
                      autoComplete="name"
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Signup: Cirkle username with live availability */}
                <div className="space-y-2">
                  <Label htmlFor="username" className="flex items-center gap-1.5">
                    Cirkle username
                    {usernameStatus.checking && (
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    )}
                    {usernameStatus.available === true && (
                      <span className="flex items-center gap-0.5 text-[var(--wasl-green)] text-xs">
                        <Check className="w-3 h-3" /> Available
                      </span>
                    )}
                    {usernameStatus.available === false && (
                      <span className="flex items-center gap-0.5 text-destructive text-xs">
                        <X className="w-3 h-3" /> Taken
                      </span>
                    )}
                  </Label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                        setUsernameTouched(true)
                      }}
                      placeholder="ahmad_ali"
                      className="wasl-auth-input pl-9"
                      disabled={loading}
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                  </div>
                  {usernameStatus.available === false && usernameStatus.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Try:
                      </span>
                      {usernameStatus.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setUsername(s)
                            setUsernameTouched(true)
                          }}
                          className="text-xs px-2 py-0.5 rounded-full bg-[var(--wasl-green)]/15 text-[var(--wasl-green)] hover:bg-[var(--wasl-green)]/25 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {!usernameTouched && name.trim() && (
                    <p className="text-[10px] text-muted-foreground">
                      Auto-suggested from your name. Tap to edit.
                    </p>
                  )}
                </div>

                {/* Signup: email or phone (optional) */}
                <div className="space-y-2">
                  <Label htmlFor="signup-id">Cirkle email or phone (optional)</Label>
                  <div className="relative">
                    <SignupIdIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-id"
                      type="text"
                      value={signupIdentifier}
                      onChange={(e) => setSignupIdentifier(e.target.value)}
                      placeholder="you@cirkle.app or +20 100 123 4567"
                      className="wasl-auth-input pl-9"
                      disabled={loading}
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add an email or phone so you can log in with it later. You can add more in Settings.
                  </p>
                </div>

                {/* Signup: password */}
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="wasl-auth-input pl-9 pr-9"
                      autoComplete="new-password"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <Button
              type="submit"
              className={cn(
                'wasl-btn-shimmer w-full font-medium',
                isCirkle
                  ? 'wasl-gradient-gold hover:opacity-90 text-[var(--cirkle-charcoal)]'
                  : 'bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white'
              )}
              disabled={loading || (mode === 'signup' && usernameStatus.available === false)}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === 'signup' ? 'Sign up' : 'Log in'}
            </Button>

            {/* Forgot password link (login mode only) */}
            {mode === 'login' && (
              <div className="text-right -mt-1">
                <button
                  type="button"
                  onClick={() => toast.info('Password reset coming soon. For demo, use username "demo" and password "demo123".')}
                  className={cn(
                    'text-xs hover:underline transition-colors',
                    isCirkle ? 'text-[#c2a060]' : 'text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]'
                  )}
                >
                  Forgot password?
                </button>
              </div>
            )}
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-[var(--wasl-sidebar-bg)] px-3 text-muted-foreground">
                or
              </span>
            </div>
          </div>

          <div className="text-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                'w-full',
                isCirkle && 'border-[#c2a060]/40 text-[#9a7a3e] hover:bg-[#c2a060]/10 hover:text-[#9a7a3e]'
              )}
              disabled={loading}
              onClick={handleDemoLogin}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Try the live demo
            </Button>
          </div>
        </div>
      </div>

      <footer className="bg-[var(--wasl-teal)] text-white/80 text-xs text-center py-3 px-6">
        Wasl &copy; {new Date().getFullYear()} &middot; End-to-end inspired messaging &middot; Commit-verified agreements
      </footer>
    </div>
  )
}
