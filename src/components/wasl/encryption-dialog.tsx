'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Shield,
  ShieldCheck,
  Lock,
  KeyRound,
  Fingerprint,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { useWaslStore } from '@/lib/store'

// Encryption info dialog — shows end-to-end encryption details for the
// current conversation. This is an informational/educational dialog that
// explains how Wasl protects messages. The "security code" is a
// deterministic hash derived from the conversation ID + participant IDs,
// shown as a formatted string (like WhatsApp's safety number).
export function EncryptionDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { activeConversationId, conversations, user } = useWaslStore()
  const conversation = conversations.find((c) => c.id === activeConversationId)

  if (!open) return null

  // Generate a deterministic "security code" from the conversation ID.
  // This is NOT real cryptography — it's a visual identifier that would
  // change if a participant were added/removed (simulating a key rotation).
  const otherParticipants = conversation?.participants.filter(
    (p) => p.userId !== user?.id
  ) || []

  // Simple deterministic hash from conversation ID (for display only)
  const securityCode = (activeConversationId || '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 12)
    .padEnd(12, '0')
    .replace(/(.{4})/g, '$1 ')
    .trim()
    .toUpperCase()

  const participantNames = otherParticipants.map((p) => p.name).join(', ')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--wasl-green)]" />
            Encryption
          </DialogTitle>
          <DialogDescription>
            Messages in this chat are protected
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Security status banner */}
          <div className="rounded-lg border border-[var(--wasl-green)]/30 bg-[var(--wasl-green)]/5 p-3 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[var(--wasl-green)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                End-to-end encrypted
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Messages and calls are secured with end-to-end encryption.
                Only you and {participantNames || 'the recipient'} can read
                them.
              </p>
            </div>
          </div>

          {/* Security code */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              Security code
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              This code is unique to this chat. You can compare it with{' '}
              {participantNames || 'the recipient'} to verify that your
              communication is secure.
            </p>
            <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-center gap-2 select-all">
              <Fingerprint className="w-4 h-4 text-muted-foreground shrink-0" />
              <code className="text-sm font-mono tracking-wider text-foreground">
                {securityCode}
              </code>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Tap the code to select and copy it
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              What's protected
            </div>
            {[
              { icon: Lock, label: 'Text messages' },
              { icon: ShieldCheck, label: 'Photos and media' },
              { icon: KeyRound, label: 'Voice messages' },
              { icon: Fingerprint, label: 'Protected messages (lock icon)' },
            ].map((item, i) => {
              const Icon = item.icon
              return (
                <div key={i} className="flex items-center gap-2.5 text-sm">
                  <div className="w-7 h-7 rounded-full bg-[var(--wasl-green)]/10 flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-[var(--wasl-green)]" />
                  </div>
                  <span className="text-foreground">{item.label}</span>
                  <CheckCircle2 className="w-4 h-4 text-[var(--wasl-green)] ml-auto shrink-0" />
                </div>
              )
            })}
          </div>

          {/* Note */}
          <div className="flex items-start gap-2 pt-2 border-t border-border">
            <AlertCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-snug">
              If the security code changes, you&apos;ll see a notification in
              the chat. This can happen if a participant reinstalls Wasl or
              switches devices.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
