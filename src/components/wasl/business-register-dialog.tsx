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
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Loader2, Building2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { DocUpload } from './doc-upload'
import { useWaslStore } from '@/lib/store'
import { toast } from 'sonner'

export function BusinessRegisterDialog({
  open,
  onOpenChange,
  onRegistered,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onRegistered?: (businessId: string) => void
}) {
  const { user } = useWaslStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [registrationDoc, setRegistrationDoc] = useState<string | null>(null)
  const [taxDoc, setTaxDoc] = useState<string | null>(null)
  const [idDoc, setIdDoc] = useState<string | null>(null)
  const [hidePhone, setHidePhone] = useState(false)
  const [hiddenPhone, setHiddenPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setCategory('')
      setRegistrationDoc(null)
      setTaxDoc(null)
      setIdDoc(null)
      setHidePhone(false)
      setHiddenPhone('')
      setSubmitting(false)
    }
  }, [open])

  async function submit() {
    if (!name.trim()) {
      toast.error('Business name is required')
      return
    }
    if (!registrationDoc || !taxDoc || !idDoc) {
      toast.error('All three verification documents are required')
      return
    }
    if (hidePhone && !hiddenPhone.trim()) {
      toast.error('Please enter the hidden phone number or disable "hide phone"')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          category: category.trim() || null,
          registrationDocPath: registrationDoc,
          taxDocPath: taxDoc,
          idDocPath: idDoc,
          hidePhone,
          hiddenPhone: hidePhone ? hiddenPhone.trim() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to register business')
        return
      }
      toast.success('Business registered and verified ✓')
      onRegistered?.(data.business.id)
      onOpenChange(false)
    } catch {
      toast.error('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user?.verified) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Verification required
            </DialogTitle>
            <DialogDescription>
              You must verify your personal identity before registering a
              business. Go to Settings → Verify identity first.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto wasl-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[var(--wasl-green)]" />
            Register a business
          </DialogTitle>
          <DialogDescription>
            Create a verified business account. You'll be able to create
            public/private groups and invite members.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg bg-[var(--wasl-green)]/10 border border-[var(--wasl-green)]/30 p-2.5 text-xs">
            <ShieldCheck className="w-4 h-4 text-[var(--wasl-green)] shrink-0" />
            <span>Your identity is verified. You can register a business.</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="biz-name">Business name *</Label>
            <Input
              id="biz-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apple Inc."
              maxLength={80}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="biz-desc">Description</Label>
            <Textarea
              id="biz-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does your business do?"
              rows={2}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="biz-cat">Category</Label>
            <Input
              id="biz-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Technology, Food, Customer Service"
              maxLength={50}
            />
          </div>

          <div className="space-y-3 pt-2 border-t border-border">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[var(--wasl-green)]" />
              Verification documents
            </div>
            <DocUpload
              label="Company registration"
              hint="Recent company registration document."
              required
              value={registrationDoc}
              onChange={setRegistrationDoc}
            />
            <DocUpload
              label="Tax number document"
              hint="Official tax number certificate."
              required
              value={taxDoc}
              onChange={setTaxDoc}
            />
            <DocUpload
              label="ID of a person on the registration"
              hint="Government-issued ID of one of the people listed on the company registration."
              required
              value={idDoc}
              onChange={setIdDoc}
            />
          </div>

          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="hide-phone" className="cursor-pointer">
                  Hidden phone number
                </Label>
                <p className="text-xs text-muted-foreground">
                  Keep your real number private. It only surfaces via Wasl
                  business search.
                </p>
              </div>
              <Switch
                id="hide-phone"
                checked={hidePhone}
                onCheckedChange={setHidePhone}
              />
            </div>
            {hidePhone && (
              <div className="space-y-2">
                <Label htmlFor="hidden-phone">Hidden number</Label>
                <Input
                  id="hidden-phone"
                  value={hiddenPhone}
                  onChange={(e) => setHiddenPhone(e.target.value)}
                  placeholder="+20 100 123 4567"
                  maxLength={30}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              submitting ||
              !name.trim() ||
              !registrationDoc ||
              !taxDoc ||
              !idDoc
            }
            className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Register business
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
