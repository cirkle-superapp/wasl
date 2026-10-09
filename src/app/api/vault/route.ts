import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import {
  generateSalt,
  deriveKey,
  buildVerifier,
  verifyMasterPassword,
  encryptString,
} from '@/lib/vault'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// GET /api/vault — return vault status (setup? locked/unlocked metadata)
//
// Returns:
//   - { isSetup: false } if the vault hasn't been initialized yet
//   - { isSetup: true } if the vault has a salt+verifier (entries are still
//     encrypted at rest and require the master password to unlock)
//
// NOTE: We do NOT return decrypted entries from this endpoint — decryption
// is purely client-side. The client fetches the encrypted blobs and
// decrypts them with the derived key (which never leaves the browser).
// ═══════════════════════════════════════════════════════════════════════
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.id },
    select: { vaultSalt: true, vaultVerifier: true },
  })

  const isSetup = !!(user?.vaultSalt && user?.vaultVerifier)

  if (!isSetup) {
    return NextResponse.json({ isSetup: false, entryCount: 0 })
  }

  // Return the salt + verifier + count of entries (encrypted blobs fetched separately)
  const entryCount = await db.vaultEntry.count({
    where: { userId: session.id, expiresAt: null },
  })
  const expiredCount = await db.vaultEntry.count({
    where: { userId: session.id, expiresAt: { not: null, lt: new Date() } },
  })

  return NextResponse.json({
    isSetup: true,
    salt: user!.vaultSalt,
    verifier: user!.vaultVerifier,
    entryCount,
    expiredCount,
  })
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/vault — set up the vault OR add a new entry
//
// Body when setting up (action: 'setup'):
//   { action: 'setup', masterPassword: string }
// The server generates a salt, derives a key SERVER-SIDE (just for the
// verifier), and stores the salt + verifier. The derived key is NOT
// stored — only the encrypted verifier (which the client can later use
// to confirm its own password is correct).
//
// Body when adding an entry (action: 'add'):
//   {
//     action: 'add',
//     titleCipher: string,     // client-encrypted with the derived key
//     contentCipher: string,   // client-encrypted with the derived key
//     type?: string,
//     categoryCipher?: string,
//     tagsCipher?: string,
//     expiresAt?: ISO string,
//   }
// ═══════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  if (body.action === 'setup') {
    return setupVault(session.id, String(body.masterPassword || ''))
  }

  if (body.action === 'add' || !body.action) {
    return addEntry(session.id, body)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

async function setupVault(userId: string, masterPassword: string) {
  if (masterPassword.length < 8) {
    return NextResponse.json({ error: 'Master password must be at least 8 characters' }, { status: 400 })
  }

  // Check if vault is already set up
  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { vaultSalt: true, vaultVerifier: true },
  })
  if (existing?.vaultSalt && existing?.vaultVerifier) {
    return NextResponse.json({ error: 'Vault is already set up' }, { status: 400 })
  }

  // Generate salt + derive key + build verifier
  const salt = generateSalt()
  const key = await deriveKey(masterPassword, salt)
  if (!key) {
    return NextResponse.json({ error: 'Web Crypto API not available' }, { status: 500 })
  }
  const verifier = await buildVerifier(key)

  await db.user.update({
    where: { id: userId },
    data: { vaultSalt: salt, vaultVerifier: verifier },
  })

  return NextResponse.json({ ok: true, isSetup: true })
}

async function addEntry(userId: string, body: any) {
  const { titleCipher, contentCipher, type, categoryCipher, tagsCipher, expiresAt } = body || {}

  if (typeof titleCipher !== 'string' || typeof contentCipher !== 'string') {
    return NextResponse.json({ error: 'titleCipher + contentCipher required' }, { status: 400 })
  }

  // Verify vault is set up
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { vaultSalt: true, vaultVerifier: true },
  })
  if (!user?.vaultSalt || !user?.vaultVerifier) {
    return NextResponse.json({ error: 'Vault not set up' }, { status: 400 })
  }

  let expDate: Date | null = null
  if (expiresAt) {
    const d = new Date(expiresAt)
    if (!isNaN(d.getTime()) && d.getTime() > Date.now()) {
      expDate = d
    } else {
      return NextResponse.json({ error: 'Invalid expiresAt (must be in the future)' }, { status: 400 })
    }
  }

  const validTypes = ['password', 'note', 'id-document', 'recovery-code', 'card', 'custom']
  const typeValue = validTypes.includes(type) ? type : 'note'

  const entry = await db.vaultEntry.create({
    data: {
      userId,
      type: typeValue,
      titleCipher,
      contentCipher,
      categoryCipher: typeof categoryCipher === 'string' ? categoryCipher : null,
      tagsCipher: typeof tagsCipher === 'string' ? tagsCipher : null,
      expiresAt: expDate,
    },
    select: {
      id: true,
      type: true,
      expiresAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    id: entry.id,
    type: entry.type,
    expiresAt: entry.expiresAt,
    createdAt: entry.createdAt,
  })
}
