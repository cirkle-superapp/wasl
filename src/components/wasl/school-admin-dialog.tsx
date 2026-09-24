'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2,
  UserPlus,
  RefreshCw,
  Copy,
  QrCode,
  Search,
  ShieldCheck,
  Users,
  Ban,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { QRCodeDisplay } from './qr-code-display'
import { formatSchoolConnectNumber } from '@/lib/school'

type Student = {
  id: string
  studentId: string
  fullName: string
  grade: string | null
  className: string | null
  enrollmentYear: number | null
  status: string
  userId: string | null
  joinCode: string
  joinCodeGeneratedAt: string | null
  joinCodeRevoked: boolean
  joinCodeExpiresAt: string | null
  parents: Array<{
    id: string
    relationship: string
    parentId: string
    name: string
    username: string
    avatarColor: string | null
    phone: string | null
  }>
}

type SchoolInfo = {
  id: string
  name: string
  code: string
  logoColor: string | null
}

export function SchoolAdminDialog({
  open,
  onOpenChange,
  school,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  school: SchoolInfo
}) {
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<Student[]>([])
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [qrStudent, setQrStudent] = useState<Student | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/schools/${school.id}/students`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setStudents(data.students || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [school.id])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const filtered = students.filter((s) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      s.fullName.toLowerCase().includes(q) ||
      s.studentId.toLowerCase().includes(q) ||
      s.grade?.toLowerCase().includes(q) ||
      s.className?.toLowerCase().includes(q)
    )
  })

  async function regenerateCode(student: Student) {
    try {
      const res = await fetch(`/api/schools/${school.id}/students/${student.id}/join-code`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to regenerate code')
        return
      }
      toast.success(`New Join Code for ${student.fullName}: ${data.student.joinCode}`)
      load()
    } catch {
      toast.error('Network error')
    }
  }

  async function revokeCode(student: Student) {
    if (!confirm(`Revoke the Join Code for ${student.fullName}? They will need a new code to connect.`)) return
    try {
      const res = await fetch(`/api/schools/${school.id}/students/${student.id}/join-code`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to revoke code')
        return
      }
      toast.success(`Join Code revoked for ${student.fullName}`)
      load()
    } catch {
      toast.error('Network error')
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b border-border bg-[var(--wasl-sidebar-bg)]">
            <DialogTitle className="flex items-center gap-2.5">
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
                style={{ background: school.logoColor || '#075E54' }}
              >
                {school.name.charAt(0)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="truncate">{school.name}</span>
                <span className="text-[11px] font-normal text-muted-foreground font-mono">
                  {school.code} · Admin Dashboard
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, ID, grade…"
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1.5" />
              Add student
            </Button>
          </div>

          {/* Student list */}
          <div className="flex-1 overflow-y-auto wasl-scroll">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mb-2" />
                <span className="text-sm">Loading students…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-8 w-8 mb-2 opacity-50" />
                <span className="text-sm">{search ? 'No students match your search' : 'No students yet — add the first one'}</span>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((s) => (
                  <li key={s.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="h-10 w-10 rounded-full bg-[var(--wasl-green)]/10 text-[var(--wasl-green)] flex items-center justify-center text-sm font-semibold shrink-0">
                        {s.fullName.charAt(0).toUpperCase()}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm">{s.fullName}</span>
                          {s.userId && (
                            <ShieldCheck className="h-3.5 w-3.5 text-[var(--wasl-green)]" />
                          )}
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {s.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {s.studentId}
                          {s.grade && ` · ${s.grade}`}
                          {s.className && ` · ${s.className}`}
                        </div>
                        {/* Join code row */}
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                          <span className="text-muted-foreground">Join Code:</span>
                          <span className={cn('font-mono', s.joinCodeRevoked ? 'text-amber-600 line-through' : 'text-foreground')}>
                            {s.joinCode}
                          </span>
                          {s.joinCodeExpiresAt && (
                            <span className="text-[10px] text-muted-foreground">
                              · expires {new Date(s.joinCodeExpiresAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {/* Parents */}
                        {s.parents.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {s.parents.map((p) => (
                              <span
                                key={p.id}
                                className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-700 dark:text-pink-300"
                              >
                                {p.name} ({p.relationship})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              formatSchoolConnectNumber(school.code, s.studentId, s.joinCode).replace(/\s/g, '')
                            )
                            toast.success('Connect Number copied')
                          }}
                          title="Copy Connect Number"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setQrStudent(s)}
                          title="Show QR"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => regenerateCode(s)}
                          title="Regenerate Join Code"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        {!s.joinCodeRevoked && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-amber-600 hover:text-amber-700"
                            onClick={() => revokeCode(s)}
                            title="Revoke Join Code"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add student dialog */}
      <AddStudentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        school={school}
        onAdded={() => {
          setAddOpen(false)
          load()
        }}
      />

      {/* QR code dialog */}
      {qrStudent && (
        <Dialog open={!!qrStudent} onOpenChange={(o) => !o && setQrStudent(null)}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle className="text-center">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ background: school.logoColor || '#075E54' }}
                  >
                    {school.name.charAt(0)}
                  </div>
                  <span className="text-sm mt-1">{school.name}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{school.code}</span>
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center py-2">
              <div className="wasl-qr-frame wasl-anim-scale-in">
                <QRCodeDisplay
                  value={formatSchoolConnectNumber(school.code, qrStudent.studentId, qrStudent.joinCode).replace(/\s/g, '')}
                  size={200}
                />
                <div className="wasl-qr-logo-overlay" style={{ background: school.logoColor || '#075E54', color: 'white', fontWeight: 'bold' }}>
                  {school.name.charAt(0)}
                </div>
              </div>
              <div className="mt-3 font-semibold text-sm">{qrStudent.fullName}</div>
              <div className="font-mono text-xs text-muted-foreground mt-0.5">{qrStudent.studentId}</div>
              <div className="font-mono text-[11px] text-muted-foreground mt-0.5">{qrStudent.joinCode}</div>
              <p className="mt-3 text-[11px] text-muted-foreground text-center max-w-[260px]">
                Student or parent scans this to connect to the school.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function AddStudentDialog({
  open,
  onOpenChange,
  school,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  school: SchoolInfo
  onAdded: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [grade, setGrade] = useState('')
  const [className, setClassName] = useState('')
  const [enrollmentYear, setEnrollmentYear] = useState(String(new Date().getFullYear()))
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) {
      toast.error('Full name is required')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/schools/${school.id}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          grade: grade || undefined,
          className: className || undefined,
          enrollmentYear: Number(enrollmentYear) || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to add student')
        return
      }
      toast.success(`Added ${data.student.fullName} — Student ID: ${data.student.studentId}`)
      setFullName('')
      setGrade('')
      setClassName('')
      onAdded()
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[var(--wasl-green)]" />
            Add a student
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Student full name *</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ahmed Mohamed" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Grade</label>
              <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade 8" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Class</label>
              <Input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Class B" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Enrollment year</label>
            <Input
              type="number"
              value={enrollmentYear}
              onChange={(e) => setEnrollmentYear(e.target.value)}
              placeholder="2025"
            />
          </div>
          <div className="rounded-md bg-muted/50 border border-border p-2.5 text-[11px] text-muted-foreground">
            A permanent <span className="font-medium text-foreground">Student ID</span> and a temporary{' '}
            <span className="font-medium text-foreground">Join Code</span> will be auto-generated.
            You can regenerate the Join Code any time (the old one stops working immediately).
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
            Add student
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
