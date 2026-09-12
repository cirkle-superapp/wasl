import { createClient } from '@libsql/client'

async function main() {
  const c = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  })
  const users = await c.execute(
    "SELECT id, name, username FROM User WHERE username IN ('demo', 'demo_amira_hassan')"
  )
  console.log(
    'Users:',
    users.rows.map((r: any) => ({ id: r.id, name: r.name, username: r.username }))
  )
  const demoUser: any = users.rows.find((r: any) => r.username === 'demo')
  const amira: any = users.rows.find((r: any) => r.username === 'demo_amira_hassan')
  if (!demoUser || !amira) {
    console.log('Missing user')
    process.exit(1)
  }
  const convs = await c.execute(
    'SELECT c.id as cid FROM Conversation c JOIN Participant p1 ON p1.conversationId = c.id JOIN Participant p2 ON p2.conversationId = c.id WHERE c.isGroup = 0 AND p1.userId = ? AND p2.userId = ?',
    [demoUser.id, amira.id]
  )
  console.log('Conversations:', convs.rows.length)
  if (convs.rows.length === 0) process.exit(1)
  const convId = (convs.rows[0] as any).cid
  const id = 'test_prot_' + Date.now()
  await c.execute(
    'INSERT INTO Message (id, conversationId, senderId, content, type, status, "protected", createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      convId,
      amira.id,
      '🔒 This is a TEST protected message from Amira. You should NOT be able to copy, forward, or screenshot this.',
      'text',
      'read',
      1,
      new Date().toISOString(),
    ]
  )
  console.log('Inserted protected message id:', id, 'in conversation', convId)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
