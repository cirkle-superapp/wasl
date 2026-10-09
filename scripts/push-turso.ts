// Push the Prisma schema to Turso using the libSQL client directly.
// Usage: bun run scripts/push-turso.ts
import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

if (!url || !token) {
  console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env')
  process.exit(1)
}

const client = createClient({ url, authToken: token })

const tables = [
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "about" TEXT NOT NULL DEFAULT 'Hey there! I am using Wasl.',
    "avatar" TEXT,
    "avatarColor" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "idDocPath" TEXT,
    "verifiedAt" DATETIME,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`,

  `CREATE TABLE IF NOT EXISTS "PhoneNumber" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PhoneNumber_userId_number_key" ON "PhoneNumber"("userId", "number")`,

  `CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "avatar" TEXT,
    "avatarColor" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS "Participant" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Participant_conversationId_userId_key" ON "Participant"("conversationId", "userId")`,

  `CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "status" TEXT NOT NULL DEFAULT 'sent',
    "replyToId" TEXT,
    "commitId" TEXT,
    "senderLabel" TEXT,
    "senderLabelColor" TEXT,
    "senderAvatarPath" TEXT,
    "fromPhone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS "Commit" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "conversationId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'price',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "deadline" TEXT,
    "conditions" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fairnessScore" INTEGER NOT NULL DEFAULT 0,
    "fairnessNote" TEXT NOT NULL DEFAULT '',
    "hash" TEXT NOT NULL,
    "creatorSigned" BOOLEAN NOT NULL DEFAULT true,
    "counterpartySigned" BOOLEAN NOT NULL DEFAULT false,
    "creatorSignedAt" DATETIME,
    "counterpartySignedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE,
    FOREIGN KEY ("counterpartyId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS "Reaction" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Reaction_messageId_userId_key" ON "Reaction"("messageId", "userId")`,

  `CREATE TABLE IF NOT EXISTS "StarredMessage" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StarredMessage_messageId_userId_key" ON "StarredMessage"("messageId", "userId")`,

  `CREATE TABLE IF NOT EXISTS "Poll" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "conversationId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT NOT NULL DEFAULT '[]',
    "multiChoice" BOOLEAN NOT NULL DEFAULT false,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS "PollVote" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PollVote_pollId_userId_optionId_key" ON "PollVote"("pollId", "userId", "optionId")`,

  `CREATE TABLE IF NOT EXISTS "Story" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "content" TEXT NOT NULL,
    "bgColor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS "StoryView" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StoryView_storyId_userId_key" ON "StoryView"("storyId", "userId")`,

  `CREATE TABLE IF NOT EXISTS "ChatFolder" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChatFolder_userId_name_key" ON "ChatFolder"("userId", "name")`,

  `CREATE TABLE IF NOT EXISTS "FolderConversation" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "folderId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("folderId") REFERENCES "ChatFolder"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FolderConversation_folderId_conversationId_key" ON "FolderConversation"("folderId", "conversationId")`,

  `CREATE TABLE IF NOT EXISTS "Business" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "avatarPath" TEXT,
    "avatarColor" TEXT,
    "category" TEXT,
    "registrationDocPath" TEXT,
    "taxDocPath" TEXT,
    "idDocPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "verifiedAt" DATETIME,
    "hiddenPhone" TEXT,
    "hidePhone" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS "BusinessMember" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "invitedBy" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "BusinessMember_businessId_userId_key" ON "BusinessMember"("businessId", "userId")`,

  `CREATE TABLE IF NOT EXISTS "BusinessGroup" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "businessId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "category" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
  )`,

  // ---- Task 89: API Token System + Multi-recipient Multi-message Scheduler ----
  `CREATE TABLE IF NOT EXISTS "ApiToken" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 60,
    "expiresAt" DATETIME,
    "lastUsedAt" DATETIME,
    "lastUsedIp" TEXT,
    "lastUserAgent" TEXT,
    "revokedAt" DATETIME,
    "totalCalls" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "tokenId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "context" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("tokenId") REFERENCES "ApiToken"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ScheduledBatch" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "scheduledFor" DATETIME NOT NULL,
    "repeat" TEXT NOT NULL DEFAULT 'none',
    "repeatUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" TEXT,
    "processedAt" DATETIME,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalFailed" INTEGER NOT NULL DEFAULT 0,
    "createdByTokenId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ScheduledBatchMessage" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "batchId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "delaySeconds" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "attachmentUrl" TEXT,
    FOREIGN KEY ("batchId") REFERENCES "ScheduledBatch"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ScheduledBatchRecipient" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "batchId" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL DEFAULT 'conversation',
    "conversationId" TEXT,
    "scope" TEXT,
    "folderId" TEXT,
    FOREIGN KEY ("batchId") REFERENCES "ScheduledBatch"("id") ON DELETE CASCADE
  )`,

  // ---- Task 90: Vault + Hash-chain ----
  `CREATE TABLE IF NOT EXISTS "VaultEntry" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'note',
    "titleCipher" TEXT NOT NULL,
    "contentCipher" TEXT NOT NULL,
    "categoryCipher" TEXT,
    "tagsCipher" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "accessedAt" DATETIME,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "MessageChainEntry" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chainHash" TEXT NOT NULL,
    "prevChainHash" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  // Add vault salt + verifier columns to User table (ALTER for existing tables)
  `ALTER TABLE "User" ADD COLUMN "vaultSalt" TEXT`,
  `ALTER TABLE "User" ADD COLUMN "vaultVerifier" TEXT`,
]

// Indexes for the new tables (Task 89 + Task 90)
const newTableIndexes = [
  `CREATE INDEX IF NOT EXISTS "idx_apitoken_user" ON "ApiToken"("userId")`,
  `CREATE INDEX IF NOT EXISTS "idx_apitoken_prefix" ON "ApiToken"("prefix")`,
  `CREATE INDEX IF NOT EXISTS "idx_auditlog_token" ON "AuditLog"("tokenId")`,
  `CREATE INDEX IF NOT EXISTS "idx_auditlog_user" ON "AuditLog"("userId")`,
  `CREATE INDEX IF NOT EXISTS "idx_auditlog_created" ON "AuditLog"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "idx_scheduledbatch_user" ON "ScheduledBatch"("userId")`,
  `CREATE INDEX IF NOT EXISTS "idx_scheduledbatch_due" ON "ScheduledBatch"("scheduledFor", "status")`,
  `CREATE INDEX IF NOT EXISTS "idx_scheduledbatchmsg_batch" ON "ScheduledBatchMessage"("batchId")`,
  `CREATE INDEX IF NOT EXISTS "idx_scheduledbatchmsg_order" ON "ScheduledBatchMessage"("order")`,
  `CREATE INDEX IF NOT EXISTS "idx_scheduledbatchrcpt_batch" ON "ScheduledBatchRecipient"("batchId")`,
  `CREATE INDEX IF NOT EXISTS "idx_scheduledbatchrcpt_type" ON "ScheduledBatchRecipient"("recipientType")`,
  // Task 90 indexes
  `CREATE INDEX IF NOT EXISTS "idx_vaultentry_user" ON "VaultEntry"("userId")`,
  `CREATE INDEX IF NOT EXISTS "idx_vaultentry_expires" ON "VaultEntry"("expiresAt")`,
  `CREATE INDEX IF NOT EXISTS "idx_chainentry_user_created" ON "MessageChainEntry"("userId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "idx_chainentry_message" ON "MessageChainEntry"("messageId")`,
]

async function main() {
  console.log('Pushing schema to Turso:', url)
  for (const sql of tables) {
    try {
      await client.execute(sql)
      const name = sql.match(/"(\w+)"/)?.[1] || sql.slice(0, 40)
      console.log('  ✓', name)
    } catch (err: any) {
      console.error('  ✗ Error:', err.message)
    }
  }
  // Task 89 indexes
  console.log('\nPushing Task 89 indexes...')
  for (const sql of newTableIndexes) {
    try {
      await client.execute(sql)
      const name = sql.match(/idx_(\w+)/)?.[1] || sql.slice(0, 50)
      console.log('  ✓', name)
    } catch (err: any) {
      console.error('  ✗ Index error:', err.message)
    }
  }
  console.log('\nSchema push complete.')
  const result = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name`
  )
  console.log('Tables:', result.rows.map((r: any) => r.name).join(', '))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
