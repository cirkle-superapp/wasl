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
import { Button } from '@/components/ui/button'
import { Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { DocUpload } from './doc-upload'
import { useWaslStore } from '@/lib/store'
import { toast } from 'sonner'

export function VerifyPersonDialog({
  open,
  onOpenChange,
  onVerified,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onVerified?: () => void
}) {
  const { user, setUser } = useWaslStore()
  const [idDoc, setIdDoc] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [alreadyVerified, setAlreadyVerified] = useState(false)

  useEffect(() => {
    if (open) {
      setIdDoc(null)
      setAlreadyVerified(false)
      // Check current verification status
      fetch('/api/verify-person')
        .then((r) => r.json())
        .then((d) => {
          if (d.user?.verified) setAlreadyVerified(true)
        })
        .catch(() => {})
    }
  }, [open])

  async function submit() {
    if (!idDoc) {
      toast.error('Please upload your ID document')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/verify-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idDocPath: idDoc }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Verification failed')
        return
      }
      toast.success(data.message || 'Identity verified')
      if (user) setUser({ ...user, verified: true })
      onVerified?.()
      onOpenChange(false)
    } catch {
      toast.error('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--wasl-green)]" />
            Verify your identity
          </DialogTitle>
          <DialogDescription>
            Upload a government-issued ID to verify your identity. Verified
            users can register a business account on Wasl.
          </DialogDescription>
        </DialogHeader>

        {alreadyVerified ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--wasl-green)]/10 border border-[var(--wasl-green)]/30">
            <CheckCircle2 className="w-6 h-6 text-[var(--wasl-green)] shrink-0" />
            <div>
              <div className="font-semibold text-sm">Already verified</div>
              <p className="text-xs text-muted-foreground">
                Your identity is verified. You can register a business in
                Settings → Business.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <DocUpload
              label="Your ID document"
              hint="Government-issued photo ID (passport, national ID, driver's license). JPEG, PNG, WebP or PDF, max 5MB."
              required
              value={idDoc}
              onChange={setIdDoc}
            />
            <p className="text-xs text-muted-foreground">
              Your document is stored securely and only used to verify your
              identity. It will not be shared with other users.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!alreadyVerified && (
            <Button
              onClick={submit}
              disabled={submitting || !idDoc}
              className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Verify identity
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
