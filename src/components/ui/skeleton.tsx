'use client'

import { cn } from '@/lib/utils'

// Tiny shimmering skeleton block. Use `<Skeleton className="h-4 w-32" />`
// anywhere you'd otherwise show "Loading…" text. Uses a CSS gradient sweep
// so it works in both light and dark themes.
export function Skeleton({
  className,
  rounded = 'rounded-md',
  style,
  ...props
}: {
  className?: string
  rounded?: string
  style?: React.CSSProperties
  [key: string]: any
}) {
  return (
    <div
      className={cn(
        'wasl-skeleton bg-muted/60',
        rounded,
        className
      )}
      style={style}
      aria-hidden
      {...props}
    />
  )
}

// A ready-made chat-message skeleton — a fake bubble + timestamp row.
export function MessageSkeleton({ mine = false }: { mine?: boolean }) {
  return (
    <div className={cn('flex w-full', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[70%] space-y-1.5')}>
        <div
          className={cn(
            'px-3 py-2 rounded-2xl shadow-sm',
            mine ? 'wasl-bubble-out' : 'wasl-bubble-in'
          )}
        >
          <Skeleton className="h-3 w-44 bg-foreground/15" />
          <Skeleton className="h-3 w-32 bg-foreground/15" />
          <Skeleton className="h-3 w-24 bg-foreground/15" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-2 w-12" />
        </div>
      </div>
    </div>
  )
}

// Conversation-list skeleton — fake avatar + name + preview row.
export function ConversationRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-2.5">
      <Skeleton rounded="rounded-full" className="h-12 w-12 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex justify-between gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-2 w-10" />
        </div>
        <Skeleton className="h-2.5 w-40" />
      </div>
    </div>
  )
}
