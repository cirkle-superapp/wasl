import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // Use Turso (libSQL) when USE_TURSO is set; otherwise fall back to local SQLite.
  const useTurso = process.env.USE_TURSO === 'true'
  if (useTurso && process.env.TURSO_DATABASE_URL) {
    const libsql = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    const adapter = new PrismaLibSql(libsql)
    return new PrismaClient({ adapter }) as unknown as PrismaClient
  }
  // Local SQLite — keep the default PrismaClient behavior (no adapter needed)
  return new PrismaClient({
    log: process.env.NODE_ENV !== 'production' ? ['error', 'warn'] : ['error'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
