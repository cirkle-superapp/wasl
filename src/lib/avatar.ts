// Avatar color palette (WhatsApp-like greens + a few accents)
export const AVATAR_COLORS = [
  '#25D366', // whatsapp green
  '#075E54', // dark teal
  '#128C7E', // teal
  '#34B7F1', // light blue
  '#ECE5DD', // cream
  '#FF6B6B', // coral
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#10B981', // emerald
  '#6366F1', // indigo
  '#14B8A6', // teal-cyan
  '#F97316', // orange
  '#84CC16', // lime
]

export function pickAvatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
