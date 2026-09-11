// Lightweight date/time formatters used across Wasl.

export function formatTimeShort(iso: string | Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  if (isYesterday) return 'Yesterday'
  const sameYear = d.getFullYear() === now.getFullYear()
  if (sameYear) {
    return d.toLocaleDateString([], { day: '2-digit', month: 'short' })
  }
  return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: '2-digit' })
}

export function formatChatTimestamp(iso: string | Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatDateDivider(iso: string | Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  if (isYesterday) return 'Yesterday'
  const sameYear = d.getFullYear() === now.getFullYear()
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }
  if (!sameYear) opts.year = 'numeric'
  return d.toLocaleDateString([], opts)
}

export function formatRelative(iso: string | Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = (d.getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'just now'
  if (abs < 3600) return `${Math.floor(abs / 60)} min ago`
  if (abs < 86400) return `${Math.floor(abs / 3600)} h ago`
  if (abs < 604800) return `${Math.floor(abs / 86400)} d ago`
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' })
}

export function formatLastSeen(iso: string | Date, online: boolean): string {
  if (online) return 'online'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'last seen recently'
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `last seen today at ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  if (isYesterday) return `last seen yesterday at ${time}`
  return `last seen ${d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}`
}
