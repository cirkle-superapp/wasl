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
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Loader2,
  Phone,
  Plus,
  Trash2,
  Check,
  PhoneCall,
  EyeOff,
  Pencil,
  X,
} from 'lucide-react'
import { useWaslStore, type UserPhoneNumber } from '@/lib/store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function PhoneNumbersDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { user, setUser } = useWaslStore()
  const [numbers, setNumbers] = useState<UserPhoneNumber[]>([])
  const [newNumber, setNewNumber] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newPortalName, setNewPortalName] = useState('')
  const [newHideNumber, setNewHideNumber] = useState(false)
  const [adding, setAdding] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPortalName, setEditPortalName] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [editHideNumber, setEditHideNumber] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    if (open) {
      setNewNumber('')
      setNewLabel('')
      setNewPortalName('')
      setNewHideNumber(false)
      setEditingId(null)
      loadNumbers()
    }
  }, [open])

  async function loadNumbers() {
    try {
      const res = await fetch('/api/phone-numbers', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setNumbers(data.phoneNumbers || [])
      if (data.phoneNumbers && user) {
        setUser({ ...user, phoneNumbers: data.phoneNumbers })
      }
    } catch {
      // ignore
    }
  }

  async function addNumber(e: React.FormEvent) {
    e.preventDefault()
    if (!newNumber.trim()) {
      toast.error('Enter a phone number')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/phone-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: newNumber.trim(),
          label: newLabel.trim() || undefined,
          portalName: newPortalName.trim() || undefined,
          hideNumber: newHideNumber,
          setActive: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to add number')
        return
      }
      toast.success(`Added ${data.portalName ? data.portalName + ' portal' : 'number'}`)
      setNewNumber('')
      setNewLabel('')
      setNewPortalName('')
      setNewHideNumber(false)
      await loadNumbers()
    } catch {
      toast.error('Network error')
    } finally {
      setAdding(false)
    }
  }

  async function switchActive(id: string) {
    setSwitching(id)
    try {
      const res = await fetch(`/api/phone-numbers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to switch')
        return
      }
      toast.success(`Active portal: ${data.portalName || 'default'}`)
      await loadNumbers()
    } catch {
      toast.error('Network error')
    } finally {
      setSwitching(null)
    }
  }

  async function removeNumber(id: string) {
    if (!confirm('Remove this number / portal?')) return
    try {
      const res = await fetch(`/api/phone-numbers/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d?.error || 'Failed to remove')
        return
      }
      toast.success('Removed')
      await loadNumbers()
    } catch {
      toast.error('Network error')
    }
  }

  function startEdit(n: UserPhoneNumber) {
    setEditingId(n.id)
    setEditPortalName(n.portalName || '')
    setEditLabel(n.label || '')
    setEditHideNumber(n.hideNumber)
  }

  async function saveEdit(id: string) {
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/phone-numbers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalName: editPortalName.trim() || null,
          label: editLabel.trim() || null,
          hideNumber: editHideNumber,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to save')
        return
      }
      toast.success('Portal settings saved')
      setEditingId(null)
      await loadNumbers()
    } catch {
      toast.error('Network error')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5 text-[var(--wasl-green)]" />
            Numbers & Portals
          </DialogTitle>
          <DialogDescription>
            Each number is a sub-identity ("portal") within your account. Pick which one is active when you message someone — recipients see your <span className="font-medium text-foreground">@username</span> beside your real name.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto wasl-scroll px-4 py-4 space-y-3">
          {numbers.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No numbers yet. Add your first one below.
            </div>
          ) : (
            numbers.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'rounded-xl border bg-card p-3 transition',
                  n.active
                    ? 'border-[var(--wasl-green)]/40 bg-[var(--wasl-green)]/5'
                    : 'border-border'
                )}
              >
                {editingId === n.id ? (
                  // Edit mode
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Editing portal</span>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-1 rounded-full hover:bg-muted text-muted-foreground"
                        aria-label="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div>
                      <Label className="text-[11px]">Portal name (optional)</Label>
                      <Input
                        value={editPortalName}
                        onChange={(e) => setEditPortalName(e.target.value)}
                        placeholder="e.g. Work, Personal, School"
                        className="h-8 mt-1 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Label</Label>
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        placeholder="Friendly label"
                        className="h-8 mt-1 text-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <EyeOff className="h-3.5 w-3.5 text-amber-600" />
                        <div>
                          <div className="text-xs font-medium">Hide number</div>
                          <div className="text-[10px] text-muted-foreground">
                            Others see @username + portal, not digits
                          </div>
                        </div>
                      </div>
                      <Switch checked={editHideNumber} onCheckedChange={setEditHideNumber} />
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => saveEdit(n.id)}
                      disabled={savingEdit}
                    >
                      {savingEdit ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                      Save
                    </Button>
                  </div>
                ) : (
                  // View mode
                  <div>
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'h-10 w-10 rounded-full flex items-center justify-center text-white shrink-0 text-xs font-bold',
                      )} style={{ background: n.portalName ? 'var(--wasl-green)' : '#94a3b8' }}>
                        {n.portalName ? n.portalName.charAt(0).toUpperCase() : <Phone className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold truncate">
                            {n.portalName || 'Default number'}
                          </span>
                          {n.active && (
                            <span className="text-[10px] uppercase tracking-wide bg-[var(--wasl-green)]/15 text-[var(--wasl-green)] px-1.5 py-0.5 rounded-full">
                              Active
                            </span>
                          )}
                          {n.hideNumber && (
                            <span className="text-[10px] uppercase tracking-wide bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
                              <EyeOff className="h-3 w-3" /> Hidden
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {n.number}
                          {n.label && <span className="ml-2">· {n.label}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => startEdit(n)}
                          title="Edit portal"
                          aria-label="Edit portal"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeNumber(n.id)}
                          title="Remove"
                          aria-label="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {!n.active && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 text-xs"
                        onClick={() => switchActive(n.id)}
                        disabled={switching === n.id}
                      >
                        {switching === n.id ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Check className="h-3 w-3 mr-1.5" />}
                        Set as active
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add new number form */}
        <form onSubmit={addNumber} className="border-t border-border bg-muted/20 px-4 py-3 space-y-2.5">
          <div className="text-xs font-semibold text-foreground">Add a new number / portal</div>
          <Input
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            placeholder="+20 100 123 4567"
            className="h-9 text-sm font-mono"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={newPortalName}
              onChange={(e) => setNewPortalName(e.target.value)}
              placeholder="Portal name (e.g. Work)"
              className="h-9 text-sm"
            />
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g. Personal)"
              className="h-9 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Switch checked={newHideNumber} onCheckedChange={setNewHideNumber} />
            <span>Hide number from others (they see @username + portal only)</span>
          </label>
          <Button type="submit" disabled={adding} className="w-full">
            {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Add number
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
