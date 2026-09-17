'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { CheckCheck, Loader2, Clock, Users } from 'lucide-react'
import { WaslAvatar } from './wasl-avatar'
import { formatChatTimestamp, formatLastSeen } from '@/lib/time'
import { useWaslStore } from '@/lib/store'

type Recipient = {
  userId: string
  name: string
  username: string
  avatar: string | null
  avatarColor: string | null
  online: boolean
  lastSeen: string
}

type ReadBy = Recipient & { readAt: string }
type DeliveredTo = Recipient & { deliveredAt: string }

type Breakdown = {
  readBy: ReadBy[]
  deliveredTo: DeliveredTo[]
  pending: Recipient[]
  totalParticipants: number
}

const EMPTY: Breakdown = {
  readBy: [],
  deliveredTo: [],
  pending: [],
  totalParticipants: 0,
}

export function ReadReceiptsDialog({
  open,
  onOpenChange,
  messageId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  messageId: string | null
}) {
  const [data, setData] = useState<Breakdown>(EMPTY)
  const [loading, setLoading] = useState(false)
  const onlineUserIds = useWaslStore((s) => s.onlineUserIds)

  const load = useCallback(async () => {
    if (!messageId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/messages/${messageId}/read-receipts`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        setData(EMPTY)
        return
      }
      const json = (await res.json()) as Partial<Breakdown>
      setData({
        readBy: json.readBy ?? [],
        deliveredTo: json.deliveredTo ?? [],
        pending: json.pending ?? [],
        totalParticipants: json.totalParticipants ?? 0,
      })
    } catch {
      setData(EMPTY)
    } finally {
      setLoading(false)
    }
  }, [messageId])

  useEffect(() => {
    if (open) {
      load()
    }
  }, [open, load])

  // Reset the breakdown whenever the dialog closes so reopening a different
  // message doesn't briefly show the previous message's recipients.
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setData(EMPTY), 150)
      return () => clearTimeout(t)
    }
  }, [open])

  const { readBy, deliveredTo, pending, totalParticipants } = data
  const readCount = readBy.length
  const deliveredCount = deliveredTo.length
  const pendingCount = pending.length
  const hasAnyRecipient = totalParticipants > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCheck className="w-5 h-5 text-[var(--wasl-green-dark)] dark:text-[var(--wasl-green)]" />
            Read receipts
          </DialogTitle>
          <DialogDescription>
            {totalParticipants > 0
              ? `${readCount} of ${totalParticipants} recipient${
                  totalParticipants === 1 ? '' : 's'
                } read this message`
              : 'Delivery and read status for this message'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-96 overflow-y-auto wasl-scroll -mx-2 px-2 wasl-read-receipts-pop">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : !hasAnyRecipient ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                <Users className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                No other recipients
              </p>
              <p className="text-xs max-w-[220px]">
                This conversation has no other participants to deliver this
                message to.
              </p>
            </div>
          ) : readCount === 0 && deliveredCount === 0 && pendingCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                <Clock className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                Waiting to deliver
              </p>
              <p className="text-xs max-w-[220px]">
                This message hasn&apos;t been delivered to any recipient yet.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* ---- READ section ---- */}
              {readCount > 0 && (
                <Section
                  label="Read"
                  count={readCount}
                  icon={<CheckCheck className="w-3 h-3" />}
                  accent="read"
                >
                  {readBy.map((p) => (
                    <RecipientRow
                      key={`read-${p.userId}`}
                      p={p}
                      onlineUserIds={onlineUserIds}
                      timestampLabel={`Read ${formatChatTimestamp(p.readAt)}`}
                      trailing={
                        <CheckCheck className="w-4 h-4 text-[var(--wasl-green-dark)] dark:text-[var(--wasl-green)] shrink-0" />
                      }
                    />
                  ))}
                </Section>
              )}

              {/* ---- DELIVERED section ---- */}
              {deliveredCount > 0 && (
                <Section
                  label="Delivered"
                  count={deliveredCount}
                  icon={<CheckCheck className="w-3 h-3" />}
                  accent="delivered"
                >
                  {deliveredTo.map((p) => (
                    <RecipientRow
                      key={`delivered-${p.userId}`}
                      p={p}
                      onlineUserIds={onlineUserIds}
                      timestampLabel={`Delivered ${formatChatTimestamp(
                        p.deliveredAt
                      )}`}
                      trailing={
                        <CheckCheck className="w-4 h-4 text-muted-foreground shrink-0" />
                      }
                    />
                  ))}
                </Section>
              )}

              {/* ---- PENDING section ---- */}
              {pendingCount > 0 && (
                <Section
                  label="Pending"
                  count={pendingCount}
                  icon={<Clock className="w-3 h-3" />}
                  accent="pending"
                >
                  {pending.map((p) => (
                    <RecipientRow
                      key={`pending-${p.userId}`}
                      p={p}
                      onlineUserIds={onlineUserIds}
                      timestampLabel="Not delivered yet"
                      trailing={
                        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                      }
                    />
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---- Sub-components --------------------------------------------------------

function Section({
  label,
  count,
  icon,
  accent,
  children,
}: {
  label: string
  count: number
  icon: React.ReactNode
  accent: 'read' | 'delivered' | 'pending'
  children: React.ReactNode
}) {
  const accentClass =
    accent === 'read'
      ? 'text-[var(--wasl-green-dark)] dark:text-[var(--wasl-green)]'
      : 'text-muted-foreground'
  return (
    <div className="pt-1">
      <div
        className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1.5 flex items-center gap-1.5 ${accentClass}`}
      >
        {icon}
        <span>
          {label} ({count})
        </span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function RecipientRow({
  p,
  onlineUserIds,
  timestampLabel,
  trailing,
}: {
  p: Recipient
  onlineUserIds: Set<string>
  timestampLabel: string
  trailing: React.ReactNode
}) {
  const isOnline = onlineUserIds.has(p.userId) || p.online
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
      <WaslAvatar
        name={p.name}
        src={p.avatar}
        color={p.avatarColor}
        size={36}
        online={isOnline}
        showStatus
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate text-foreground">
          {p.name}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{timestampLabel}</span>
          <span className="text-muted-foreground/40">·</span>
          {isOnline ? (
            <span className="text-[var(--wasl-green-dark)] dark:text-[var(--wasl-green)] font-medium flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--wasl-green)] inline-block" />
              online
            </span>
          ) : (
            <span className="flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {formatLastSeen(p.lastSeen, false)}
            </span>
          )}
        </div>
      </div>
      {trailing}
    </div>
  )
}

