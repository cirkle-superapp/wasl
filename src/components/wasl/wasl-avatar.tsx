'use client'

import { getInitials } from '@/lib/avatar'
import { cn } from '@/lib/utils'

export function WaslAvatar({
  name,
  src,
  color,
  size = 44,
  online,
  showStatus = false,
  className,
}: {
  name: string
  src?: string | null
  color?: string | null
  size?: number
  online?: boolean
  showStatus?: boolean
  className?: string
}) {
  const bg = color || '#25D366'
  return (
    <div
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <div
        className="rounded-full overflow-hidden flex items-center justify-center font-medium text-white select-none w-full h-full"
        style={{ backgroundColor: bg }}
      >
        {src ? (
           
          <img
            src={src}
            alt={name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span style={{ fontSize: Math.max(12, size * 0.4) }}>
            {getInitials(name)}
          </span>
        )}
      </div>
      {showStatus && (
        <span
          className={cn(
            'absolute bottom-0 right-0 block rounded-full border-2 border-white dark:border-[var(--wasl-sidebar-bg)]',
            online ? 'bg-[var(--wasl-green)]' : 'bg-gray-400'
          )}
          style={{
            width: Math.max(10, size * 0.25),
            height: Math.max(10, size * 0.25),
          }}
        />
      )}
    </div>
  )
}
