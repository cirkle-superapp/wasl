'use client'

import { useState, useEffect } from 'react'
import { Download, X, Smartphone, Share, Plus, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ═══════════════════════════════════════════════════════════════════════
// PWA Install Banner (Task 93)
// ═══════════════════════════════════════════════════════════════════════
//
// Lets users install Wasl as a mobile app directly from their phone's
// browser — NO App Store or Google Play needed.
//
// Behavior:
//   - On Chrome/Edge Android + desktop PWA: listens for the
//     `beforeinstallprompt` event, shows an "Install" button that triggers
//     the native install prompt.
//   - On iOS Safari: no `beforeinstallprompt` event (Apple doesn't support
//     it). Instead we detect iOS + Safari and show step-by-step
//     instructions ("Tap Share → Add to Home Screen").
//   - Once installed (or dismissed 3 times), the banner hides permanently
//     via localStorage flag.
//
// Mount this component once at the app root (it conditionally renders
// only when an install prompt is available OR we're on iOS Safari).

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'wasl-pwa-install-dismissed'
const DISMISS_LIMIT = 3

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [dismissCount, setDismissCount] = useState(0)
  const [installing, setInstalling] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Don't show on SSR
    if (typeof window === 'undefined') return

    // Already installed? (PWA display-mode: standalone OR iOS navigator.standalone)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    if (standalone) {
      setIsInstalled(true)
      return
    }

    // Load dismiss count
    try {
      const stored = localStorage.getItem(DISMISS_KEY)
      const count = stored ? parseInt(stored, 10) || 0 : 0
      setDismissCount(count)
      if (count >= DISMISS_LIMIT) return // user has dismissed 3 times, stop showing
    } catch { /* ignore */ }

    // Detect iOS Safari (no beforeinstallprompt support)
    const ua = navigator.userAgent
    const isIOSDevice = /iPhone|iPad|iPod/i.test(ua)
    const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua)
    setIsIOS(isIOSDevice && isSafari)

    // Listen for beforeinstallprompt (Chrome/Edge Android + desktop PWA)
    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // stop the browser's default mini-infobar
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // Listen for appinstalled event (fired after install succeeds)
    const onAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      setVisible(false)
      toast.success('Wasl installed! 🎉 Find it on your home screen.')
    }
    window.addEventListener('appinstalled', onAppInstalled)

    // For iOS Safari, show the banner after a delay (since there's no
    // beforeinstallprompt event). We can't trigger install programmatically.
    let iOSDelay: number | undefined
    if (isIOSDevice && isSafari) {
      iOSDelay = window.setTimeout(() => setVisible(true), 5000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onAppInstalled)
      if (iOSDelay) clearTimeout(iOSDelay)
    }
  }, [])

  // Defer showing the banner by 500ms after mount so it doesn't flash
  // before the beforeinstallprompt listener is attached
  useEffect(() => {
    if (!visible) return
    const id = setTimeout(() => setVisible(true), 0)
    return () => clearTimeout(id)
  }, [visible])

  async function handleInstallClick() {
    if (!deferredPrompt) return
    setInstalling(true)
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') {
        // The appinstalled event handler will toast + hide
      } else {
        // User dismissed
        bumpDismissCount()
        setVisible(false)
      }
      setDeferredPrompt(null)
    } catch (err) {
      toast.error('Install failed — try again')
    } finally {
      setInstalling(false)
    }
  }

  function bumpDismissCount() {
    const newCount = dismissCount + 1
    setDismissCount(newCount)
    try { localStorage.setItem(DISMISS_KEY, String(newCount)) } catch { /* ignore */ }
  }

  function handleDismiss() {
    bumpDismissCount()
    setVisible(false)
  }

  // Don't render anything if:
  // - Already installed (running as PWA)
  // - Dismissed 3+ times
  // - Not visible (no beforeinstallprompt OR not iOS)
  if (isInstalled || dismissCount >= DISMISS_LIMIT || !visible) return null

  // iOS path: show step-by-step instructions (no install button)
  if (isIOS) {
    if (!showIOSInstructions) {
      return (
        <div className="wasl-pwa-banner wasl-pwa-banner-ios">
          <Smartphone className="w-4 h-4 text-[var(--wasl-green)] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Install Wasl on your iPhone</div>
            <div className="text-[11px] text-muted-foreground">
              Tap below for 3-step instructions
            </div>
          </div>
          <button
            onClick={() => setShowIOSInstructions(true)}
            className="wasl-pwa-install-btn"
          >
            Install
          </button>
          <button onClick={handleDismiss} className="wasl-pwa-dismiss" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )
    }
    return (
      <div className="wasl-pwa-banner wasl-pwa-banner-ios-instructions">
        <div className="flex items-start gap-2">
          <Smartphone className="w-4 h-4 text-[var(--wasl-green)] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium mb-2">Install Wasl on iPhone (3 steps)</div>
            <ol className="space-y-1.5 text-[11px] text-foreground/80">
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-[var(--wasl-green)]">1.</span>
                <span>Tap the <Share className="inline w-3 h-3 align-middle mx-0.5" /> Share button at the bottom of Safari</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-[var(--wasl-green)]">2.</span>
                <span>Scroll down and tap <Plus className="inline w-3 h-3 align-middle mx-0.5" /> "Add to Home Screen"</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-[var(--wasl-green)]">3.</span>
                <span>Tap "Add" — Wasl will appear on your home screen</span>
              </li>
            </ol>
            <div className="text-[10px] text-muted-foreground mt-2">
              Once installed, Wasl works offline + syncs across all your devices.
            </div>
          </div>
        </div>
        <button onClick={() => { setShowIOSInstructions(false); handleDismiss() }} className="wasl-pwa-dismiss mt-2 self-end" aria-label="Close">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  // Chrome/Edge/Android path: native install button
  return (
    <div className="wasl-pwa-banner">
      <Download className="w-4 h-4 text-[var(--wasl-green)] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">Install Wasl app</div>
        <div className="text-[11px] text-muted-foreground">
          Works offline · syncs across all your devices
        </div>
      </div>
      <button
        onClick={handleInstallClick}
        disabled={installing}
        className="wasl-pwa-install-btn"
      >
        {installing ? (
          <>
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Installing…
          </>
        ) : (
          <>
            <Download className="w-3 h-3 mr-1" />
            Install
          </>
        )}
      </button>
      <button onClick={handleDismiss} className="wasl-pwa-dismiss" aria-label="Dismiss">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
