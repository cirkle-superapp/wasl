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
import { Switch } from '@/components/ui/switch'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Loader2, Moon, Sun, Bell, Trash2, User, Phone, Info, RefreshCw,
  Palette, ShieldCheck, Building2, Search, Lock, EyeOff, ShieldAlert,
  UserCircle, Shield, Users, Landmark, Ghost, Clock, Camera,
} from 'lucide-react'
import { useWaslStore } from '@/lib/store'
import { WaslAvatar } from './wasl-avatar'
import { useColorTheme } from './color-theme-provider'
import { VerifyPersonDialog } from './verify-person-dialog'
import { BusinessRegisterDialog } from './business-register-dialog'
import { BusinessDashboardDialog } from './business-dashboard-dialog'
import { BusinessSearchDialog } from './business-search-dialog'
import { ServiceProviderDialog } from './service-provider-dialog'
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
  const [activeTab, setActiveTab] = useState('profile')
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [bizRegisterOpen, setBizRegisterOpen] = useState(false)
  const [bizSearchOpen, setBizSearchOpen] = useState(false)
  const [spOpen, setSpOpen] = useState(false)
  const [myBusinesses, setMyBusinesses] = useState<any[]>([])
  const [activeBizId, setActiveBizId] = useState<string | null>(null)
  const [bizDashOpen, setBizDashOpen] = useState(false)
  // Privacy / message-protection local state
  const [defaultProtect, setDefaultProtect] = useState<boolean>(
    !!user?.defaultProtectMessages
  )
  const [alwaysAllow, setAlwaysAllow] = useState<boolean>(
    !!user?.privacyAlwaysAllow
  )
  const [ghostMode, setGhostMode] = useState<boolean>(!!user?.ghostMode)
  const [hideLastSeen, setHideLastSeen] = useState<boolean>(!!user?.hideLastSeen)

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
      setDefaultProtect(!!user?.defaultProtectMessages)
      setAlwaysAllow(!!user?.privacyAlwaysAllow)
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

  async function togglePrivacy(
    field: 'defaultProtectMessages' | 'privacyAlwaysAllow' | 'ghostMode' | 'hideLastSeen',
    value: boolean
  ) {
    if (field === 'defaultProtectMessages') setDefaultProtect(value)
    if (field === 'privacyAlwaysAllow') setAlwaysAllow(value)
    if (field === 'ghostMode') setGhostMode(value)
    if (field === 'hideLastSeen') setHideLastSeen(value)
    try {
      const res = await fetch('/api/privacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        if (field === 'defaultProtectMessages') setDefaultProtect(!value)
        if (field === 'privacyAlwaysAllow') setAlwaysAllow(!value)
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Failed to update privacy setting')
        return
      }
      const data = await res.json()
      if (user) {
        setUser({
          ...user,
          defaultProtectMessages: data.defaultProtectMessages,
          privacyAlwaysAllow: data.privacyAlwaysAllow,
          ghostMode: data.ghostMode,
          hideLastSeen: data.hideLastSeen,
        })
      }
      toast.success(
        field === 'defaultProtectMessages'
          ? value
            ? 'Your messages are now protected by default'
            : 'Default protection disabled'
          : value
            ? 'You can now screenshot & forward any message you receive'
            : 'Privacy-always-allow disabled'
      )
    } catch (e) {
      console.error(e)
      if (field === 'defaultProtectMessages') setDefaultProtect(!value)
      if (field === 'privacyAlwaysAllow') setAlwaysAllow(!value)
      toast.error('Network error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your profile, privacy, and business accounts.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-3 w-full shrink-0">
            <TabsTrigger value="profile" className="text-xs">
              <UserCircle className="w-3.5 h-3.5 mr-1" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="privacy" className="text-xs">
              <Shield className="w-3.5 h-3.5 mr-1" />
              Privacy
            </TabsTrigger>
            <TabsTrigger value="business" className="text-xs">
              <Building2 className="w-3.5 h-3.5 mr-1" />
              Business
            </TabsTrigger>
          </TabsList>

          {/* ---- Profile Tab ---- */}
          <TabsContent value="profile" className="flex-1 overflow-y-auto wasl-scroll -mx-1 px-1 space-y-4 mt-2">
            {/* Avatar preview with upload */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <WaslAvatar
                  name={name || user?.name || 'Me'}
                  src={user?.avatar}
                  color={user?.avatarColor}
                  size={64}
                />
                <label
                  className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-[var(--wasl-green)] text-white flex items-center justify-center cursor-pointer border-2 border-white dark:border-[var(--wasl-sidebar-bg)] hover:bg-[var(--wasl-green-dark)] transition-colors"
                  title="Upload avatar"
                >
                  <Camera className="w-3 h-3" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 1.5 * 1024 * 1024) {
                        toast.error('Image too large (max 1.5MB)')
                        return
                      }
                      const reader = new FileReader()
                      reader.onload = async () => {
                        try {
                          const res = await fetch('/api/profile', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ avatar: reader.result }),
                          })
                          if (res.ok) {
                            const data = await res.json()
                            setUser(data)
                            toast.success('Avatar updated')
                          } else {
                            toast.error('Failed to upload avatar')
                          }
                        } catch {
                          toast.error('Network error')
                        }
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                </label>
              </div>
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

            {/* Appearance */}
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

            {/* Language */}
            <div className="space-y-2">
              <Label>Language</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="flex-1"
                  onClick={() => {
                    document.documentElement.lang = 'en'
                    document.documentElement.dir = 'ltr'
                    localStorage.setItem('wasl-lang', 'en')
                  }}>
                  English
                </Button>
                <Button type="button" variant="outline" size="sm" className="flex-1"
                  onClick={() => {
                    document.documentElement.lang = 'ar'
                    document.documentElement.dir = 'rtl'
                    localStorage.setItem('wasl-lang', 'ar')
                    toast.success('تم تغيير اللغة إلى العربية')
                  }}>
                  العربية
                </Button>
              </div>
            </div>

            {/* Color theme */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Palette className="w-4 h-4" /> Color theme
              </Label>
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

            {/* Demo data */}
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

            {/* Save/Cancel for profile tab */}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
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
          </TabsContent>

          {/* ---- Privacy Tab ---- */}
          <TabsContent value="privacy" className="flex-1 overflow-y-auto wasl-scroll -mx-1 px-1 space-y-4 mt-2">
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Lock className="w-4 h-4" /> Privacy & message protection
              </Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Control whether your messages can be screenshotted or forwarded.
                Protected messages show a lock icon to recipients.
              </p>

              {/* Protect my messages by default */}
              <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <ShieldAlert
                      className={cn(
                        'w-4 h-4 mt-0.5 shrink-0',
                        defaultProtect
                          ? 'text-[var(--wasl-green)]'
                          : 'text-muted-foreground'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        Protect my messages by default
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        When ON, every message you send is protected — recipients
                        cannot screenshot or forward it unless they have
                        &quot;always allow&quot; enabled.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={defaultProtect}
                    onCheckedChange={(v) => togglePrivacy('defaultProtectMessages', v)}
                  />
                </div>
              </div>

              {/* Always allow screenshots & forwarding */}
              <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <EyeOff
                      className={cn(
                        'w-4 h-4 mt-0.5 shrink-0',
                        alwaysAllow
                          ? 'text-[var(--wasl-green)]'
                          : 'text-muted-foreground'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        Always allow screenshots & forwarding
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        When ON, you can screenshot or forward any message you
                        receive — even if the sender protected it. Use this only
                        if you accept the privacy trade-off.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={alwaysAllow}
                    onCheckedChange={(v) => togglePrivacy('privacyAlwaysAllow', v)}
                  />
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground italic">
                Tip: Per-message protection can also be toggled with the lock icon
                in the composer before sending. Business accounts have their own
                protection setting in the business dashboard.
              </p>

              {/* Divider */}
              <div className="pt-2 border-t border-border">
                <Label className="flex items-center gap-2 mb-2">
                  <EyeOff className="w-4 h-4" /> Visibility
                </Label>
              </div>

              {/* Ghost Mode */}
              <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <Ghost
                      className={cn(
                        'w-4 h-4 mt-0.5 shrink-0',
                        ghostMode ? 'text-[var(--wasl-green)]' : 'text-muted-foreground'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        Ghost Mode
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Hides your online status, last seen, and typing
                        indicator from all other users. You appear offline
                        even when you&apos;re active.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={ghostMode}
                    onCheckedChange={(v) => togglePrivacy('ghostMode', v)}
                  />
                </div>
              </div>

              {/* Hide Last Seen */}
              <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <Clock
                      className={cn(
                        'w-4 h-4 mt-0.5 shrink-0',
                        hideLastSeen ? 'text-[var(--wasl-green)]' : 'text-muted-foreground'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        Hide last seen
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Other users won&apos;t be able to see when you were
                        last active. Your online status may still show if
                        Ghost Mode is off.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={hideLastSeen}
                    onCheckedChange={(v) => togglePrivacy('hideLastSeen', v)}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ---- Business Tab ---- */}
          <TabsContent value="business" className="flex-1 overflow-y-auto wasl-scroll -mx-1 px-1 space-y-4 mt-2">
            {/* Identity verification status */}
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg p-3 text-xs',
                user?.verified
                  ? 'bg-[var(--wasl-green)]/10 border border-[var(--wasl-green)]/30'
                  : 'bg-amber-500/10 border border-amber-500/30'
              )}
            >
              <ShieldCheck
                className={cn(
                  'w-5 h-5 shrink-0',
                  user?.verified ? 'text-[var(--wasl-green)]' : 'text-amber-500'
                )}
              />
              <div className="flex-1">
                <div className="font-medium text-sm">
                  {user?.verified ? 'Identity verified ✓' : 'Identity not verified'}
                </div>
                <p className="text-muted-foreground mt-0.5">
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
                  className="h-8 text-xs"
                  onClick={() => setVerifyOpen(true)}
                >
                  Verify
                </Button>
              )}
            </div>

            {/* My businesses */}
            {myBusinesses.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center gap-1">
                  <Users className="w-3 h-3" /> My businesses
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
                      size={32}
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

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              {user?.verified ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setBizRegisterOpen(true)}
                >
                  <Building2 className="w-4 h-4 mr-2" /> Register a new business
                </Button>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  <Building2 className="w-5 h-5 mx-auto mb-1 text-muted-foreground/50" />
                  Verify your identity first to register a business.
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setBizSearchOpen(true)}
              >
                <Search className="w-4 h-4 mr-2" /> Search for businesses
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-[var(--wasl-green)]/30 hover:bg-[var(--wasl-green)]/5"
                onClick={() => setSpOpen(true)}
              >
                <Landmark className="w-4 h-4 mr-2" /> Register as Service Provider
              </Button>
            </div>

            {/* How it works */}
            <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground space-y-2">
              <div className="font-medium text-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" /> How business accounts work
              </div>
              <ul className="space-y-1.5 list-disc list-inside leading-snug">
                <li>Verify your identity (upload ID document)</li>
                <li>Register your business (name, category, documents)</li>
                <li>Create public/private groups for customers or employees</li>
                <li>Invite members and manage roles (admin/member)</li>
                <li>Business messages can be protected from screenshots</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Business dialogs */}
      <VerifyPersonDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        onVerified={() => {
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

      {/* Service Provider registration dialog */}
      <ServiceProviderDialog open={spOpen} onOpenChange={setSpOpen} />
    </Dialog>
  )
}
