'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Loader2, Moon, Sun, Bell, Trash2, User, Phone, Info, RefreshCw, Palette, ShieldCheck, Building2, Search } from 'lucide-react'
import { useWaslStore } from '@/lib/store'
import { WaslAvatar } from './wasl-avatar'
import { useColorTheme } from './color-theme-provider'
import { VerifyPersonDialog } from './verify-person-dialog'
import { BusinessRegisterDialog } from './business-register-dialog'
import { BusinessDashboardDialog } from './business-dashboard-dialog'
import { BusinessSearchDialog } from './business-search-dialog'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { user, setUser } = useWaslStore()
  const { theme, setTheme } = useTheme()
  const { colorTheme, setColorTheme } = useColorTheme()
  const [name, setName] = useState(user?.name || '')
  const [about, setAbout] = useState(user?.about || '')
  const [saving, setSaving] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [bizRegisterOpen, setBizRegisterOpen] = useState(false)
  const [bizSearchOpen, setBizSearchOpen] = useState(false)
  const [myBusinesses, setMyBusinesses] = useState<any[]>([])
  const [activeBizId, setActiveBizId] = useState<string | null>(null)
  const [bizDashOpen, setBizDashOpen] = useState(false)

  // Load my businesses when the dialog opens
  useEffect(() => {
    if (open) {
      fetch('/api/business', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          setMyBusinesses(d.businesses || [])
        })
        .catch(() => {})
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setName(user?.name || '')
      setAbout(user?.about || '')
    }
  }, [open, user])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, about }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Failed to save')
        return
      }
      const data = await res.json()
      setUser(data.user)
      toast.success('Profile updated')
      onOpenChange(false)
    } catch (e) {
      console.error(e)
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function seedDemo() {
    setSaving(true)
    try {
      const res = await fetch('/api/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 8 }),
      })
      if (!res.ok) {
        toast.error('Failed to seed demo data')
        return
      }
      toast.success('Demo data added! Refreshing chat list…')
      // Refresh conversation list
      const freshRes = await fetch(`/api/conversations`, { cache: 'no-store' })
      if (freshRes.ok) {
        const convs = await freshRes.json()
        useWaslStore.getState().setConversations(convs.conversations || [])
      }
      onOpenChange(false)
    } catch (e) {
      console.error(e)
      toast.error('Failed to seed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your profile, theme and demo data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Avatar preview */}
          <div className="flex items-center gap-3">
            <WaslAvatar
              name={name || user?.name || 'Me'}
              src={user?.avatar}
              color={user?.avatarColor}
              size={64}
            />
            <div className="min-w-0">
              <div className="font-semibold truncate">{user?.name}</div>
              <div className="text-sm text-muted-foreground truncate">
                {user?.phone}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-9"
                maxLength={50}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-about">About</Label>
            <Textarea
              id="profile-about"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              maxLength={200}
              rows={2}
            />
            <p className="text-xs text-muted-foreground text-right">
              {about.length} / 200
            </p>
          </div>

          <div className="space-y-2">
            <Label>Phone (read-only)</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={user?.phone || ''}
                readOnly
                disabled
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Appearance</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => setTheme('light')}
                className="flex-1"
              >
                <Sun className="w-4 h-4 mr-2" /> Light
              </Button>
              <Button
                type="button"
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => setTheme('dark')}
                className="flex-1"
              >
                <Moon className="w-4 h-4 mr-2" /> Dark
              </Button>
            </div>
          </div>

          {/* Color theme — Cirkle palette integration */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Palette className="w-4 h-4" /> Color theme
            </Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Choose the signature accent palette. Cirkle uses a premium
              gold / teal / cream system inspired by دواير.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setColorTheme('wasl')}
                className={cn(
                  'flex flex-col items-start gap-2 p-3 rounded-lg border-2 transition-all text-left',
                  colorTheme === 'wasl'
                    ? 'border-[var(--wasl-green)] bg-[var(--wasl-green)]/5'
                    : 'border-border hover:border-foreground/30'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[#25d366]" />
                  <span className="w-4 h-4 rounded-full bg-[#075e54]" />
                  <span className="w-4 h-4 rounded-full bg-[#d9fdd3] border border-border" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Wasl</div>
                  <div className="text-[11px] text-muted-foreground">WhatsApp green</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setColorTheme('cirkle')}
                className={cn(
                  'flex flex-col items-start gap-2 p-3 rounded-lg border-2 transition-all text-left',
                  colorTheme === 'cirkle'
                    ? 'border-[#009588] bg-[#009588]/5'
                    : 'border-border hover:border-foreground/30'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[#009588]" />
                  <span className="w-4 h-4 rounded-full bg-[#1a4a5a]" />
                  <span className="w-4 h-4 rounded-full bg-[#c2a060]" />
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: '#009588' }}>Cirkle</div>
                  <div className="text-[11px] text-muted-foreground">Teal · gold · cream</div>
                </div>
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-border space-y-2">
            <Label className="flex items-center gap-2">
              <Info className="w-4 h-4" /> Demo data
            </Label>
            <p className="text-xs text-muted-foreground">
              Generate sample contacts and conversations to explore Wasl.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={seedDemo}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Add demo contacts
            </Button>
          </div>

          {/* Business accounts section */}
          <div className="pt-2 border-t border-border space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Business
            </Label>
            {/* Identity verification status */}
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg p-2.5 text-xs',
                user?.verified
                  ? 'bg-[var(--wasl-green)]/10 border border-[var(--wasl-green)]/30'
                  : 'bg-amber-500/10 border border-amber-500/30'
              )}
            >
              <ShieldCheck
                className={cn(
                  'w-4 h-4 shrink-0',
                  user?.verified ? 'text-[var(--wasl-green)]' : 'text-amber-500'
                )}
              />
              <div className="flex-1">
                <div className="font-medium">
                  {user?.verified ? 'Identity verified' : 'Identity not verified'}
                </div>
                <p className="text-muted-foreground">
                  {user?.verified
                    ? 'You can register a business.'
                    : 'Verify your identity to unlock business registration.'}
                </p>
              </div>
              {!user?.verified && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setVerifyOpen(true)}
                >
                  Verify
                </Button>
              )}
            </div>

            {/* My businesses */}
            {myBusinesses.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase text-muted-foreground font-semibold">
                  My businesses
                </div>
                {myBusinesses.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setActiveBizId(b.id)
                      setBizDashOpen(true)
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted/60 text-left transition-colors"
                  >
                    <WaslAvatar
                      name={b.name}
                      src={b.avatarPath}
                      color={b.avatarColor}
                      size={28}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-1">
                        {b.name}
                        {b.verified && (
                          <ShieldCheck className="w-3 h-3 text-[var(--wasl-green)] shrink-0" />
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {b.members?.length || 0} member{b.members?.length === 1 ? '' : 's'} · {b.groups?.length || 0} group{b.groups?.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {user?.verified && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setBizRegisterOpen(true)}
                >
                  <Building2 className="w-4 h-4 mr-1" /> Register business
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setBizSearchOpen(true)}
              >
                <Search className="w-4 h-4 mr-1" /> Business search
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || name.trim().length < 2}
              onClick={save}
              className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Business dialogs */}
      <VerifyPersonDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        onVerified={() => {
          // Refresh the user object so the verified badge appears
          if (user) setUser({ ...user, verified: true })
        }}
      />
      <BusinessRegisterDialog
        open={bizRegisterOpen}
        onOpenChange={setBizRegisterOpen}
        onRegistered={(id) => {
          setActiveBizId(id)
          setBizDashOpen(true)
        }}
      />
      <BusinessDashboardDialog
        open={bizDashOpen}
        onOpenChange={setBizDashOpen}
        businessId={activeBizId}
      />
      <BusinessSearchDialog open={bizSearchOpen} onOpenChange={setBizSearchOpen} />
    </Dialog>
  )
}
