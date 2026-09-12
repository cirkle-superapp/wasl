'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Lock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function AppLockDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [pin, setPin] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setPin('')
      fetch('/api/app-lock').then(r => r.json()).then(d => setEnabled(d.enabled || false)).catch(() => {})
    }
  }, [open])

  async function save() {
    if (pin.length < 4) { toast.error('PIN must be at least 4 digits'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/app-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, action: 'setup' }),
      })
      if (res.ok) { toast.success('App lock enabled 🔒'); setEnabled(true); onOpenChange(false) }
      else { const d = await res.json(); toast.error(d?.error || 'Failed') }
    } catch { toast.error('Network error') }
    finally { setSaving(false) }
  }

  async function disable() {
    setSaving(true)
    try {
      await fetch('/api/app-lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disable' }) })
      toast.success('App lock disabled')
      setEnabled(false)
      onOpenChange(false)
    } catch { toast.error('Network error') }
    finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="w-4 h-4 text-[var(--wasl-green)]" /> App Lock</DialogTitle>
        </DialogHeader>
        {enabled ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">App lock is currently enabled. Your PIN is required to access Wasl.</p>
            <Button variant="outline" onClick={disable} disabled={saving} className="w-full text-destructive">Disable App Lock</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Set a PIN to protect your Wasl account on this device.</p>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN (4+ digits)</Label>
              <Input id="pin" type="password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="••••" inputMode="numeric" />
            </div>
          </div>
        )}
        {!enabled && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || pin.length < 4} className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white">
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Enable Lock
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
