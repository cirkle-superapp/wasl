// Add the new privacy / message-protection columns and the ScreenshotAttempt
// table to an existing Turso database. Idempotent — uses IF NOT EXISTS and
// catches "duplicate column" errors so it's safe to run multiple times.
//
// Usage: bunx tsx scripts/migrate-turso-privacy.ts
import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

if (!url || !token) {
  console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env')
  process.exit(1)
}

const client = createClient({ url, authToken: token })

const statements = [
  // User privacy fields
  `ALTER TABLE "User" ADD COLUMN "defaultProtectMessages" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "User" ADD COLUMN "privacyAlwaysAllow" BOOLEAN NOT NULL DEFAULT false`,

  // Message protection override (nullable — null = use sender's default)
  `ALTER TABLE "Message" ADD COLUMN "protected" BOOLEAN`,

  // Business privacy field
  `ALTER TABLE "Business" ADD COLUMN "defaultProtectMessages" BOOLEAN NOT NULL DEFAULT false`,

  // New ScreenshotAttempt table
  `CREATE TABLE IF NOT EXISTS "ScreenshotAttempt" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "messageId" TEXT NOT NULL,
    "reporterId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'printscreen',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE,
    FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "ScreenshotAttempt_messageId_createdAt_idx" ON "ScreenshotAttempt"("messageId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ScreenshotAttempt_reporterId_idx" ON "ScreenshotAttempt"("reporterId")`,
]

async function main() {
  console.log('Migrating Turso schema for privacy/protection feature:', url)
  for (const sql of statements) {
    try {
      await client.execute(sql)
      const summary = sql.slice(0, 80).replace(/\s+/g, ' ')
      console.log('  ✓', summary)
    } catch (err: any) {
      // Ignore "duplicate column" errors (column already exists).
      if (/duplicate column|already exists/i.test(err.message || '')) {
        const summary = sql.slice(0, 80).replace(/\s+/g, ' ')
        console.log('  · already present:', summary)
      } else {
        console.error('  ✗ Error:', err.message, '— SQL:', sql.slice(0, 120))
      }
    }
  }
  console.log('\nMigration complete.')
  const result = await client.execute(
    `SELECT name FROM pragma_table_info("User") ORDER BY cid`
  )
  console.log('User columns:', result.rows.map((r: any) => r.name).join(', '))
  const result2 = await client.execute(
    `SELECT name FROM pragma_table_info("Message") ORDER BY cid`
  )
  console.log('Message columns:', result2.rows.map((r: any) => r.name).join(', '))
  const result3 = await client.execute(
    `SELECT name FROM pragma_table_info("Business") ORDER BY cid`
  )
  console.log('Business columns:', result3.rows.map((r: any) => r.name).join(', '))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
