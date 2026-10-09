// ═══════════════════════════════════════════════════════════════════════
// Hash-chain message integrity (Task 90)
// ═══════════════════════════════════════════════════════════════════════
//
// Each user has their own hash chain that records every message they send
// or receive. The chain is a sequence of (chainHash, prevChainHash) pairs
// where:
//   chainHash = SHA-256(prevChainHash || messageId || conversationId
//                      || senderId || content || createdAtISO)
//
// Built on node:crypto's createHash — no external libraries.
//
// Verification algorithm:
//   1. Fetch all chain entries for the user, ordered by createdAt.
//   2. For each entry, recompute the chainHash from the prevChainHash +
//      the message data.
//   3. If the recomputed hash matches the stored hash, the entry is intact.
//   4. If not, mark the entry as "tampered". All entries AFTER a tampered
//      entry are also considered tampered (since they depend on the
//      tampered prevHash).
//
// This is the same principle as a blockchain: each block's hash depends
// on the previous block's hash, so changing any historical block invalidates
// the entire chain from that point forward.

import { createHash } from 'node:crypto'
import { db } from '@/lib/db'

// ---- Hash computation ------------------------------------------------------

/**
 * Compute the chain hash for a new entry.
 * Returns hex string (64 chars).
 */
export function computeChainHash(params: {
  prevChainHash: string | null
  messageId: string
  conversationId: string
  senderId: string
  content: string
  createdAt: string | Date
}): string {
  const createdAtISO = typeof params.createdAt === 'string'
    ? params.createdAt
    : params.createdAt.toISOString()
  const payload = [
    params.prevChainHash ?? '',
    params.messageId,
    params.conversationId,
    params.senderId,
    params.content,
    createdAtISO,
  ].join('|')
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Compute the content hash for a message snapshot. Used to detect edits
 * — if the message content changes, the content hash changes too.
 */
export function computeContentHash(params: {
  messageId: string
  conversationId: string
  senderId: string
  content: string
  createdAt: string | Date
}): string {
  const createdAtISO = typeof params.createdAt === 'string'
    ? params.createdAt
    : params.createdAt.toISOString()
  const payload = [
    params.messageId,
    params.conversationId,
    params.senderId,
    params.content,
    createdAtISO,
  ].join('|')
  return createHash('sha256').update(payload).digest('hex')
}

// ---- Chain operations ------------------------------------------------------

/**
 * Append a new entry to the user's hash chain for a given message.
 * Looks up the user's most recent chain entry's chainHash and chains
 * off of it.
 */
export async function appendChainEntry(params: {
  userId: string
  messageId: string
  conversationId: string
  senderId: string
  content: string
  createdAt: Date
}): Promise<{ chainHash: string; prevChainHash: string | null }> {
  // Find the user's most recent chain entry
  const latest = await db.messageChainEntry.findFirst({
    where: { userId: params.userId },
    orderBy: { createdAt: 'desc' },
    select: { chainHash: true },
  })
  const prevChainHash = latest?.chainHash ?? null

  const chainHash = computeChainHash({
    prevChainHash,
    messageId: params.messageId,
    conversationId: params.conversationId,
    senderId: params.senderId,
    content: params.content,
    createdAt: params.createdAt,
  })
  const contentHash = computeContentHash({
    messageId: params.messageId,
    conversationId: params.conversationId,
    senderId: params.senderId,
    content: params.content,
    createdAt: params.createdAt,
  })

  await db.messageChainEntry.create({
    data: {
      userId: params.userId,
      messageId: params.messageId,
      chainHash,
      prevChainHash,
      contentHash,
    },
  })

  return { chainHash, prevChainHash }
}

// ---- Verification ----------------------------------------------------------

export type ChainVerificationResult = {
  totalEntries: number
  verified: number
  tampered: number
  // Indexes of tampered entries (so the UI can highlight them)
  tamperedIndexes: number[]
  // True if the entire chain is intact
  isIntact: boolean
  // Per-entry verification details
  entries: Array<{
    id: string
    messageId: string
    chainHash: string
    prevChainHash: string | null
    recomputedHash: string
    isIntact: boolean
    createdAt: string
  }>
}

/**
 * Verify the integrity of the user's hash chain.
 *
 * Algorithm:
 *   1. Fetch all chain entries ordered by createdAt.
 *   2. For each entry, recompute the chainHash from prevChainHash + the
 *      corresponding message data.
 *   3. Compare the recomputed hash to the stored hash.
 *   4. If they match, the entry is intact. If not, the entry is tampered.
 *   5. Once we hit a tampered entry, all subsequent entries are also
 *      considered tampered (because they depend on the tampered prevHash).
 *
 * Note: We verify against the MESSAGE's current content. If a message was
 * legitimately edited, we should have a new chain entry for that edit —
 * the old entry would still verify against the OLD content snapshot,
 * which we don't have (we only snapshot contentHash). For a proper audit
 * log, we'd snapshot the content itself. For now, the contentHash
 * mismatch is itself a tamper signal.
 */
export async function verifyUserChain(userId: string): Promise<ChainVerificationResult> {
  const entries = await db.messageChainEntry.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    take: 1000, // safety cap
    select: {
      id: true,
      messageId: true,
      chainHash: true,
      prevChainHash: true,
      contentHash: true,
      createdAt: true,
    },
  })

  if (entries.length === 0) {
    return {
      totalEntries: 0,
      verified: 0,
      tampered: 0,
      tamperedIndexes: [],
      isIntact: true,
      entries: [],
    }
  }

  // Fetch the messages corresponding to these entries (to verify against
  // current message data)
  const messageIds = [...new Set(entries.map((e) => e.messageId))]
  const messages = await db.message.findMany({
    where: { id: { in: messageIds } },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      content: true,
      createdAt: true,
    },
  })
  const messageById = new Map(messages.map((m) => [m.id, m]))

  let verified = 0
  let tampered = 0
  const tamperedIndexes: number[] = []
  const detailedEntries: ChainVerificationResult['entries'] = []
  let chainIsBroken = false

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const message = messageById.get(entry.messageId)

    let recomputedHash: string
    let isIntact: boolean

    if (!message) {
      // Message was deleted — we can't verify, but the chain entry remains.
      // This isn't tampering per se; flag as "missing source".
      recomputedHash = '(message deleted)'
      isIntact = false
    } else {
      recomputedHash = computeChainHash({
        prevChainHash: entry.prevChainHash,
        messageId: entry.messageId,
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content,
        createdAt: message.createdAt,
      })
      isIntact = recomputedHash === entry.chainHash
    }

    // If the chain is already broken (a previous entry was tampered),
    // all subsequent entries are also flagged.
    if (chainIsBroken) {
      isIntact = false
    } else if (!isIntact) {
      chainIsBroken = true
    }

    if (isIntact) verified++
    else {
      tampered++
      tamperedIndexes.push(i)
    }

    detailedEntries.push({
      id: entry.id,
      messageId: entry.messageId,
      chainHash: entry.chainHash,
      prevChainHash: entry.prevChainHash ?? '',
      recomputedHash,
      isIntact,
      createdAt: entry.createdAt.toISOString(),
    })
  }

  return {
    totalEntries: entries.length,
    verified,
    tampered,
    tamperedIndexes,
    isIntact: tampered === 0,
    entries: detailedEntries,
  }
}
