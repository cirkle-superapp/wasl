import { db } from './db'

// Commit type metadata — mirrors the Cirkle commit feature.
export const COMMIT_TYPES = [
  { key: 'price', label: 'Price', emoji: '💰' },
  { key: 'work', label: 'Work Task', emoji: '📋' },
  { key: 'service', label: 'Service', emoji: '🤝' },
  { key: 'rental', label: 'Rental', emoji: '🏠' },
  { key: 'group_buy', label: 'Group Buy', emoji: '📦' },
] as const

export type CommitTypeKey = (typeof COMMIT_TYPES)[number]['key']

export const COMMIT_CURRENCIES = ['SAR', 'AED', 'EGP', 'USD', 'EUR', 'KWD', 'QAR'] as const

export function commitTypeMeta(key: string) {
  return (
    COMMIT_TYPES.find((t) => t.key === key) || {
      key,
      label: key,
      emoji: '📄',
    }
  )
}

// 64-char hex hash, deterministic-ish for demo purposes.
export function genHash(): string {
  const hex = '0123456789abcdef'
  let h = '0x'
  for (let i = 0; i < 64; i++) h += hex[Math.floor(Math.random() * 16)]
  return h
}

// Mock fairness check — returns a score 70-97 and a market range note.
export function fairnessCheck(amount: number, currency: string, type: string) {
  const score = 70 + Math.floor(Math.random() * 28) // 70-97
  const lo = Math.round(amount * 0.9)
  const hi = Math.round(amount * 1.1)
  const passed = score >= 70
  const note = passed
    ? `Fair price. Within range for ${commitTypeMeta(type).label.toLowerCase()} agreements in your area.`
    : 'Outside typical range — review the conditions before signing.'
  return {
    passed,
    score,
    marketRange: `${lo}-${hi} ${currency}`,
    note,
  }
}

// Serialize a Commit row (with creator + counterparty included) to a safe JSON shape.
export async function serializeCommit(commitId: string) {
  const commit = await db.commit.findUnique({
    where: { id: commitId },
    include: {
      creator: {
        select: { id: true, name: true, avatar: true, avatarColor: true, phone: true },
      },
      counterparty: {
        select: { id: true, name: true, avatar: true, avatarColor: true, phone: true },
      },
    },
  })
  if (!commit) return null
  let conditions: string[] = []
  try {
    conditions = JSON.parse(commit.conditions || '[]')
  } catch {
    conditions = []
  }
  return {
    id: commit.id,
    conversationId: commit.conversationId,
    type: commit.type,
    typeLabel: commitTypeMeta(commit.type).label,
    typeEmoji: commitTypeMeta(commit.type).emoji,
    title: commit.title,
    description: commit.description,
    amount: commit.amount,
    currency: commit.currency,
    deadline: commit.deadline,
    conditions,
    status: commit.status,
    fairnessScore: commit.fairnessScore,
    fairnessNote: commit.fairnessNote,
    hash: commit.hash,
    creator: commit.creator,
    counterparty: commit.counterparty,
    creatorSigned: commit.creatorSigned,
    counterpartySigned: commit.counterpartySigned,
    creatorSignedAt: commit.creatorSignedAt,
    counterpartySignedAt: commit.counterpartySignedAt,
    completedAt: commit.completedAt,
    createdAt: commit.createdAt,
    updatedAt: commit.updatedAt,
  }
}

export type SerializedCommit = Awaited<ReturnType<typeof serializeCommit>>
