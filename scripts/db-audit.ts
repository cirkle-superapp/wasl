// Full DB audit: integrity check + row counts for every table + comparison with latest backup.
// Usage: bun run scripts/db-audit.ts
import { createClient } from '@libsql/client'
import { join } from 'path'

const DB_PATH = join(process.cwd(), 'db', 'custom.db')
const BACKUP_PATH = join(process.cwd(), 'db', 'backups', 'custom-2026-09-28T20-13-49-285Z.db')

function client(path: string) {
  return createClient({ url: `file:${path}` })
}

async function audit(path: string, label: string) {
  const c = client(path)
  const integrity = await c.execute('PRAGMA integrity_check;')
  console.log(`\n=== ${label} ===`)
  console.log(`Integrity: ${integrity.rows.map((r) => Object.values(r)[0]).join(', ')}`)

  const tables = await c.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name;"
  )
  const counts: Record<string, number> = {}
  for (const t of tables.rows) {
    const name = String(Object.values(t)[0])
    try {
      const r = await c.execute(`SELECT COUNT(*) as c FROM "${name}";`)
      counts[name] = Number(r.rows[0]['c'])
    } catch {
      counts[name] = -1
    }
  }
  console.log(`Tables: ${Object.keys(counts).length}`)
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`)
  await c.close()
  return counts
}

async function main() {
  const current = await audit(DB_PATH, 'CURRENT db/custom.db')
  const backup = await audit(BACKUP_PATH, 'BACKUP 2026-09-28 (latest)')
  console.log('\n=== DATA-LOSS DIFF (current vs backup) ===')
  let loss = false
  const all = new Set([...Object.keys(current), ...Object.keys(backup)])
  for (const t of [...all].sort()) {
    const c = current[t] ?? 0
    const b = backup[t] ?? 0
    if (c < b) {
      console.log(`  ⚠️  ${t}: LOST ${b - c} rows (backup=${b}, current=${c})`)
      loss = true
    } else if (c > b) {
      console.log(`  ✓ ${t}: +${c - b} new rows (backup=${b}, current=${c})`)
    }
  }
  console.log(loss ? '\n❌ DATA LOSS DETECTED' : '\n✅ NO DATA LOSS — current has ≥ backup rows in every table')
}

main().catch((e) => {
  console.error('AUDIT FAILED:', e)
  process.exit(1)
})
