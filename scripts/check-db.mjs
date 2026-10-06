import { db } from '../src/lib/db.ts'
const userCount = await db.user.count()
console.log('Users in DB:', userCount)
try {
  const tokenCount = await db.apiToken.count()
  console.log('ApiToken count:', tokenCount)
} catch (e) {
  console.log('ApiToken table not accessible:', e.message.slice(0, 100))
}
try {
  const batchCount = await db.scheduledBatch.count()
  console.log('ScheduledBatch count:', batchCount)
} catch (e) {
  console.log('ScheduledBatch table not accessible:', e.message.slice(0, 100))
}
process.exit(0)
