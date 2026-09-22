'use client'

import { useState, useEffect } from 'react'
import {
  Link2,
  Loader2,
  Search,
  ShieldCheck,
  User,
  UserCircle2,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type LookupResult = {
  school: {
    id: string
    name: string
    code: string
    logoColor: string | null
    city: string | null
    country: string | null
    type: string
    status: string
    verifiedAt: string | null
  }
  student: {
    id: string
    studentId: string
    fullName: string
    grade: string | null
    className: string | null
    status: string
  }
  joinCodeStatus: 'valid' | 'revoked' | 'expired' | 'not_yet_generated'
  canSelfJoin: boolean
}

export function SchoolConnectDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: () => void
}) {
  const [value, setValue] = useState('')
  const [looking, setLooking] = useState(false)
  const [joining, setJoining] = useState(false)
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [mode, setMode] = useState<'self' | 'parent'>('parent')
  const [relationship, setRelationship] = useState<string>('parent')

  // Reset state when the dialog closes
  useEffect(() => {
    if (!open) {
      setValue('')
      setLookup(null)
      setLookupError(null)
      setMode('parent')
      setRelationship('parent')
    }
  }, [open])

  async function lookUp() {
    if (!value.trim()) {
      toast.error('Enter your School Connect Number')
      return
    }
    setLooking(true)
    setLookup(null)
    setLookupError(null)
    try {
      const res = await fetch('/api/school-connect/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectNumber: value.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLookupError(data?.error || 'Not found')
        return
      }
      setLookup(data)
      // Pre-select mode: if the student record already has a user, force parent mode
      if (!data.canSelfJoin) setMode('parent')
    } catch {
      setLookupError('Network error')
    } finally {
      setLooking(false)
    }
  }

  async function connect() {
    if (!lookup) return
    setJoining(true)
    try {
      const res = await fetch('/api/school-connect/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectNumber: value.trim(), mode, relationship }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to connect')
        return
      }
      const verb = mode === 'self' ? 'connected as a student' : `connected as ${data.relationship || relationship}`
      toast.success(`✓ ${verb} at ${data.school.name}`)
      onConnected()
    } catch {
      toast.error('Network error')
    } finally {
      setJoining(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--wasl-green)]/15 text-[var(--wasl-green)]">
              <Link2 className="h-4 w-4" />
            </div>
            Connect to a school
          </DialogTitle>
          <DialogDescription>
            Enter your School Connect Number or scan a QR code.
          </DialogDescription>
        </DialogHeader>

        {/* Input phase */}
        {!lookup && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">
                School Connect Number
              </label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="NIS-25-08421-7K4P-92XM  or  7K4P-92XM"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !looking) lookUp()
                }}
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Find this on your Student ID card or ask your school admin.
              </p>
            </div>

            {lookupError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{lookupError}</span>
              </div>
            )}

            <Button onClick={lookUp} disabled={looking} className="w-full">
              {looking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Look up school
            </Button>

            <div className="rounded-lg border border-dashed border-border p-3 text-center">
              <p className="text-[11px] text-muted-foreground">
                Don&apos;t have a number? Ask your school admin to register you.
              </p>
            </div>
          </div>
        )}

        {/* Confirmation phase */}
        {lookup && (
          <div className="space-y-3">
            {/* School + Student preview card */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div
                className="px-3 py-2.5 flex items-center gap-2.5"
                style={{
                  background: `linear-gradient(135deg, ${(lookup.school.logoColor || '#075E54')}22 0%, transparent 100%)`,
                }}
              >
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold shrink-0"
                  style={{ background: lookup.school.logoColor || '#075E54' }}
                >
                  {lookup.school.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm truncate">{lookup.school.name}</span>
                    {lookup.school.verifiedAt && (
                      <ShieldCheck className="h-3.5 w-3.5 text-[var(--wasl-green)] shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {lookup.school.code} · {lookup.school.city || lookup.school.country || lookup.school.type}
                  </div>
                </div>
              </div>
              <div className="px-3 py-2.5 border-t border-border">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-[var(--wasl-green)]/10 text-[var(--wasl-green)] flex items-center justify-center shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{lookup.student.fullName}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {lookup.student.studentId}
                      {lookup.student.grade && ` · ${lookup.student.grade}`}
                      {lookup.student.className && ` · ${lookup.student.className}`}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Join code status warning */}
            {lookup.joinCodeStatus !== 'valid' && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {lookup.joinCodeStatus === 'revoked' && 'This Join Code has been revoked. Ask the student for a new one.'}
                  {lookup.joinCodeStatus === 'expired' && 'This Join Code has expired. Ask the student for a new one.'}
                  {lookup.joinCodeStatus === 'not_yet_generated' && 'This student does not have a Join Code yet.'}
                </span>
              </div>
            )}

            {/* Mode selector */}
            {lookup.joinCodeStatus === 'valid' && (
              <div>
                <label className="text-xs font-medium text-foreground mb-1.5 block">
                  I am connecting as…
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('self')}
                    disabled={!lookup.canSelfJoin}
                    className={cn(
                      'rounded-lg border p-2.5 text-left transition disabled:opacity-40 disabled:cursor-not-allowed',
                      mode === 'self'
                        ? 'border-[var(--wasl-green)] bg-[var(--wasl-green)]/5'
                        : 'border-border hover:border-[var(--wasl-green)]/40'
                    )}
                  >
                    <UserCircle2 className="h-4 w-4 mb-1 text-[var(--wasl-green)]" />
                    <div className="text-xs font-semibold">The student</div>
                    <div className="text-[10px] text-muted-foreground">This is my own student ID</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('parent')}
                    className={cn(
                      'rounded-lg border p-2.5 text-left transition',
                      mode === 'parent'
                        ? 'border-[var(--wasl-green)] bg-[var(--wasl-green)]/5'
                        : 'border-border hover:border-[var(--wasl-green)]/40'
                    )}
                  >
                    <User className="h-4 w-4 mb-1 text-pink-600" />
                    <div className="text-xs font-semibold">Parent / Guardian</div>
                    <div className="text-[10px] text-muted-foreground">I am this student&apos;s parent</div>
                  </button>
                </div>
              </div>
            )}

            {/* Relationship selector (parent mode) */}
            {mode === 'parent' && lookup.joinCodeStatus === 'valid' && (
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Relationship</label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="parent">Parent</option>
                  <option value="mother">Mother</option>
                  <option value="father">Father</option>
                  <option value="guardian">Guardian</option>
                  <option value="grandparent">Grandparent</option>
                  <option value="sibling">Sibling</option>
                  <option value="other">Other</option>
                </select>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setLookup(null)}
                disabled={joining}
              >
                <X className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={connect}
                disabled={joining || lookup.joinCodeStatus !== 'valid'}
              >
                {joining ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Confirm connection
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
