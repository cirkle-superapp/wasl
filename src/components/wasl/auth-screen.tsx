'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Phone, User, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useWaslStore } from '@/lib/store'

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const setUser = useWaslStore((s) => s.setUser)
  const router = useRouter()

  // Quick prefill helper for demo: ?demo=1
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('demo') === '1') {
        setPhone('+201001234567')
        setName('Demo User')
      }
    }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) {
      toast.error('Please enter your phone number')
      return
    }
    if (mode === 'signup' && name.trim().length < 2) {
      toast.error('Please enter your name (at least 2 characters)')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          name: name.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Something went wrong')
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

  return (
    <div className="min-h-screen w-full flex flex-col">
      {/* Top hero banner */}
      <div className="bg-[var(--wasl-teal)] text-white py-8 px-6">
        <div className="max-w-md mx-auto text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/15 backdrop-blur">
            <MessageCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Wasl</h1>
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
              className="w-full bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white font-medium"
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
                  className="text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] font-medium hover:underline"
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
                  className="text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] font-medium hover:underline"
                >
                  Create an account
                </button>
              </span>
            )}
          </div>

          <div className="pt-2 text-center">
            <p className="text-xs text-muted-foreground mb-2">
              Tip: try the demo with one click
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={loading}
              onClick={() => {
                setPhone('+201001234567')
                setName('Demo User')
                setMode('signup')
              }}
            >
              Use demo credentials
            </Button>
          </div>
        </div>
      </div>

      <footer className="bg-[var(--wasl-teal)] text-white/80 text-xs text-center py-3 px-6">
        Wasl &copy; {new Date().getFullYear()} &middot; End-to-end inspired messaging
      </footer>
    </div>
  )
}
