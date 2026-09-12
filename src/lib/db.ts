import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let _db: PrismaClient | null = null

function createPrismaClient(): PrismaClient {
  const useTurso = process.env.USE_TURSO === 'true'
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  if (useTurso && tursoUrl && tursoToken && tursoUrl.startsWith('libsql://')) {
    try {
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

  console.log('[db] Using local SQLite')
  return new PrismaClient({
    log: process.env.NODE_ENV !== 'production' ? ['error', 'warn'] : ['error'],
  })
}

// LAZY initialization: only create the Prisma client on first property access.
// This ensures process.env is fully loaded by Next.js before we read it.
function getDb(): PrismaClient {
  if (_db) return _db
  _db = createPrismaClient()
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = _db
  }
  return _db
}

// Export a Proxy that lazily initializes on first access
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getDb()
    const value = (client as any)[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
