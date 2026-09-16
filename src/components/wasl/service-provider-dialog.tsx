'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import {
  Loader2, Building2, Landmark, CreditCard, Stethoscope, Zap, Phone,
  Mail, Globe, ShieldCheck, Upload, Camera, Video, CheckCircle2, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const PROVIDER_TYPES = [
  { value: 'government', label: 'Government', icon: Landmark },
  { value: 'bank', label: 'Bank', icon: CreditCard },
  { value: 'utility', label: 'Utility', icon: Zap },
  { value: 'telecom', label: 'Telecom', icon: Phone },
  { value: 'healthcare', label: 'Healthcare', icon: Stethoscope },
]

export function ServiceProviderDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [loading, setLoading] = useState(false)
  const [myProviders, setMyProviders] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('register')

  // Registration form state
  const [name, setName] = useState('')
  const [type, setType] = useState('government')
  const [description, setDescription] = useState('')
  const [officialName, setOfficialName] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [countryCode, setCountryCode] = useState('+20')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [registrationDocPath, setRegistrationDocPath] = useState('')
  const [idDocPath, setIdDocPath] = useState('')
  const [livenessVideoPath, setLivenessVideoPath] = useState('')
  const [livenessRecording, setLivenessRecording] = useState(false)

  useEffect(() => {
    if (open) loadProviders()
  }, [open])

  async function loadProviders() {
    try {
      const res = await fetch('/api/service-providers/register')
      if (res.ok) {
        const data = await res.json()
        setMyProviders(data.providers || [])
      }
    } catch {}
  }

  async function uploadFile(file: File): Promise<string | null> {
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        return data.url
      }
    } catch {}
    return null
  }

  async function handleRegister() {
    if (!name.trim()) {
      toast.error('Provider name is required')
      return
    }
    if (!registrationDocPath) {
      toast.error('Please upload your official registration document')
      return
    }
    if (!idDocPath) {
      toast.error('Please upload your ID document')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/service-providers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          description: description.trim(),
          officialName: officialName.trim() || null,
          registrationNumber: registrationNumber.trim() || null,
          countryCode,
          registrationDocPath,
          idDocPath,
          livenessVideoPath: livenessVideoPath || null,
          livenessVerified: !!livenessVideoPath,
          contactPhone: contactPhone.trim() || null,
          contactEmail: contactEmail.trim() || null,
          website: website.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Registration failed')
        return
      }
      toast.success('Application submitted! Wasl admin will review it shortly.')
      // Reset form
      setName(''); setDescription(''); setOfficialName('')
      setRegistrationNumber(''); setRegistrationDocPath(''); setIdDocPath('')
      setLivenessVideoPath(''); setContactPhone(''); setContactEmail(''); setWebsite('')
      await loadProviders()
      setActiveTab('status')
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-[var(--wasl-green)]" />
            Official Service Provider
          </DialogTitle>
          <DialogDescription>
            Register as a verified bank, government ministry, or utility provider.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-2 w-full shrink-0">
            <TabsTrigger value="register" className="text-xs">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Register
            </TabsTrigger>
            <TabsTrigger value="status" className="text-xs">
              <Building2 className="w-3.5 h-3.5 mr-1" /> My Providers ({myProviders.length})
            </TabsTrigger>
          </TabsList>

          {/* Registration Tab */}
          <TabsContent value="register" className="flex-1 overflow-y-auto wasl-scroll -mx-1 px-1 space-y-3 mt-2">
            {/* Provider type */}
            <div className="space-y-2">
              <Label>Provider type</Label>
              <div className="grid grid-cols-5 gap-1">
                {PROVIDER_TYPES.map((t) => {
                  const Icon = t.icon
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={cn(
                        'flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all',
                        type === t.value
                          ? 'border-[var(--wasl-green)] bg-[var(--wasl-green)]/5'
                          : 'border-border hover:border-foreground/20'
                      )}
                    >
                      <Icon className={cn('w-4 h-4', type === t.value ? 'text-[var(--wasl-green)]' : 'text-muted-foreground')} />
                      <span className="text-[9px] font-medium">{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sp-name">Provider name *</Label>
              <Input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ministry of Health" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sp-official">Official legal name</Label>
              <Input id="sp-official" value={officialName} onChange={(e) => setOfficialName(e.target.value)} placeholder="e.g. Arab Republic of Egypt — Ministry of Health" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="sp-reg-num">Registration number</Label>
                <Input id="sp-reg-num" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="Gov reg #" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sp-country">Country code</Label>
                <Input id="sp-country" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="+20" className="w-20" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sp-desc">Description</Label>
              <Textarea id="sp-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Brief description of services" />
            </div>

            {/* Documents */}
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" /> Verification Documents
              </Label>

              {/* Registration document */}
              <div className="rounded-lg border border-border p-2.5">
                <div className="text-xs font-medium mb-1">Official Registration Document *</div>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    toast.info('Uploading...')
                    const path = await uploadFile(file)
                    if (path) {
                      setRegistrationDocPath(path)
                      toast.success('Document uploaded')
                    } else {
                      toast.error('Upload failed')
                    }
                  }}
                  className="text-xs w-full"
                />
                {registrationDocPath && (
                  <div className="text-[10px] text-[var(--wasl-green)] mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Uploaded
                  </div>
                )}
              </div>

              {/* ID document */}
              <div className="rounded-lg border border-border p-2.5">
                <div className="text-xs font-medium mb-1">Authorized Representative ID *</div>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    toast.info('Uploading...')
                    const path = await uploadFile(file)
                    if (path) {
                      setIdDocPath(path)
                      toast.success('ID uploaded')
                    } else {
                      toast.error('Upload failed')
                    }
                  }}
                  className="text-xs w-full"
                />
                {idDocPath && (
                  <div className="text-[10px] text-[var(--wasl-green)] mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Uploaded
                  </div>
                )}
              </div>

              {/* Liveness test (selfie video) */}
              <div className="rounded-lg border border-border p-2.5">
                <div className="text-xs font-medium mb-1 flex items-center gap-1">
                  <Video className="w-3 h-3" /> Liveness Test (Selfie Video)
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Record a 3-second selfie video to verify you are a real person.
                </p>
                <input
                  type="file"
                  accept="video/*"
                  capture="user"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    toast.info('Uploading video...')
                    const path = await uploadFile(file)
                    if (path) {
                      setLivenessVideoPath(path)
                      toast.success('Liveness video verified ✓')
                    } else {
                      toast.error('Upload failed')
                    }
                  }}
                  className="text-xs w-full"
                />
                {livenessVideoPath && (
                  <div className="text-[10px] text-[var(--wasl-green)] mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Liveness verified
                  </div>
                )}
              </div>
            </div>

            {/* Contact info */}
            <div className="space-y-2 pt-2 border-t border-border">
              <Label>Contact (optional)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone" />
                <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email" />
              </div>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
                onClick={handleRegister}
                disabled={loading}
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Application
              </Button>
            </div>
          </TabsContent>

          {/* Status Tab */}
          <TabsContent value="status" className="flex-1 overflow-y-auto wasl-scroll -mx-1 px-1 space-y-2 mt-2">
            {myProviders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <div className="w-14 h-14 rounded-full bg-[var(--wasl-green)]/10 flex items-center justify-center mb-3">
                  <Landmark className="w-7 h-7 text-[var(--wasl-green)]" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">No applications yet</p>
                <p className="text-xs max-w-[240px]">
                  Register as an official service provider to broadcast announcements to all users.
                </p>
              </div>
            ) : (
              myProviders.map((p) => (
                <div key={p.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: p.avatarColor }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">{p.type}</div>
                      </div>
                    </div>
                    <span className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full font-medium',
                      p.status === 'approved' ? 'bg-[var(--wasl-green)]/15 text-[var(--wasl-green)]'
                        : p.status === 'rejected' ? 'bg-destructive/10 text-destructive'
                        : 'bg-amber-500/10 text-amber-600'
                    )}>
                      {p.status}
                    </span>
                  </div>
                  {p.verified && p.canBroadcast && (
                    <div className="text-[10px] text-[var(--wasl-green)] flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Verified — can broadcast to {p.countryCode} users
                    </div>
                  )}
                  {p.status === 'rejected' && (
                    <div className="text-[10px] text-destructive">
                      Rejected
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground">
                    {p._count?.broadcasts || 0} broadcast{(p._count?.broadcasts || 0) === 1 ? '' : 's'} sent
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
