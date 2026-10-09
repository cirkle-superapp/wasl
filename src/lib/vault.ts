// ═══════════════════════════════════════════════════════════════════════
// Wasl Vault — Zero-knowledge encryption library (Task 90)
// ═══════════════════════════════════════════════════════════════════════
//
// Built entirely on the Web Crypto API (browser) and node:crypto (server).
// NO external crypto libraries. NO external key management service. The
// server NEVER sees the plaintext or the derived key.
//
// Key derivation:
//   PBKDF2-SHA-256, 310,000 iterations (OWASP 2023 recommendation for
//   PBKDF2-SHA256). Output: 256-bit AES-GCM key.
//
// Encryption:
//   AES-256-GCM with a random 12-byte IV per encryption. The IV is
//   prepended to the ciphertext in base64. The GCM auth tag (16 bytes)
//   is appended by Web Crypto as the last 16 bytes of the ciphertext.
//
// Verification:
//   On vault setup, we encrypt a known plaintext ("WASL_VAULT_VERIFIER_v1")
//   with the derived key + a fresh IV, and store the result as the
//   "verifier". On unlock, we try to decrypt the verifier — if it
//   succeeds AND the decrypted plaintext matches the known string, the
//   password is correct.
//
// Self-destruct:
//   Entries with `expiresAt` in the past are deleted by a scheduled job.
//   Once deleted, the ciphertext is gone — there is no key to recover
//   because the master password (which only the user knows) is required
//   to derive the key. So the entry is cryptographically erased.

const subtle = (globalThis.crypto?.subtle) as SubtleCrypto | undefined

export const VERIFIER_PLAINTEXT = 'WASL_VAULT_VERIFIER_v1'
export const PBKDF2_ITERATIONS = 310_000
export const KEY_LENGTH_BITS = 256
export const IV_LENGTH_BYTES = 12

// ---- Salt utilities --------------------------------------------------------

/** Generate a random 16-byte salt as base64. */
export function generateSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToBase64(bytes)
}

// ---- Key derivation (PBKDF2) -----------------------------------------------

/**
 * Derive an AES-GCM key from a master password + salt.
 * Returns a CryptoKey that can be used with encrypt/decrypt.
 * Falls back to a null return on environments without Web Crypto.
 */
export async function deriveKey(password: string, saltB64: string): Promise<CryptoKey | null> {
  if (!subtle) return null
  const enc = new TextEncoder()
  const passwordBytes = enc.encode(password)
  const salt = base64ToBytes(saltB64)

  // Cast to BufferSource — TS5+ has stricter typing for ArrayBuffer vs
  // ArrayBufferLike, but the runtime accepts Uint8Array everywhere.
  const baseKey = await subtle.importKey(
    'raw',
    passwordBytes as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false, // non-extractable — the key never leaves Web Crypto
    ['encrypt', 'decrypt'],
  )
}

// ---- Encrypt / Decrypt ------------------------------------------------------

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns "ivBase64.ciphertextBase64".
 */
export async function encryptString(key: CryptoKey, plaintext: string): Promise<string> {
  if (!subtle) throw new Error('Web Crypto API not available')
  const iv = new Uint8Array(IV_LENGTH_BYTES)
  crypto.getRandomValues(iv)
  const enc = new TextEncoder()
  const ciphertextBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    enc.encode(plaintext) as BufferSource,
  )
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertextBuf))}`
}

/** Decrypt a "ivBase64.ciphertextBase64" string. Throws if auth fails. */
export async function decryptString(key: CryptoKey, packed: string): Promise<string> {
  if (!subtle) throw new Error('Web Crypto API not available')
  const [ivB64, ctB64] = packed.split('.')
  if (!ivB64 || !ctB64) throw new Error('Malformed ciphertext')
  const iv = base64ToBytes(ivB64)
  const ciphertext = base64ToBytes(ctB64)
  try {
    const plaintextBuf = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    )
    return new TextDecoder().decode(plaintextBuf)
  } catch {
    throw new Error('Decryption failed (wrong key or tampered)')
  }
}

// ---- Verifier (master password check) --------------------------------------

/**
 * Build the verifier ciphertext for a new vault setup.
 * The verifier encrypts a known plaintext so we can check the password
 * later without storing the password itself.
 */
export async function buildVerifier(key: CryptoKey): Promise<string> {
  return encryptString(key, VERIFIER_PLAINTEXT)
}

/**
 * Verify a master password against the stored verifier.
 * Returns true if the password is correct (i.e. it decrypts the verifier
 * to the known plaintext).
 */
export async function verifyMasterPassword(key: CryptoKey, verifierCipher: string): Promise<boolean> {
  try {
    const decrypted = await decryptString(key, verifierCipher)
    return decrypted === VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}

// ---- Base64 helpers (browser-safe) -----------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  // Allocate an explicit ArrayBuffer (not ArrayBufferLike) so the result
  // satisfies TypeScript's strict BufferSource type required by Web Crypto.
  // Without this, TS5+ complains: "Type 'Uint8Array<ArrayBufferLike>' is
  // not assignable to type 'BufferSource'" because ArrayBufferLike can be
  // either ArrayBuffer OR SharedArrayBuffer, and only ArrayBuffer satisfies
  // the BufferSource contract.
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ---- Strength estimation (for UX only — show "weak/medium/strong") --------

/** Estimate password strength 0-100. Purely heuristic. */
export function passwordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: 'Empty', color: 'muted' }
  let score = 0
  if (password.length >= 8) score += 25
  if (password.length >= 12) score += 15
  if (password.length >= 16) score += 10
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 15
  if (/\d/.test(password)) score += 15
  if (/[^a-zA-Z0-9]/.test(password)) score += 20
  // Penalize common patterns
  if (/^(password|12345|qwerty|admin)/i.test(password)) score = Math.min(score, 15)
  if (/(.)\1{2,}/.test(password)) score -= 10 // repeated chars
  score = Math.max(0, Math.min(100, score))
  let label = 'Weak', color = 'rose'
  if (score >= 75) { label = 'Strong'; color = 'green' }
  else if (score >= 50) { label = 'Medium'; color = 'amber' }
  else if (score >= 25) { label = 'Weak'; color = 'rose' }
  else { label = 'Very weak'; color = 'rose' }
  return { score, label, color }
}
