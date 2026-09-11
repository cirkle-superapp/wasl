'use client'

import { Check, CheckCheck, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatChatTimestamp } from '@/lib/time'
import { useWaslStore, type ChatMessage } from '@/lib/store'

export function MessageBubble({
  message,
  senderName,
  isGroup,
  replyTo,
}: {
  message: ChatMessage
  senderName?: string
  isGroup: boolean
  replyTo?: ChatMessage | null
}) {
  const me = useWaslStore((s) => s.user)
  const mine = message.senderId === me?.id

  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <div className="wasl-bubble-system text-xs px-3 py-1.5 rounded-lg shadow-sm">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex w-full wasl-animate-in',
        mine ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[78%] sm:max-w-[65%] md:max-w-[60%] px-2.5 py-1.5 shadow-sm relative',
          mine ? 'wasl-bubble-out' : 'wasl-bubble-in'
        )}
      >
        {isGroup && !mine && senderName && (
          <div className="text-xs font-semibold mb-0.5 text-[var(--wasl-teal)] dark:text-[var(--wasl-green)]">
            {senderName}
          </div>
        )}
        {replyTo && (
          <div className="border-l-2 border-[var(--wasl-green)] pl-2 mb-1 opacity-70 text-sm bg-black/5 dark:bg-white/5 rounded py-0.5 px-1">
            <div className="text-xs font-medium">
              {replyTo.senderId === me?.id
                ? 'You'
                : 'Replied to'}
            </div>
            <div className="truncate">{replyTo.content}</div>
          </div>
        )}
        {message.type === 'image' ? (
          <div className="rounded-lg overflow-hidden max-w-xs">
            { }
            <img src={message.content} alt="sent" className="w-full h-auto" />
            <div className="text-[10px] text-right text-foreground/60 mt-0.5">
              {formatChatTimestamp(message.createdAt)}
              {mine && <StatusTicks status={message.status} className="ml-1" />}
            </div>
          </div>
        ) : (
          <div className="text-sm leading-relaxed break-words whitespace-pre-wrap pr-1">
            {message.content}
            <span className="inline-flex items-center gap-1 ml-2 align-bottom text-[10px] text-foreground/50 float-right mt-1">
              {formatChatTimestamp(message.createdAt)}
              {mine && <StatusTicks status={message.status} />}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusTicks({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  if (status === 'sent') {
    return <Check className={cn('w-3.5 h-3.5 inline', className)} />
  }
  if (status === 'delivered') {
    return <CheckCheck className={cn('w-3.5 h-3.5 inline', className)} />
  }
  if (status === 'read') {
    return (
      <CheckCheck className={cn('w-3.5 h-3.5 inline text-sky-500', className)} />
    )
  }
  return <Clock className={cn('w-3.5 h-3.5 inline', className)} />
}
