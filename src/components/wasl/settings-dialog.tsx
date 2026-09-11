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
import { Loader2, Moon, Sun, Bell, Trash2, User, Phone, Info, RefreshCw, Palette } from 'lucide-react'
import { useWaslStore } from '@/lib/store'
import { WaslAvatar } from './wasl-avatar'
import { useColorTheme } from './color-theme-provider'
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
                    ? 'border-[var(--cirkle-gold)] bg-[var(--cirkle-gold)]/5'
                    : 'border-border hover:border-foreground/30'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[#c2a060]" />
                  <span className="w-4 h-4 rounded-full bg-[#1a4a5a]" />
                  <span className="w-4 h-4 rounded-full bg-[#fdfcf9] border border-border" />
                </div>
                <div>
                  <div className="text-sm font-semibold wasl-text-gradient-cirkle">Cirkle</div>
                  <div className="text-[11px] text-muted-foreground">Gold · teal · cream</div>
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
    </Dialog>
  )
}
