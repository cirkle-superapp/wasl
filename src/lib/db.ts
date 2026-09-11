import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const useTurso = process.env.USE_TURSO === 'true'
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  if (useTurso && tursoUrl && tursoToken && tursoUrl.startsWith('libsql://')) {
    try {
      // Pass config directly to PrismaLibSQL (not a separate libsql client).
      // This is the correct API per @prisma/adapter-libsql docs.
      const adapter = new PrismaLibSQL({
        url: tursoUrl,
        authToken: tursoToken,
      })
      console.log('[db] Using Turso (libSQL):', tursoUrl)
      return new PrismaClient({ adapter }) as unknown as PrismaClient
    } catch (err) {
      console.error('[db] Turso init failed, falling back to SQLite:', err)
    }
  }

  // Local SQLite — keep the default PrismaClient behavior (no adapter needed)
  console.log('[db] Using local SQLite')
  return new PrismaClient({
    log: process.env.NODE_ENV !== 'production' ? ['error', 'warn'] : ['error'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
