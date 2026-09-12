// Turso token rotation reminder — checks token age and warns if > 90 days.
// Run periodically: bun run scripts/check-turso-token.ts
import { createClient } from '@libsql/client'

const TURSO_URL = process.env.TURSO_DATABASE_URL || ''
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || ''

async function main() {
  if (!TURSO_URL || !TURSO_TOKEN) {
    console.log('[turso-check] No Turso credentials found')
    process.exit(0)
  }

  // Try to decode the JWT to check the issued-at time
  try {
    const parts = TURSO_TOKEN.split('.')
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
      const issuedAt = payload.iat ? new Date(payload.iat * 1000) : null
      const gid = payload.gid || 'unknown'
      
      if (issuedAt) {
        const ageDays = Math.floor((Date.now() - issuedAt.getTime()) / (1000 * 60 * 60 * 24))
        console.log(`[turso-check] Token issued: ${issuedAt.toISOString()}`)
        console.log(`[turso-check] Token age: ${ageDays} days`)
        console.log(`[turso-check] Group ID: ${gid}`)
        
        if (ageDays > 90) {
          console.warn(`[turso-check] ⚠️  Token is ${ageDays} days old — ROTATE NOW (recommended: every 90 days)`)
        } else if (ageDays > 60) {
          console.log(`[turso-check] ⚡ Token will expire soon — plan rotation within ${90 - ageDays} days`)
        } else {
          console.log(`[turso-check] ✅ Token is fresh (${90 - ageDays} days until recommended rotation)`)
        }
      }
    }
  } catch (e) {
    console.log('[turso-check] Could not parse token (may not be a JWT)')
  }

  // Verify the token works by connecting
  try {
    const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })
    await client.execute('SELECT 1 as val')
    console.log('[turso-check] ✅ Token is valid — database connection successful')
    process.exit(0)
  } catch (e: any) {
    console.error(`[turso-check] ❌ Token is INVALID: ${e.message}`)
    console.error('[turso-check] → Rotate immediately at https://turso.tech/app')
    process.exit(1)
  }
}

main()
