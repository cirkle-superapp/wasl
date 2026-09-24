'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  GraduationCap,
  Plus,
  Search,
  Loader2,
  CheckCircle2,
  Users,
  QrCode,
  Link2,
  School as SchoolIcon,
  UserPlus,
  ChevronRight,
  ShieldCheck,
  Calendar,
  BookOpen,
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
import { SchoolConnectDialog } from './school-connect-dialog'
import { StudentIdCard } from './student-id-card'
import { SchoolAdminDialog } from './school-admin-dialog'

type SchoolView = {
  id: string
  name: string
  code: string
  logoColor: string | null
  logoPath: string | null
  description: string
  city: string | null
  country: string | null
  type: string
  status: string
  verifiedAt: string | null
  role: 'admin' | 'teacher' | 'staff' | 'student' | 'parent' | 'none'
  membership: { role: string; joinedAt: string } | null
  studentRecord: {
    id: string
    studentId: string
    fullName: string
    grade: string | null
    className: string | null
    status: string
    joinCode: string
    joinCodeRevoked: boolean
    joinCodeExpiresAt: string | null
    joinCodeGeneratedAt: string | null
  } | null
  children: Array<{
    connectionId: string
    relationship: string
    studentId: string
    fullName: string
    grade: string | null
    className: string | null
    hasAccount: boolean
  }>
  stats: { studentCount: number; staffCount: number } | null
}

export function MySchoolDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [loading, setLoading] = useState(true)
  const [schools, setSchools] = useState<SchoolView[]>([])
  const [connectOpen, setConnectOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [adminSchool, setAdminSchool] = useState<SchoolView | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/my-school', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setSchools(data.schools || [])
      }
    } catch {
      // ignore — load silently fails
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b border-border bg-[var(--wasl-sidebar-bg)]">
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--wasl-green)]/15 text-[var(--wasl-green)]">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span>My School</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  School Connect · Verified institution identity
                </span>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Your connected schools, student IDs, and parent connections.
            </DialogDescription>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 wasl-scroll">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <span className="text-sm">Loading your schools…</span>
              </div>
            ) : schools.length === 0 ? (
              <EmptyState onConnect={() => setConnectOpen(true)} onRegister={() => setRegisterOpen(true)} />
            ) : (
              <div className="space-y-3">
                {schools.map((s) => (
                  <SchoolCard
                    key={s.id}
                    school={s}
                    onAdmin={() => setAdminSchool(s)}
                  />
                ))}
                <div className="pt-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setConnectOpen(true)}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Connect a school
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setRegisterOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Register a school
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sub-dialogs */}
      <SchoolConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={() => {
          setConnectOpen(false)
          load()
        }}
      />
      <SchoolRegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onRegistered={() => {
          setRegisterOpen(false)
          load()
        }}
      />
      {adminSchool && (
        <SchoolAdminDialog
          open={!!adminSchool}
          onOpenChange={(o) => !o && setAdminSchool(null)}
          school={adminSchool}
        />
      )}
    </>
  )
}

function EmptyState({
  onConnect,
  onRegister,
}: {
  onConnect: () => void
  onRegister: () => void
}) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-4 wasl-anim-spring-in">
      <div className="relative mb-4 wasl-empty-orb" style={{ isolation: 'isolate' }}>
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--wasl-green)]/10 to-[var(--wasl-green)]/5 border border-[var(--wasl-green)]/20">
          <GraduationCap className="h-8 w-8 text-[var(--wasl-green)]" />
        </div>
      </div>
      <h3 className="text-base font-semibold">No schools connected yet</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Connect to your school with a <span className="font-medium text-foreground">School Connect Number</span> from
        your student ID card, or scan a QR code from your parent.
      </p>
      <div className="mt-5 flex flex-col sm:flex-row gap-2 w-full max-w-sm">
        <Button onClick={onConnect} className="flex-1">
          <Link2 className="h-4 w-4 mr-2" />
          Connect a school
        </Button>
        <Button variant="outline" onClick={onRegister} className="flex-1">
          <Plus className="h-4 w-4 mr-2" />
          Register a school
        </Button>
      </div>
    </div>
  )
}

function SchoolCard({
  school,
  onAdmin,
}: {
  school: SchoolView
  onAdmin: () => void
}) {
  const isAdmin = school.role === 'admin'
  const isStudent = school.role === 'student'
  const isParent = school.role === 'parent'
  const verified = school.status === 'verified' && !!school.verifiedAt

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden wasl-hover-lift" style={{ boxShadow: 'var(--wasl-shadow-sm)' }}>
      {/* Header strip */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{
          background: `linear-gradient(135deg, ${(school.logoColor || '#075E54')}22 0%, transparent 100%)`,
        }}
      >
        <div
          className="h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold text-base shrink-0"
          style={{ background: school.logoColor || '#075E54' }}
        >
          {(school.name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground truncate">{school.name}</span>
            {verified && (
              <ShieldCheck className="h-4 w-4 text-[var(--wasl-green)] shrink-0" aria-label="Verified" />
            )}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <span className="font-mono">{school.code}</span>
            <span>·</span>
            <span className="capitalize">{school.type}</span>
            {school.city && (
              <>
                <span>·</span>
                <span>{school.city}</span>
              </>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <RoleBadge role={school.role} />
        </div>
      </div>

      {/* Body — depends on role */}
      <div className="px-4 py-3">
        {/* Student view — show the ID card */}
        {isStudent && school.studentRecord && (
          <StudentIdCard
            school={school}
            student={school.studentRecord}
          />
        )}

        {/* Parent view — show the children they're connected to */}
        {isParent && school.children.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
              Your children
            </div>
            <ul className="space-y-2">
              {school.children.map((c) => (
                <li key={c.connectionId} className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-2.5">
                  <div className="h-9 w-9 rounded-full bg-[var(--wasl-green)]/10 text-[var(--wasl-green)] flex items-center justify-center text-sm font-semibold shrink-0">
                    {c.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{c.fullName}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{c.studentId}</div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-2 py-0.5 rounded-full capitalize">
                    {c.relationship}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Admin view — show stats + manage button */}
        {isAdmin && school.stats && (
          <div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <StatCard label="Students" value={school.stats.studentCount} icon={<Users className="h-4 w-4" />} />
              <StatCard label="Staff" value={school.stats.staffCount} icon={<ShieldCheck className="h-4 w-4" />} />
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={onAdmin}>
              <UserPlus className="h-4 w-4 mr-2" />
              Manage students & join codes
            </Button>
          </div>
        )}

        {/* Quick action row */}
        <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="flex-1 text-[12px]" disabled>
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            Events
          </Button>
          <Button variant="ghost" size="sm" className="flex-1 text-[12px]" disabled>
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
            Classes
          </Button>
          <Button variant="ghost" size="sm" className="flex-1 text-[12px]" disabled>
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Family
          </Button>
        </div>
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const labels: Record<string, { label: string; cls: string }> = {
    admin: { label: 'Admin', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
    teacher: { label: 'Teacher', cls: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
    staff: { label: 'Staff', cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
    student: { label: 'Student', cls: 'bg-[var(--wasl-green)]/10 text-[var(--wasl-green)]' },
    parent: { label: 'Parent', cls: 'bg-pink-500/10 text-pink-700 dark:text-pink-300' },
    none: { label: 'Connected', cls: 'bg-muted text-muted-foreground' },
  }
  const cfg = labels[role] || labels.none
  return (
    <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-2.5 flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <div>
        <div className="text-base font-semibold leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  )
}

// SchoolRegisterDialog — inline so we don't need a separate file.
import { Dialog as Dialog2, DialogContent as DialogContent2, DialogHeader as DialogHeader2, DialogTitle as DialogTitle2 } from '@/components/ui/dialog'
function SchoolRegisterDialog({
  open,
  onOpenChange,
  onRegistered,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRegistered: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [type, setType] = useState('international')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('School name is required')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, city, country, type, autoVerify: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to register school')
        return
      }
      toast.success(`School ${data.school.name} registered with code ${data.school.code}`)
      setName('')
      setDescription('')
      setCity('')
      setCountry('')
      onRegistered()
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog2 open={open} onOpenChange={onOpenChange}>
      <DialogContent2 className="max-w-md">
        <DialogHeader2>
          <DialogTitle2 className="flex items-center gap-2">
            <SchoolIcon className="h-5 w-5 text-[var(--wasl-green)]" />
            Register a school
          </DialogTitle2>
        </DialogHeader2>
        <form onSubmit={submit} className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">School name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nile International School" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description (optional)" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">City</label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cairo" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Country</label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Egypt" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="international">International</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="religious">Religious</option>
              <option value="university">University</option>
            </select>
          </div>
          <div className="rounded-md bg-muted/50 border border-border p-2.5 text-[11px] text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 inline-block mr-1 text-[var(--wasl-green)]" />
            For the demo + dev-trial workflow, schools are auto-verified. In production, a Wasl admin reviews each registration.
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Register school
          </Button>
        </form>
      </DialogContent2>
    </Dialog2>
  )
}
