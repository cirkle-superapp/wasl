'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Phone, Plus, Trash2, Check, PhoneCall } from 'lucide-react'
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
  const [adding, setAdding] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setNewNumber('')
      setNewLabel('')
      loadNumbers()
    }
  }, [open])

  async function loadNumbers() {
    try {
      const res = await fetch('/api/phone-numbers', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setNumbers(data.phoneNumbers || [])
      if (data.phoneNumbers) {
        setUser({ ...(user!), phoneNumbers: data.phoneNumbers })
      }
    } catch {
      // ignore
    }
  }

  async function addNumber() {
    const safe = newNumber.trim()
    if (!safe) {
      toast.error('Please enter a phone number')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/phone-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: safe,
          label: newLabel.trim() || undefined,
          setActive: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to add number')
        return
      }
      toast.success('Phone number added and set as active')
      setNewNumber('')
      setNewLabel('')
      await loadNumbers()
    } catch {
      toast.error('Network error')
    } finally {
      setAdding(false)
    }
  }

  async function switchNumber(id: string) {
    setSwitching(id)
    try {
      const res = await fetch(`/api/phone-numbers/${id}`, {
        method: 'PATCH',
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to switch number')
        return
      }
      toast.success(`Now using ${data.activeNumber}`)
      await loadNumbers()
    } catch {
      toast.error('Network error')
    } finally {
      setSwitching(null)
    }
  }

  async function removeNumber(id: string) {
    if (!confirm('Remove this phone number?')) return
    try {
      await fetch(`/api/phone-numbers/${id}`, { method: 'DELETE' })
      toast.success('Phone number removed')
      await loadNumbers()
    } catch {
      toast.error('Network error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-[var(--wasl-green)]" />
            My phone numbers
          </DialogTitle>
          <DialogDescription>
            Add multiple phone numbers and switch between them. The active
            number is what others see when you chat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing numbers */}
          <div className="space-y-1.5">
            {numbers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No phone numbers yet. Add one below.
              </p>
            )}
            {numbers.map((p) => (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-2 p-2.5 rounded-lg border transition-colors',
                  p.active
                    ? 'border-[var(--wasl-green)]/50 bg-[var(--wasl-green)]/5'
                    : 'border-border hover:bg-muted/40'
                )}
              >
                <div className="w-9 h-9 rounded-full bg-[var(--wasl-green)]/15 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-[var(--wasl-green)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{p.number}</span>
                    {p.active && (
                      <span className="text-[10px] bg-[var(--wasl-green)] text-white px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" /> Active
                      </span>
                    )}
                  </div>
                  {p.label && (
                    <span className="text-[10px] text-muted-foreground">{p.label}</span>
                  )}
                </div>
                {!p.active && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={switching === p.id}
                    onClick={() => switchNumber(p.id)}
                  >
                    {switching === p.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    Use
                  </Button>
                )}
                {numbers.length > 1 && (
                  <button
                    onClick={() => removeNumber(p.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add new number */}
          <div className="pt-3 border-t border-border space-y-2">
            <Label className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
              <Plus className="w-3 h-3" /> Add a phone number
            </Label>
            <Input
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              placeholder="+20 100 123 4567"
              type="tel"
            />
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (optional, e.g. Work, Personal)"
              className="text-sm"
            />
            <Button
              size="sm"
              className="w-full bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
              disabled={adding || !newNumber.trim()}
              onClick={addNumber}
            >
              {adding ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-1" />
              )}
              Add & set as active
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
