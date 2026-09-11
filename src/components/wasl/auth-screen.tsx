'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Phone, User } from 'lucide-react'
import { toast } from 'sonner'
import { useWaslStore } from '@/lib/store'
import { WaslLogo } from './wasl-logo'
import { useColorTheme } from './color-theme-provider'
import { cn } from '@/lib/utils'

const DEMO_PHONE = '+201001234567'
const DEMO_NAME = 'Demo User'

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const setUser = useWaslStore((s) => s.setUser)
  const router = useRouter()
  const { colorTheme } = useColorTheme()
  const isCirkle = colorTheme === 'cirkle'

  // Quick prefill helper for demo: ?demo=1
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('demo') === '1') {
        setPhone(DEMO_PHONE)
        setName(DEMO_NAME)
      }
    }
  }, [])

  // Core submission logic — callable directly so the demo button can trigger
  // a full signup + navigation in a single click.
  const authenticate = useCallback(
    async (
      overridePhone?: string,
      overrideName?: string,
      overrideMode?: 'login' | 'signup'
    ) => {
      const p = (overridePhone ?? phone).trim()
      const n = (overrideName ?? name).trim()
      const m = overrideMode ?? mode
      if (!p) {
        toast.error('Please enter your phone number')
        return
      }
      if (m === 'signup' && n.length < 2) {
        toast.error('Please enter your name (at least 2 characters)')
        return
      }
      setLoading(true)
      try {
        const res = await fetch(`/api/auth/${m}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: p, name: n }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data?.error || 'Something went wrong')
          return
        }
        setUser(data)
        toast.success(`Welcome to Wasl, ${data.name}!`)
        // Hard refresh so the server component re-reads the new session cookie
        // and swaps the AuthScreen for the ChatApp.
        router.refresh()
      } catch (err) {
        console.error(err)
        toast.error('Network error')
      } finally {
        setLoading(false)
      }
    },
    [phone, name, mode, setUser, router]
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    void authenticate()
  }

  function handleDemoLogin() {
    // One-click: pre-fill, switch to signup mode, and authenticate immediately.
    setPhone(DEMO_PHONE)
    setName(DEMO_NAME)
    setMode('signup')
    void authenticate(DEMO_PHONE, DEMO_NAME, 'signup')
  }

  return (
    <div className="min-h-screen w-full flex flex-col">
      {/* Top hero banner with animated Wasl logo */}
      <div
        className={cn(
          'text-white py-10 px-6',
          isCirkle
            ? 'wasl-gradient-hero-cirkle'
            : 'bg-gradient-to-br from-[var(--wasl-teal)] via-[var(--wasl-teal)] to-[var(--wasl-teal-dark)]'
        )}
      >
        <div className="max-w-md mx-auto text-center space-y-4">
          <div className={cn('inline-flex items-center justify-center', isCirkle && 'wasl-cirkle-splash-in')}>
            <WaslLogo size={88} animated />
          </div>
          <h1
            className={cn(
              'text-4xl font-bold tracking-tight',
              isCirkle && 'wasl-text-gradient-cirkle'
            )}
          >
            Wasl
          </h1>
          <p className="text-white/85 text-sm leading-relaxed">
            Simple. Secure. Connected.<br />
            Send and receive messages that stay between you and the people who matter.
          </p>
        </div>
      </div>

      {/* Form area pinned to bottom */}
      <div className="flex-1 flex items-center justify-center bg-[var(--wasl-chat-bg)] px-6 py-10">
        <div className="w-full max-w-md bg-white dark:bg-[var(--wasl-sidebar-bg)] rounded-2xl shadow-xl border border-border p-8 space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold text-foreground">
              {mode === 'signup' ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === 'signup'
                ? 'Sign up with your phone number to start messaging on Wasl.'
                : 'Log in to continue your conversations.'}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+20 100 123 4567"
                  className="pl-9"
                  autoComplete="tel"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">
                {mode === 'signup' ? 'Your name' : 'Display name (optional)'}
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ahmad Ali"
                  className="pl-9"
                  autoComplete="name"
                  disabled={loading}
                />
              </div>
            </div>

            <Button
              type="submit"
              className={cn(
                'w-full font-medium',
                isCirkle
                  ? 'wasl-gradient-gold hover:opacity-90 text-[#1a1a14]'
                  : 'bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white'
              )}
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === 'signup' ? 'Sign up' : 'Log in'}
            </Button>
          </form>

          <div className="text-center text-sm">
            {mode === 'signup' ? (
              <span className="text-muted-foreground">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={cn(
                    'font-medium hover:underline',
                    isCirkle ? 'text-[#c2a060]' : 'text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]'
                  )}
                >
                  Log in
                </button>
              </span>
            ) : (
              <span className="text-muted-foreground">
                New to Wasl?{' '}
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={cn(
                    'font-medium hover:underline',
                    isCirkle ? 'text-[#c2a060]' : 'text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]'
                  )}
                >
                  Create an account
                </button>
              </span>
            )}
          </div>

          <div className="pt-2 text-center">
            <p className="text-xs text-muted-foreground mb-2">
              Tip: explore Wasl in one click
            </p>
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
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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
