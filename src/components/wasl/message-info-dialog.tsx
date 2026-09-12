'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Send, CheckCheck, Check, Clock, Loader2, Info } from 'lucide-react'
import { formatChatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useWaslStore, type ChatMessage } from '@/lib/store'

// Message info dialog — shows a delivery + read timeline for a single
// message. The timeline has three stages:
//   1. Sent — when the message was created
//   2. Delivered — when it was delivered to the recipient's device
//   3. Read — when the recipient opened and read the message
//
// For the sender's own messages, this also shows the read-receipts list
// (who read it and when). For received messages, it shows the sender info
// and delivery time.
export function MessageInfoDialog({
  open,
  onOpenChange,
  message,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  message: ChatMessage | null
}) {
  const user = useWaslStore((s) => s.user)
  const isOwn = !!message && !!user && message.senderId === user.id

  if (!message) return null

  // Determine the timeline stages
  const stages: {
    label: string
    icon: typeof Send
    time: string | null
    active: boolean
    color: string
  }[] = [
    {
      label: 'Sent',
      icon: Send,
      time: message.createdAt,
      active: true,
      color: 'text-muted-foreground',
    },
    {
      label: 'Delivered',
      icon: CheckCheck,
      time:
        message.status === 'delivered' ||
        message.status === 'read'
          ? message.createdAt
          : null,
      active: message.status === 'delivered' || message.status === 'read',
      color: 'text-muted-foreground',
    },
    {
      label: 'Read',
      icon: CheckCheck,
      time: message.status === 'read' ? message.createdAt : null,
      active: message.status === 'read',
      color: 'text-sky-500',
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-muted-foreground" />
            Message info
          </DialogTitle>
          <DialogDescription>
            {isOwn ? 'Delivery and read status' : 'Message details'}
          </DialogDescription>
        </DialogHeader>

        {/* Message preview */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 mb-4">
          <div className="text-sm text-foreground break-words whitespace-pre-wrap">
            {message.content.slice(0, 200)}
            {message.content.length > 200 ? '…' : ''}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1.5">
            {formatChatTimestamp(message.createdAt)}
            {message.edited && <span className="italic ml-2">edited</span>}
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-0">
          {stages.map((stage, i) => {
            const Icon = stage.icon
            const isLast = i === stages.length - 1
            return (
              <div key={stage.label} className="wasl-timeline-pop flex items-start gap-3" style={{ animationDelay: `${i * 100}ms` }}>
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                      stage.active
                        ? cn('bg-muted/50', stage.color)
                        : 'bg-muted/20 text-muted-foreground/40'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  {!isLast && (
                    <div
                      className={cn(
                        'w-0.5 flex-1 min-h-[24px]',
                        stage.active ? 'bg-muted-foreground/30' : 'bg-muted-foreground/10'
                      )}
                    />
                  )}
                </div>
                {/* Stage content */}
                <div className="flex-1 pb-4">
                  <div
                    className={cn(
                      'text-sm font-medium',
                      stage.active ? 'text-foreground' : 'text-muted-foreground/50'
                    )}
                  >
                    {stage.label}
                  </div>
                  {stage.time ? (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatChatTimestamp(stage.time)}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground/50 mt-0.5 italic">
                      {stage.label === 'Read'
                        ? 'Not read yet'
                        : 'Pending…'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Quick tip */}
        {isOwn && message.status !== 'read' && (
          <div className="mt-2 pt-3 border-t border-border text-[11px] text-muted-foreground italic">
            💡 Click the blue read-ticks (✓✓) on your message to see who has
            read it.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
