'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Smartphone,
  Monitor,
  Tablet,
  Loader2,
  Trash2,
  LogOut,
  CheckCircle2,
  Clock,
  Wifi,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getDeviceId } from '@/lib/socket'

// ═══════════════════════════════════════════════════════════════════════
// DevicesDialog (Task 93) — multi-device session management
// ═══════════════════════════════════════════════════════════════════════
//
// Lists every device the user is currently signed in on (web + mobile PWA
// + tablet). Supports:
//   - Revoke a single device (DELETE /api/devices/[id])
//   - Sign out everywhere except this device (POST /api/devices/revoke-all)
//   - Live updates: the chat-service emits 'device:connected' /
//     'device:disconnected' events when devices come and go — we re-fetch
//     the list on those events so the UI is always up-to-date.
//   - Highlights the current device (matched by localStorage deviceId).

type Device = {
  id: string
  deviceId: string
  deviceName: string
  userAgent: string | null
  ip: string | null
  online: boolean
  lastSeenAt: string
  createdAt: string
  isPWA: boolean
}

export function DevicesDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)
  const currentDeviceId = typeof window !== 'undefined' ? getDeviceId() : ''

  const fetchDevices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/devices', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setDevices(data.devices || [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (open) fetchDevices()
  }, [open, fetchDevices])

  // ── Live updates: listen for socket 'device:connected' / 'device:disconnected'
  // events + re-fetch the device list when they fire. ──────────────────
  useEffect(() => {
    if (!open) return
    const handler = () => fetchDevices()
    // The chat-app mounts the socket listeners; we just listen for our
    // window-dispatched events (the chat-app forwards socket events).
    window.addEventListener('wasl:device-connected', handler)
    window.addEventListener('wasl:device-disconnected', handler)
    return () => {
      window.removeEventListener('wasl:device-connected', handler)
      window.removeEventListener('wasl:device-disconnected', handler)
    }
  }, [open, fetchDevices])

  async function handleRevoke(id: string) {
    if (!confirm('Sign out this device? The user on that device will be disconnected.')) return
    setRevokingId(id)
    try {
      const res = await fetch(`/api/devices/${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed'); return }
      toast.success('Device signed out')
      fetchDevices()
    } catch { toast.error('Network error') }
    finally { setRevokingId(null) }
  }

  async function handleRevokeAll() {
    if (!confirm('Sign out EVERY other device? You will stay signed in on this device only.')) return
    setRevokingAll(true)
    try {
      const res = await fetch('/api/devices/revoke-all', {
        method: 'POST',
        headers: { 'X-Device-Id': currentDeviceId },
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error || 'Failed'); return }
      toast.success(`Signed out ${data.revokedCount} device${data.revokedCount === 1 ? '' : 's'}`)
      fetchDevices()
    } catch { toast.error('Network error') }
    finally { setRevokingAll(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto wasl-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[var(--wasl-green)]" />
            Your devices
          </DialogTitle>
          <DialogDescription>
            Every browser, PWA install, and mobile session you're signed in on.
            Real-time sync keeps your messages up-to-date across all of them.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : devices.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No devices registered yet.
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg border border-[var(--wasl-green)]/30 bg-[var(--wasl-green)]/5 p-2">
                <div className="text-sm font-bold text-[var(--wasl-green)]">
                  {devices.filter((d) => d.online).length}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Online now</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-2">
                <div className="text-sm font-bold">{devices.length}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</div>
              </div>
            </div>

            {/* Device list */}
            <div className="space-y-2 mt-2">
              {devices.map((d) => {
                const isCurrent = d.deviceId === currentDeviceId
                const icon = pickDeviceIcon(d.deviceName)
                const Icon = icon
                return (
                  <div
                    key={d.id}
                    className={cn(
                      'rounded-lg border p-3 transition-colors',
                      isCurrent
                        ? 'border-[var(--wasl-green)]/40 bg-[var(--wasl-green)]/5'
                        : d.online
                          ? 'border-border'
                          : 'border-border/60 opacity-75',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                        d.online ? 'bg-[var(--wasl-green)]/15 text-[var(--wasl-green)]' : 'bg-muted text-muted-foreground',
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{d.deviceName}</span>
                          {d.isPWA && (
                            <span className="text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500">
                              PWA
                            </span>
                          )}
                          {isCurrent && (
                            <span className="text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full bg-[var(--wasl-green)]/15 text-[var(--wasl-green)]">
                              This device
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                          {d.online ? (
                            <>
                              <Wifi className="w-3 h-3" />
                              <span>Online now</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3" />
                              <span>Last seen {timeAgo(d.lastSeenAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {!isCurrent && (
                        <Button
                          onClick={() => handleRevoke(d.id)}
                          disabled={revokingId === d.id}
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                        >
                          {revokingId === d.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="w-3 h-3 mr-1" />
                              Revoke
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Sign out everywhere */}
            <div className="pt-3 mt-3 border-t border-border">
              <Button
                onClick={handleRevokeAll}
                disabled={revokingAll || devices.length <= 1}
                variant="outline"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {revokingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing out…
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign out everywhere except this device
                  </>
                )}
              </Button>
              {devices.length <= 1 && (
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  Only 1 device signed in — nothing to sign out.
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Pick the most appropriate icon for a device name
function pickDeviceIcon(deviceName: string): typeof Smartphone {
  const lower = deviceName.toLowerCase()
  if (lower.includes('iphone')) return Smartphone
  if (lower.includes('ipad') || lower.includes('tablet')) return Tablet
  if (lower.includes('android')) return Smartphone
  if (lower.includes('macos') || lower.includes('windows') || lower.includes('linux')) return Monitor
  return Smartphone
}

// Human-friendly "time ago" formatter
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
