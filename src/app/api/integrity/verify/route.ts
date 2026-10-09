import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { verifyUserChain } from '@/lib/hash-chain'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// GET /api/integrity/verify — verify the user's message hash-chain
//
// Returns the chain verification result: total entries, verified, tampered,
// per-entry details. The UI uses this to render the chain visualization
// + flag any tampered entries.
// ═══════════════════════════════════════════════════════════════════════
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await verifyUserChain(session.id)
  return NextResponse.json(result)
}
