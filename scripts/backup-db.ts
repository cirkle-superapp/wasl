// DB backup script — copies the local SQLite file to a timestamped backup.
// For Turso, the data is already in the cloud (no backup needed locally).
// Usage: bun run scripts/backup-db.ts
import { copyFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const DB_PATH = join(process.cwd(), 'db', 'custom.db')
const BACKUP_DIR = join(process.cwd(), 'db', 'backups')

async function main() {
  if (!existsSync(DB_PATH)) {
    console.log('[backup] No local DB to backup (using Turso)')
    process.exit(0)
  }
  await mkdir(BACKUP_DIR, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(BACKUP_DIR, `custom-${timestamp}.db`)
  await copyFile(DB_PATH, backupPath)
  console.log(`[backup] Backed up to ${backupPath}`)
}

main().catch(console.error)
