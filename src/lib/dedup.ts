// ═══════════════════════════════════════════════════════════════════════
// Smart contact deduplication (Task 90)
// ═══════════════════════════════════════════════════════════════════════
//
// Built entirely from scratch — no external fuzzy-matching library.
// Combines three independent similarity signals:
//
//   1. NAME similarity — Jaro-Winkler distance (good for short strings
//      with common prefixes, like names). Hand-rolled implementation of
//      the classic Jaro + Winkler prefix-boost algorithm.
//
//   2. PHONE similarity — normalize to E.164-ish format (strip non-digits,
//      prepend default country code if the local number has the wrong
//      length) and compare. Exact match = 1.0, last-7-digits match = 0.9,
//      last-4-digits match = 0.5 (less reliable).
//
//   3. USERNAME similarity — exact match (case-insensitive) = 1.0,
//      otherwise 0.
//
// Final score = max of the three signals, with phone match weighted
// highest (phones are the most reliable identifier — they're unique).
//
// Two contacts are considered "duplicates" if score >= 0.85.

// ---- Phone normalization (E.164-ish) ---------------------------------------

const DEFAULT_COUNTRY_CODE = '20' // Egypt (matches the project's phone format)

/**
 * Normalize a phone number to a comparable string.
 * - Strips all non-digit characters
 * - If the number has 10 digits starting with a non-zero, prepend default country code
 * - If the number has 11 digits starting with 0, strip the leading 0 and prepend default country code
 * - If the number has 12+ digits starting with the default country code, leave as-is
 * - Otherwise leave digits only
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  // Strip everything except digits
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null

  // Already has country code (12 digits starting with 20 for Egypt)
  if (digits.length === 12 && digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    return digits
  }
  // 11 digits starting with 0 → strip leading 0, prepend country code
  if (digits.length === 11 && digits.startsWith('0')) {
    return DEFAULT_COUNTRY_CODE + digits.slice(1)
  }
  // 10 digits starting with 1 (Egyptian mobile) → prepend country code
  if (digits.length === 10 && digits.startsWith('1')) {
    return DEFAULT_COUNTRY_CODE + digits
  }
  // If it's an international number that already starts with a country code
  // (length > 11), leave it as-is
  if (digits.length > 11) return digits
  // Otherwise, prepend the default country code
  return DEFAULT_COUNTRY_CODE + digits
}

/** Get the last N digits of a normalized phone. Useful for fuzzy matching. */
export function phoneLastDigits(phone: string | null | undefined, n = 7): string | null {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  return normalized.slice(-n)
}

// ---- Jaro-Winkler similarity ------------------------------------------------

/**
 * Jaro similarity between two strings.
 *
 * The Jaro measure is the weighted fraction of matching characters across
 * both strings, where matching means the same character appears within
 * a "matching window" of (max(|s1|,|s2|)/2 - 1) positions.
 *
 * Then transpositions (matched chars in different order) reduce the score.
 *
 * Returns a value in [0, 1].
 */
export function jaroSimilarity(s1: string, s2: string): number {
  if (!s1 && !s2) return 1
  if (!s1 || !s2) return 0
  if (s1 === s2) return 1

  const len1 = s1.length
  const len2 = s2.length
  const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1)

  const s1Matches = new Array(len1).fill(false)
  const s2Matches = new Array(len2).fill(false)

  let matches = 0
  // Find matches
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow)
    const end = Math.min(len2, i + matchWindow + 1)
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue
      if (s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }

  if (matches === 0) return 0

  // Count transpositions
  let transpositions = 0
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }
  transpositions = Math.floor(transpositions / 2)

  const m = matches
  return (m / len1 + m / len2 + (m - transpositions) / m) / 3
}

/**
 * Jaro-Winkler similarity — Jaro + a prefix bonus.
 * The Winkler prefix bonus rewards strings that share a common prefix
 * (up to 4 chars), which is exactly what we want for name matching
 * (people often shorten names — "Chris" vs "Christopher" share the prefix).
 *
 * Returns a value in [0, 1].
 */
export function jaroWinklerSimilarity(s1: string, s2: string): number {
  const jaro = jaroSimilarity(s1, s2)
  // Common prefix length, capped at 4
  let prefix = 0
  const maxPrefix = 4
  for (let i = 0; i < Math.min(s1.length, s2.length, maxPrefix); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }
  // Winkler's scaling factor is 0.1 (the default)
  return jaro + prefix * 0.1 * (1 - jaro)
}

// ---- Name normalization -----------------------------------------------------

/**
 * Normalize a name for matching:
 *   - Lowercase
 *   - Strip diacritics (é → e, ñ → n)
 *   - Collapse whitespace
 *   - Sort first/last name tokens (so "John Smith" matches "Smith John")
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s]/g, ' ')     // strip non-alphanumeric (keep spaces)
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .sort()
    .join(' ')
}

// ---- Duplicate scoring ------------------------------------------------------

export type ContactForDedup = {
  id: string
  name: string
  phone: string | null
  username?: string | null
  userId?: string | null
}

export type DuplicateMatch = {
  contactA: ContactForDedup
  contactB: ContactForDedup
  score: number
  signals: {
    nameSimilarity: number
    phoneSimilarity: number
    usernameSimilarity: number
  }
  // Which signal contributed the most to the final score?
  primarySignal: 'name' | 'phone' | 'username'
}

/**
 * Compute a similarity score between two contacts.
 * Score is in [0, 1]. >= 0.85 means "likely duplicate".
 */
export function scorePair(a: ContactForDedup, b: ContactForDedup): DuplicateMatch {
  // Name similarity
  const nameA = normalizeName(a.name)
  const nameB = normalizeName(b.name)
  const nameSim = (nameA && nameB) ? jaroWinklerSimilarity(nameA, nameB) : 0

  // Phone similarity
  const phoneA = normalizePhone(a.phone)
  const phoneB = normalizePhone(b.phone)
  let phoneSim = 0
  if (phoneA && phoneB) {
    if (phoneA === phoneB) {
      phoneSim = 1.0
    } else {
      // Try last-7-digits match (catches same number with different country codes)
      const lastA = phoneLastDigits(a.phone, 7)
      const lastB = phoneLastDigits(b.phone, 7)
      if (lastA && lastB && lastA === lastB) {
        phoneSim = 0.9
      } else {
        // Last 4 digits (less reliable — false positives possible)
        const last4A = phoneLastDigits(a.phone, 4)
        const last4B = phoneLastDigits(b.phone, 4)
        if (last4A && last4B && last4A === last4B) {
          phoneSim = 0.5
        }
      }
    }
  }

  // Username similarity — exact match (case-insensitive)
  let usernameSim = 0
  if (a.username && b.username && a.username.toLowerCase() === b.username.toLowerCase()) {
    usernameSim = 1.0
  }
  // If they share a userId (same Wasl account), they're DEFINITELY the same person.
  // This is the strongest possible signal — short-circuit to score = 1.0.
  if (a.userId && b.userId && a.userId === b.userId) {
    return {
      contactA: a,
      contactB: b,
      score: 1.0,
      signals: {
        nameSimilarity: Math.round(nameSim * 100) / 100,
        phoneSimilarity: Math.round(phoneSim * 100) / 100,
        usernameSimilarity: 1.0,
      },
      primarySignal: 'username',
    }
  }

  // ── High-confidence short-circuits ──────────────────────────────────
  // If two contacts share an EXACT phone match, they're very likely the
  // same person (modulo shared landlines, which are rare). Score 0.95.
  if (phoneSim >= 1.0) {
    // If name ALSO matches even loosely, it's near-certain → 1.0
    const finalScore = nameSim >= 0.85 ? 1.0 : 0.95
    return {
      contactA: a,
      contactB: b,
      score: finalScore,
      signals: {
        nameSimilarity: Math.round(nameSim * 100) / 100,
        phoneSimilarity: 1.0,
        usernameSimilarity: Math.round(usernameSim * 100) / 100,
      },
      primarySignal: 'phone',
    }
  }
  // If two contacts have the same username (exact match), they're the same Wasl user.
  if (usernameSim >= 1.0) {
    return {
      contactA: a,
      contactB: b,
      score: 0.95,
      signals: {
        nameSimilarity: Math.round(nameSim * 100) / 100,
        phoneSimilarity: Math.round(phoneSim * 100) / 100,
        usernameSimilarity: 1.0,
      },
      primarySignal: 'username',
    }
  }
  // Last-7-digits phone match (different country code but same number)
  if (phoneSim >= 0.9) {
    return {
      contactA: a,
      contactB: b,
      score: 0.9,
      signals: {
        nameSimilarity: Math.round(nameSim * 100) / 100,
        phoneSimilarity: Math.round(phoneSim * 100) / 100,
        usernameSimilarity: Math.round(usernameSim * 100) / 100,
      },
      primarySignal: 'phone',
    }
  }

  // ── Fuzzy combination scoring ───────────────────────────────────────
  // For cases where neither phone nor username matches exactly, we look
  // at name similarity + weaker phone similarity (e.g., last-4-digits).
  const weightedName = nameSim * 0.5
  const weightedPhone = phoneSim * 0.4
  let score = Math.max(weightedName, weightedPhone)

  // Multi-signal bonus: if BOTH name AND phone agree even weakly, it's
  // likely the same person.
  let agreeCount = 0
  if (phoneSim >= 0.5) agreeCount++
  if (usernameSim >= 1.0) agreeCount++
  if (nameSim >= 0.85) agreeCount++
  if (agreeCount >= 2) score = Math.min(1, score + 0.25)

  // Determine primary signal (which signal contributed the most)
  let primarySignal: DuplicateMatch['primarySignal'] = 'name'
  if (weightedPhone >= weightedName && phoneSim > 0) primarySignal = 'phone'
  else if (usernameSim >= 1.0) primarySignal = 'username'

  return {
    contactA: a,
    contactB: b,
    score: Math.round(score * 100) / 100,
    signals: {
      nameSimilarity: Math.round(nameSim * 100) / 100,
      phoneSimilarity: Math.round(phoneSim * 100) / 100,
      usernameSimilarity: Math.round(usernameSim * 100) / 100,
    },
    primarySignal,
  }
}

/**
 * Find all duplicate pairs in a contact list.
 * O(n²) — fine for up to ~1000 contacts.
 *
 * Returns pairs sorted by score desc, with score >= threshold.
 */
export function findDuplicates(contacts: ContactForDedup[], threshold = 0.85): DuplicateMatch[] {
  const pairs: DuplicateMatch[] = []
  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      const match = scorePair(contacts[i], contacts[j])
      if (match.score >= threshold) {
        pairs.push(match)
      }
    }
  }
  // Sort by score desc
  pairs.sort((a, b) => b.score - a.score)
  return pairs
}

/**
 * Group duplicates into connected components (so if A=B and B=C, all three
 * are in the same group even if A and C aren't directly similar).
 *
 * Uses union-find (disjoint set) — classic algorithm.
 */
export function groupDuplicates(pairs: DuplicateMatch[]): ContactForDedup[][] {
  // Build the union-find
  const parent = new Map<string, string>()
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x)
    let root = x
    while (parent.get(root) !== root) {
      root = parent.get(root)!
    }
    // Path compression
    let curr = x
    while (parent.get(curr) !== root) {
      const next = parent.get(curr)!
      parent.set(curr, root)
      curr = next
    }
    return root
  }
  function union(a: string, b: string) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  // Apply unions
  const allContacts = new Map<string, ContactForDedup>()
  for (const p of pairs) {
    allContacts.set(p.contactA.id, p.contactA)
    allContacts.set(p.contactB.id, p.contactB)
    union(p.contactA.id, p.contactB.id)
  }

  // Group by root
  const groups = new Map<string, ContactForDedup[]>()
  for (const id of allContacts.keys()) {
    const root = find(id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(allContacts.get(id)!)
  }

  // Convert to array of arrays, sorted by group size desc
  return Array.from(groups.values()).sort((a, b) => b.length - a.length)
}
