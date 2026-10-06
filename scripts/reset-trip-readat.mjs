import { db } from '../src/lib/db.ts'
const tripId = process.argv[2]
const userId = process.argv[3]
const r = await db.participant.updateMany({
  where: { conversationId: tripId, userId },
  data: { lastReadAt: new Date(Date.now() - 3 * 24 * 60 * 60_000) },
})
console.log('Updated:', r.count)
