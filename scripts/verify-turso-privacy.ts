import { createClient } from '@libsql/client'

async function main() {
  const c = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  })
  const r1 = await c.execute('PRAGMA table_info(User)')
  console.log('User cols:', r1.rows.map((r: any) => r.name).join(', '))
  const r2 = await c.execute('PRAGMA table_info(Message)')
  console.log('Message cols:', r2.rows.map((r: any) => r.name).join(', '))
  const r3 = await c.execute('PRAGMA table_info(Business)')
  console.log('Business cols:', r3.rows.map((r: any) => r.name).join(', '))
  const r4 = await c.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='ScreenshotAttempt'"
  )
  console.log('ScreenshotAttempt table:', r4.rows.length > 0 ? 'EXISTS' : 'MISSING')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
