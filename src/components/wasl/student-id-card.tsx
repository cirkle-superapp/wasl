'use client'

import { useState } from 'react'
import { QrCode, Copy, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { QRCodeDisplay } from './qr-code-display'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatSchoolConnectNumber } from '@/lib/school'

type StudentIdCardProps = {
  school: {
    name: string
    code: string
    logoColor: string | null
  }
  student: {
    id: string
    studentId: string
    fullName: string
    grade: string | null
    className: string | null
    joinCode: string
    joinCodeRevoked: boolean
    joinCodeExpiresAt: string | null
    joinCodeGeneratedAt: string | null
  }
}

// StudentIdCard — renders a student's school ID card with the school's logo
// color, the student's permanent Student ID, and a Connect / Join Code with
// a QR code. The QR encodes the full School Connect Number
// "<PREFIX>-<YY>-<NNNNN>-<XXXX-XXXX>" so a single scan is enough for a
// parent to confirm connection.
export function StudentIdCard({ school, student }: StudentIdCardProps) {
  const [qrOpen, setQrOpen] = useState(false)
  const revoked = student.joinCodeRevoked
  const expired =
    student.joinCodeExpiresAt &&
    new Date(student.joinCodeExpiresAt).getTime() < Date.now()
  const joinCodeActive = student.joinCode && !revoked && !expired

  const connectNumber = student.joinCode
    ? formatSchoolConnectNumber(school.code, student.studentId, student.joinCode)
    : student.studentId

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header — school branding */}
      <div
        className="px-4 py-3 flex items-center gap-3 text-white"
        style={{ background: school.logoColor || '#075E54' }}
      >
        <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center text-base font-bold shrink-0">
          {school.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{school.name}</div>
          <div className="text-[10px] opacity-80 font-mono">{school.code}</div>
        </div>
        <ShieldCheck className="h-4 w-4 opacity-80" />
      </div>

      {/* Body — student identity */}
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-full bg-[var(--wasl-green)]/10 text-[var(--wasl-green)] flex items-center justify-center text-base font-semibold shrink-0">
            {student.fullName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{student.fullName}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {student.grade || 'Grade —'} · {student.className || 'Class —'}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md bg-muted/50 px-2.5 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Student ID</div>
            <div className="font-mono text-foreground mt-0.5">{student.studentId}</div>
          </div>
          <div className="rounded-md bg-muted/50 px-2.5 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Join Code</div>
            <div className={`font-mono mt-0.5 ${joinCodeActive ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
              {student.joinCode || '—'}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => setQrOpen(true)}
            disabled={!joinCodeActive}
          >
            <QrCode className="h-3.5 w-3.5 mr-1.5" />
            Show QR
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(connectNumber.replace(/\s/g, ''))
              toast.success('Connect Number copied')
            }}
            disabled={!student.joinCode}
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy number
          </Button>
        </div>

        {/* Status indicator */}
        {revoked && (
          <div className="mt-2 text-[10px] text-amber-600 flex items-center gap-1">
            <X className="h-3 w-3" />
            Join code revoked — request a new one from your school admin.
          </div>
        )}
        {expired && (
          <div className="mt-2 text-[10px] text-amber-600 flex items-center gap-1">
            <X className="h-3 w-3" />
            Join code expired {student.joinCodeExpiresAt ? new Date(student.joinCodeExpiresAt).toLocaleDateString() : ''}.
          </div>
        )}
        {joinCodeActive && student.joinCodeExpiresAt && (
          <div className="mt-2 text-[10px] text-muted-foreground">
            Code expires {new Date(student.joinCodeExpiresAt).toLocaleDateString()}.
          </div>
        )}
      </div>

      {/* QR Code dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
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
            <QRCodeDisplay value={connectNumber.replace(/\s/g, '')} size={200} />
            <div className="mt-3 font-mono text-xs text-center">
              {student.studentId}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
              {student.joinCode}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground text-center max-w-[260px]">
              Scan to connect a parent or guardian to this student record.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full text-xs"
              onClick={() => {
                navigator.clipboard.writeText(connectNumber.replace(/\s/g, ''))
                toast.success('Connect Number copied')
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy Connect Number
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
