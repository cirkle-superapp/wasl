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
            key={src}
            src={src}
            alt={name}
            className="w-full h-full object-cover wasl-avatar-img-in"
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
            online ? 'bg-[var(--wasl-green)] wasl-online-premium' : 'bg-gray-400'
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

// Group avatar — shows up to 4 stacked mini-avatars for the participants.
// Falls back to a single initials avatar if no participants are provided.
// The "ring" between avatars matches the sidebar background so it looks
// like the avatars are layered on top of each other.
export type GroupParticipant = {
  name: string
  avatar?: string | null
  avatarColor?: string | null
}

export function WaslGroupAvatar({
  name,
  participants = [],
  src,
  size = 44,
  className,
}: {
  name: string
  participants?: GroupParticipant[]
  // Optional custom group avatar URL (e.g. an uploaded photo set by an
  // admin). When provided it overrides the composite initials grid.
  src?: string | null
  size?: number
  className?: string
}) {
  // If an admin has uploaded a custom avatar, render it the same way a regular
  // user avatar renders (single image, no composite grid, no initials).
  if (src) {
    return (
      <WaslAvatar
        name={name}
        src={src}
        size={size}
        className={className}
      />
    )
  }
  if (participants.length === 0) {
    return <WaslAvatar name={name} size={size} className={className} />
  }
  const top = participants.slice(0, 4)
  // Grid layout — 1 = single big, 2 = side-by-side, 3-4 = 2x2 grid
  const layout = top.length === 1 ? '1' : top.length === 2 ? '2' : '4'
  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 rounded-full overflow-hidden',
        className
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${name} — group with ${participants.length} member${participants.length === 1 ? '' : 's'}`}
    >
      <div
        className={cn(
          'grid w-full h-full gap-0',
          layout === '1' && 'grid-cols-1 grid-rows-1',
          layout === '2' && 'grid-cols-2 grid-rows-1',
          layout === '4' && 'grid-cols-2 grid-rows-2'
        )}
      >
        {top.map((p, i) => (
          <div
            key={i}
            className="flex items-center justify-center font-medium text-white overflow-hidden wasl-group-avatar-cell"
            style={{
              backgroundColor: p.avatarColor || '#075E54',
              animationDelay: `${i * 80}ms`,
            }}
          >
            {p.avatar ? (
              <img
                src={p.avatar}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span style={{ fontSize: Math.max(8, size * 0.22) }}>
                {getInitials(p.name)}
              </span>
            )}
          </div>
        ))}
        {/* If we have exactly 3 participants, fill the 4th cell with the group color */}
        {top.length === 3 && (
          <div
            className="flex items-center justify-center text-white"
            style={{ backgroundColor: '#128C7E' }}
          >
            <span style={{ fontSize: Math.max(8, size * 0.22) }}>+</span>
          </div>
        )}
      </div>
    </div>
  )
}
