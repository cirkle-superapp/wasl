import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 60 // Vercel hobby tier max

// POST /api/admin/sync-schema
// Pushes the full Prisma schema to whichever database the app is currently
// connected to (local SQLite in dev, Turso in Vercel production). Idempotent:
// uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS so it's
// safe to run on a database that already has some tables.
//
// Auth: requires a logged-in user. (In production we'd gate this further
// behind an admin role, but for the demo + dev-trial workflow any logged-in
// user can trigger a schema sync — which only adds missing tables, never
// drops or alters existing ones.)
//
// This route is the workaround for the "no such table: Bookmark" error that
// appears on Vercel production because the Turso database was set up before
// all 40 models were added to prisma/schema.prisma. Running this endpoint
// once on Vercel adds all the missing tables.

// Every CREATE statement as a separate string. We run them one-by-one so a
// single failure doesn't block the rest. Each is IF NOT EXISTS so it's safe.
const SCHEMA_STATEMENTS: string[] = [
  // ── User ──────────────────────────────────────────────────────────────
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
    "updatedAt" DATETIME NOT NULL,
    "defaultProtectMessages" BOOLEAN NOT NULL DEFAULT false,
    "privacyAlwaysAllow" BOOLEAN NOT NULL DEFAULT false,
    "ghostMode" BOOLEAN NOT NULL DEFAULT false,
    "hideLastSeen" BOOLEAN NOT NULL DEFAULT false
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`,

  // ── Contact ───────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "Contact" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL,
    "contactUserId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "avatar" TEXT,
    "avatarColor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
    FOREIGN KEY ("contactUserId") REFERENCES "User"("id") ON DELETE SET NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Contact_userId_phone_key" ON "Contact"("userId", "phone")`,

  // ── PhoneNumber ────────────────────────────────────────────────────────
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

  // ── Conversation ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "avatar" TEXT,
    "avatarColor" TEXT,
    "description" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "inviteToken" TEXT,
    "inviteTokenSetAt" DATETIME,
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL
  )`,

  // ── Participant ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "Participant" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'member',
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Participant_conversationId_userId_key" ON "Participant"("conversationId", "userId")`,

  // ── Message ───────────────────────────────────────────────────────────
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
    "protected" BOOLEAN,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "transcription" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt")`,

  // ── DeletedForMe ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "DeletedForMe" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DeletedForMe_messageId_userId_key" ON "DeletedForMe"("messageId", "userId")`,

  // ── MessageEdit ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "MessageEdit" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "messageId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "editedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "MessageEdit_messageId_editedAt_idx" ON "MessageEdit"("messageId", "editedAt")`,

  // ── Commit ────────────────────────────────────────────────────────────
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
  `CREATE INDEX IF NOT EXISTS "Commit_conversationId_createdAt_idx" ON "Commit"("conversationId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "Commit_counterpartyId_idx" ON "Commit"("counterpartyId")`,

  // ── Reaction ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "Reaction" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Reaction_messageId_userId_key" ON "Reaction"("messageId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "Reaction_messageId_idx" ON "Reaction"("messageId")`,

  // ── StarredMessage ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "StarredMessage" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StarredMessage_messageId_userId_key" ON "StarredMessage"("messageId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "StarredMessage_userId_idx" ON "StarredMessage"("userId")`,

  // ── Bookmark ───────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "Bookmark" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "note" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Bookmark_userId_messageId_key" ON "Bookmark"("userId", "messageId")`,
  `CREATE INDEX IF NOT EXISTS "Bookmark_userId_idx" ON "Bookmark"("userId")`,

  // ── Draft ─────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "Draft" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "replyToId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Draft_userId_conversationId_key" ON "Draft"("userId", "conversationId")`,

  // ── ForwardRequest ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "ForwardRequest" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toConversationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE,
    FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE,
    FOREIGN KEY ("toConversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE
  )`,

  // ── Poll ──────────────────────────────────────────────────────────────
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
  `CREATE INDEX IF NOT EXISTS "Poll_conversationId_createdAt_idx" ON "Poll"("conversationId", "createdAt")`,

  // ── PollVote ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "PollVote" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PollVote_pollId_userId_optionId_key" ON "PollVote"("pollId", "userId", "optionId")`,

  // ── Story ─────────────────────────────────────────────────────────────
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
  `CREATE INDEX IF NOT EXISTS "Story_userId_createdAt_idx" ON "Story"("userId", "createdAt")`,

  // ── StoryView ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "StoryView" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StoryView_storyId_userId_key" ON "StoryView"("storyId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "StoryView_storyId_idx" ON "StoryView"("storyId")`,

  // ── ChatFolder ─────────────────────────────────────────────────────────
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

  // ── FolderConversation ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "FolderConversation" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "folderId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("folderId") REFERENCES "ChatFolder"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FolderConversation_folderId_conversationId_key" ON "FolderConversation"("folderId", "conversationId")`,
  `CREATE INDEX IF NOT EXISTS "FolderConversation_folderId_idx" ON "FolderConversation"("folderId")`,

  // ── Business ───────────────────────────────────────────────────────────
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
    "defaultProtectMessages" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,

  // ── BusinessMember ─────────────────────────────────────────────────────
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
  `CREATE INDEX IF NOT EXISTS "BusinessMember_businessId_idx" ON "BusinessMember"("businessId")`,

  // ── BusinessGroup ──────────────────────────────────────────────────────
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
  `CREATE INDEX IF NOT EXISTS "BusinessGroup_businessId_idx" ON "BusinessGroup"("businessId")`,
  `CREATE INDEX IF NOT EXISTS "BusinessGroup_visibility_idx" ON "BusinessGroup"("visibility")`,

  // ── ServiceProvider ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "ServiceProvider" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'government',
    "description" TEXT NOT NULL DEFAULT '',
    "avatarPath" TEXT,
    "avatarColor" TEXT,
    "officialName" TEXT,
    "registrationNumber" TEXT,
    "taxNumber" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT '+20',
    "registrationDocPath" TEXT,
    "idDocPath" TEXT,
    "livenessVideoPath" TEXT,
    "livenessVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" DATETIME,
    "verifiedBy" TEXT,
    "canBroadcast" BOOLEAN NOT NULL DEFAULT false,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,

  // ── ServiceProviderMessage ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "ServiceProviderMessage" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "providerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'announcement',
    "imagePath" TEXT,
    "countryCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "ServiceProviderMessage_providerId_createdAt_idx" ON "ServiceProviderMessage"("providerId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ServiceProviderMessage_countryCode_idx" ON "ServiceProviderMessage"("countryCode")`,

  // ── ServiceProviderMessageRead ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "ServiceProviderMessageRead" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("messageId") REFERENCES "ServiceProviderMessage"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ServiceProviderMessageRead_messageId_userId_key" ON "ServiceProviderMessageRead"("messageId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "ServiceProviderMessageRead_userId_idx" ON "ServiceProviderMessageRead"("userId")`,

  // ── ServiceProviderMessageDismissed ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "ServiceProviderMessageDismissed" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("messageId") REFERENCES "ServiceProviderMessage"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ServiceProviderMessageDismissed_messageId_userId_key" ON "ServiceProviderMessageDismissed"("messageId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "ServiceProviderMessageDismissed_userId_idx" ON "ServiceProviderMessageDismissed"("userId")`,

  // ── ScheduledMessage ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "ScheduledMessage" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "scheduledFor" DATETIME NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" DATETIME,
    "repeat" TEXT NOT NULL DEFAULT 'none',
    "repeatUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "ScheduledMessage_scheduledFor_idx" ON "ScheduledMessage"("scheduledFor")`,
  `CREATE INDEX IF NOT EXISTS "ScheduledMessage_conversationId_idx" ON "ScheduledMessage"("conversationId")`,
  `CREATE INDEX IF NOT EXISTS "ScheduledMessage_senderId_idx" ON "ScheduledMessage"("senderId")`,

  // ── BroadcastChannel ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BroadcastChannel" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT NOT NULL,
    "avatarColor" TEXT,
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "BroadcastChannel_ownerId_idx" ON "BroadcastChannel"("ownerId")`,

  // ── BroadcastSubscriber ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BroadcastSubscriber" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscribedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("channelId") REFERENCES "BroadcastChannel"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "BroadcastSubscriber_channelId_userId_key" ON "BroadcastSubscriber"("channelId", "userId")`,

  // ── BroadcastMessage ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BroadcastMessage" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "channelId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("channelId") REFERENCES "BroadcastChannel"("id") ON DELETE CASCADE,
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "BroadcastMessage_channelId_createdAt_idx" ON "BroadcastMessage"("channelId", "createdAt")`,

  // ── TimeCapsule ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "TimeCapsule" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "unlockAt" DATETIME NOT NULL,
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "TimeCapsule_unlockAt_idx" ON "TimeCapsule"("unlockAt")`,
  `CREATE INDEX IF NOT EXISTS "TimeCapsule_conversationId_idx" ON "TimeCapsule"("conversationId")`,

  // ── AppLock ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "AppLock" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,

  // ── Thread ─────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "Thread" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "conversationId" TEXT NOT NULL,
    "parentMessageId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    FOREIGN KEY ("parentMessageId") REFERENCES "Message"("id") ON DELETE CASCADE,
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE
  )`,

  // ── ThreadMessage ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "ThreadMessage" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE,
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,

  // ── WhisperMessage ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "WhisperMessage" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,

  // ── ReceiptSplit ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "ReceiptSplit" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "conversationId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "splitCount" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "ReceiptSplit_conversationId_idx" ON "ReceiptSplit"("conversationId")`,

  // ── ReceiptSplitParticipant ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "ReceiptSplitParticipant" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "splitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("splitId") REFERENCES "ReceiptSplit"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ReceiptSplitParticipant_splitId_userId_key" ON "ReceiptSplitParticipant"("splitId", "userId")`,

  // ── DisappearingSetting ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "DisappearingSetting" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "conversationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "duration" INTEGER NOT NULL DEFAULT 86400,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DisappearingSetting_conversationId_key" ON "DisappearingSetting"("conversationId")`,

  // ── ScreenshotAttempt ──────────────────────────────────────────────────
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

  // ── School (Task 66 — School Connect) ─────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "School" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "logoPath" TEXT,
    "logoColor" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "verifiedAt" DATETIME,
    "verifiedBy" TEXT,
    "type" TEXT NOT NULL DEFAULT 'international',
    "studentCount" INTEGER NOT NULL DEFAULT 0,
    "staffCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "School_code_key" ON "School"("code")`,
  `CREATE INDEX IF NOT EXISTS "School_status_idx" ON "School"("status")`,
  `CREATE INDEX IF NOT EXISTS "School_ownerId_idx" ON "School"("ownerId")`,

  // ── SchoolStudent ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "SchoolStudent" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "grade" TEXT,
    "className" TEXT,
    "enrollmentYear" INTEGER,
    "joinCode" TEXT NOT NULL,
    "joinCodeGeneratedAt" DATETIME,
    "joinCodeExpiresAt" DATETIME,
    "joinCodeRevoked" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SchoolStudent_joinCode_key" ON "SchoolStudent"("joinCode")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SchoolStudent_schoolId_studentId_key" ON "SchoolStudent"("schoolId", "studentId")`,
  `CREATE INDEX IF NOT EXISTS "SchoolStudent_joinCode_idx" ON "SchoolStudent"("joinCode")`,
  `CREATE INDEX IF NOT EXISTS "SchoolStudent_schoolId_idx" ON "SchoolStudent"("schoolId")`,
  `CREATE INDEX IF NOT EXISTS "SchoolStudent_userId_idx" ON "SchoolStudent"("userId")`,

  // ── SchoolParentConnection ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "SchoolParentConnection" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "schoolStudentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'parent',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invitedBy" TEXT,
    "confirmedAt" DATETIME,
    "revokedAt" DATETIME,
    "joinedViaCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("schoolStudentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE,
    FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SchoolParentConnection_schoolStudentId_parentId_key" ON "SchoolParentConnection"("schoolStudentId", "parentId")`,
  `CREATE INDEX IF NOT EXISTS "SchoolParentConnection_parentId_idx" ON "SchoolParentConnection"("parentId")`,
  `CREATE INDEX IF NOT EXISTS "SchoolParentConnection_schoolStudentId_idx" ON "SchoolParentConnection"("schoolStudentId")`,

  // ── SchoolMembership ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "SchoolMembership" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "studentId" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SchoolMembership_schoolId_userId_key" ON "SchoolMembership"("schoolId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "SchoolMembership_schoolId_idx" ON "SchoolMembership"("schoolId")`,
  `CREATE INDEX IF NOT EXISTS "SchoolMembership_userId_idx" ON "SchoolMembership"("userId")`,

  // ── Block (Task 67 — user-to-user blocking) ──────────────────────────
  `CREATE TABLE IF NOT EXISTS "Block" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE,
    FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Block_blockerId_blockedId_key" ON "Block"("blockerId", "blockedId")`,
  `CREATE INDEX IF NOT EXISTS "Block_blockerId_idx" ON "Block"("blockerId")`,
  `CREATE INDEX IF NOT EXISTS "Block_blockedId_idx" ON "Block"("blockedId")`,
]

// Columns that may need ALTER TABLE ADD COLUMN on older Turso databases.
// Each entry is [table, column, type+default]. We try each one and ignore
// the "duplicate column" error so it's idempotent.
const ALTER_COLUMNS: Array<[string, string, string]> = [
  // User privacy fields (added in Task 23)
  ['User', 'defaultProtectMessages', 'BOOLEAN NOT NULL DEFAULT false'],
  ['User', 'privacyAlwaysAllow', 'BOOLEAN NOT NULL DEFAULT false'],
  ['User', 'ghostMode', 'BOOLEAN NOT NULL DEFAULT false'],
  ['User', 'hideLastSeen', 'BOOLEAN NOT NULL DEFAULT false'],
  ['User', 'idDocPath', 'TEXT'],
  ['User', 'verifiedAt', 'DATETIME'],
  ['User', 'avatarColor', 'TEXT'],
  ['User', 'avatar', 'TEXT'],
  ['User', 'about', "TEXT NOT NULL DEFAULT 'Hey there! I am using Wasl.'"],
  ['User', 'online', 'BOOLEAN NOT NULL DEFAULT false'],
  ['User', 'verified', 'BOOLEAN NOT NULL DEFAULT false'],
  ['User', 'phone', 'TEXT'],
  ['User', 'email', 'TEXT'],

  // Message — many optional columns added over time
  ['Message', 'protected', 'BOOLEAN'],
  ['Message', 'edited', 'BOOLEAN NOT NULL DEFAULT false'],
  ['Message', 'pinned', 'BOOLEAN NOT NULL DEFAULT false'],
  ['Message', 'transcript', 'TEXT'],
  ['Message', 'transcription', 'TEXT'],
  ['Message', 'commitId', 'TEXT'],
  ['Message', 'senderLabel', 'TEXT'],
  ['Message', 'senderLabelColor', 'TEXT'],
  ['Message', 'senderAvatarPath', 'TEXT'],
  ['Message', 'fromPhone', 'TEXT'],
  ['Message', 'replyToId', 'TEXT'],

  // Participant — muted/archived/role added later
  ['Participant', 'muted', 'BOOLEAN NOT NULL DEFAULT false'],
  ['Participant', 'archived', 'BOOLEAN NOT NULL DEFAULT false'],
  ['Participant', 'role', "TEXT NOT NULL DEFAULT 'member'"],

  // Conversation — description + invite token added later
  ['Conversation', 'description', 'TEXT'],
  ['Conversation', 'inviteToken', 'TEXT'],
  ['Conversation', 'inviteTokenSetAt', 'DATETIME'],
  ['Conversation', 'avatarColor', 'TEXT'],
  ['Conversation', 'avatar', 'TEXT'],
  ['Conversation', 'createdBy', 'TEXT'],

  // Business — privacy field
  ['Business', 'defaultProtectMessages', 'BOOLEAN NOT NULL DEFAULT false'],
  ['Business', 'category', 'TEXT'],
  ['Business', 'registrationDocPath', 'TEXT'],
  ['Business', 'taxDocPath', 'TEXT'],
  ['Business', 'idDocPath', 'TEXT'],
  ['Business', 'rejectionReason', 'TEXT'],
  ['Business', 'verifiedAt', 'DATETIME'],
  ['Business', 'hiddenPhone', 'TEXT'],
  ['Business', 'hidePhone', 'BOOLEAN NOT NULL DEFAULT false'],
  ['Business', 'verified', 'BOOLEAN NOT NULL DEFAULT false'],
  ['Business', 'avatarPath', 'TEXT'],
  ['Business', 'avatarColor', 'TEXT'],
  ['Business', 'description', "TEXT NOT NULL DEFAULT ''"],

  // ScheduledMessage — repeat/repeatUntil added in Task 27
  ['ScheduledMessage', 'repeat', "TEXT NOT NULL DEFAULT 'none'"],
  ['ScheduledMessage', 'repeatUntil', 'DATETIME'],
  ['ScheduledMessage', 'sent', 'BOOLEAN NOT NULL DEFAULT false'],
  ['ScheduledMessage', 'sentAt', 'DATETIME'],
  ['ScheduledMessage', 'type', "TEXT NOT NULL DEFAULT 'text'"],
  ['ScheduledMessage', 'senderId', 'TEXT'],
  ['ScheduledMessage', 'content', 'TEXT'],

  // Commit — completedAt added later
  ['Commit', 'completedAt', 'DATETIME'],
  ['Commit', 'creatorSignedAt', 'DATETIME'],
  ['Commit', 'counterpartySignedAt', 'DATETIME'],
  ['Commit', 'fairnessScore', 'INTEGER NOT NULL DEFAULT 0'],
  ['Commit', 'fairnessNote', "TEXT NOT NULL DEFAULT ''"],
  ['Commit', 'hash', 'TEXT'],
  ['Commit', 'creatorSigned', 'BOOLEAN NOT NULL DEFAULT true'],
  ['Commit', 'counterpartySigned', 'BOOLEAN NOT NULL DEFAULT false'],
  ['Commit', 'conditions', "TEXT NOT NULL DEFAULT '[]'"],
  ['Commit', 'currency', "TEXT NOT NULL DEFAULT 'SAR'"],
  ['Commit', 'amount', 'REAL NOT NULL DEFAULT 0'],
  ['Commit', 'deadline', 'TEXT'],
  ['Commit', 'description', "TEXT NOT NULL DEFAULT ''"],
  ['Commit', 'type', "TEXT NOT NULL DEFAULT 'price'"],
  ['Commit', 'title', 'TEXT'],
  ['Commit', 'status', "TEXT NOT NULL DEFAULT 'pending'"],

  // ServiceProvider — many columns added in Task 30
  ['ServiceProvider', 'type', "TEXT NOT NULL DEFAULT 'government'"],
  ['ServiceProvider', 'description', "TEXT NOT NULL DEFAULT ''"],
  ['ServiceProvider', 'avatarPath', 'TEXT'],
  ['ServiceProvider', 'avatarColor', 'TEXT'],
  ['ServiceProvider', 'officialName', 'TEXT'],
  ['ServiceProvider', 'registrationNumber', 'TEXT'],
  ['ServiceProvider', 'taxNumber', 'TEXT'],
  ['ServiceProvider', 'countryCode', "TEXT NOT NULL DEFAULT '+20'"],
  ['ServiceProvider', 'registrationDocPath', 'TEXT'],
  ['ServiceProvider', 'idDocPath', 'TEXT'],
  ['ServiceProvider', 'livenessVideoPath', 'TEXT'],
  ['ServiceProvider', 'livenessVerified', 'BOOLEAN NOT NULL DEFAULT false'],
  ['ServiceProvider', 'status', "TEXT NOT NULL DEFAULT 'pending'"],
  ['ServiceProvider', 'rejectionReason', 'TEXT'],
  ['ServiceProvider', 'verified', 'BOOLEAN NOT NULL DEFAULT false'],
  ['ServiceProvider', 'verifiedAt', 'DATETIME'],
  ['ServiceProvider', 'verifiedBy', 'TEXT'],
  ['ServiceProvider', 'canBroadcast', 'BOOLEAN NOT NULL DEFAULT false'],
  ['ServiceProvider', 'contactPhone', 'TEXT'],
  ['ServiceProvider', 'contactEmail', 'TEXT'],

  // ServiceProviderMessage
  ['ServiceProviderMessage', 'type', "TEXT NOT NULL DEFAULT 'announcement'"],
  ['ServiceProviderMessage', 'imagePath', 'TEXT'],
  ['ServiceProviderMessage', 'countryCode', "TEXT NOT NULL DEFAULT '+20'"],
  ['ServiceProviderMessage', 'status', "TEXT NOT NULL DEFAULT 'sent'"],
  ['ServiceProviderMessage', 'priority', 'INTEGER NOT NULL DEFAULT 0'],
  ['ServiceProviderMessage', 'title', 'TEXT'],
  ['ServiceProviderMessage', 'content', 'TEXT'],

  // BroadcastChannel
  ['BroadcastChannel', 'description', "TEXT NOT NULL DEFAULT ''"],
  ['BroadcastChannel', 'avatarColor', 'TEXT'],
  ['BroadcastChannel', 'subscriberCount', 'INTEGER NOT NULL DEFAULT 0'],

  // Poll
  ['Poll', 'multiChoice', 'BOOLEAN NOT NULL DEFAULT false'],
  ['Poll', 'anonymous', 'BOOLEAN NOT NULL DEFAULT false'],
  ['Poll', 'options', "TEXT NOT NULL DEFAULT '[]'"],
  ['Poll', 'question', 'TEXT'],
  ['Poll', 'createdBy', 'TEXT'],

  // Story
  ['Story', 'bgColor', 'TEXT'],
  ['Story', 'type', "TEXT NOT NULL DEFAULT 'text'"],

  // ChatFolder
  ['ChatFolder', 'color', 'TEXT'],
  ['ChatFolder', 'icon', 'TEXT'],
  ['ChatFolder', 'name', 'TEXT'],

  // TimeCapsule
  ['TimeCapsule', 'opened', 'BOOLEAN NOT NULL DEFAULT false'],
  ['TimeCapsule', 'unlockAt', 'DATETIME'],
  ['TimeCapsule', 'content', 'TEXT'],
  ['TimeCapsule', 'senderId', 'TEXT'],
  ['TimeCapsule', 'conversationId', 'TEXT'],

  // ReceiptSplit
  ['ReceiptSplit', 'currency', "TEXT NOT NULL DEFAULT 'SAR'"],
  ['ReceiptSplit', 'splitCount', 'INTEGER NOT NULL DEFAULT 2'],
  ['ReceiptSplit', 'totalAmount', 'REAL NOT NULL'],
  ['ReceiptSplit', 'title', 'TEXT'],
  ['ReceiptSplit', 'creatorId', 'TEXT'],
  ['ReceiptSplit', 'conversationId', 'TEXT'],

  // ReceiptSplitParticipant
  ['ReceiptSplitParticipant', 'paid', 'BOOLEAN NOT NULL DEFAULT false'],
  ['ReceiptSplitParticipant', 'amount', 'REAL NOT NULL'],

  // DisappearingSetting
  ['DisappearingSetting', 'enabled', 'BOOLEAN NOT NULL DEFAULT false'],
  ['DisappearingSetting', 'duration', 'INTEGER NOT NULL DEFAULT 86400'],

  // Draft
  ['Draft', 'replyToId', 'TEXT'],
  ['Draft', 'content', 'TEXT'],

  // PhoneNumber — portal + hide flags (Task 67)
  ['PhoneNumber', 'portalName', 'TEXT'],
  ['PhoneNumber', 'hideNumber', 'BOOLEAN NOT NULL DEFAULT false'],
  ['PhoneNumber', 'updatedAt', 'DATETIME'],
  ['PhoneNumber', 'label', 'TEXT'],
  ['PhoneNumber', 'active', 'BOOLEAN NOT NULL DEFAULT false'],

  // School — hidePhone (Task 67 — mirrors Business model)
  ['School', 'hidePhone', 'BOOLEAN NOT NULL DEFAULT false'],
  ['School', 'logoColor', 'TEXT'],
  ['School', 'logoPath', 'TEXT'],
  ['School', 'description', "TEXT NOT NULL DEFAULT ''"],
  ['School', 'address', 'TEXT'],
  ['School', 'city', 'TEXT'],
  ['School', 'country', 'TEXT'],
  ['School', 'phone', 'TEXT'],
  ['School', 'email', 'TEXT'],
  ['School', 'website', 'TEXT'],
  ['School', 'type', "TEXT NOT NULL DEFAULT 'international'"],
  ['School', 'status', "TEXT NOT NULL DEFAULT 'pending'"],
  ['School', 'rejectionReason', 'TEXT'],
  ['School', 'verifiedAt', 'DATETIME'],
  ['School', 'verifiedBy', 'TEXT'],
  ['School', 'studentCount', 'INTEGER NOT NULL DEFAULT 0'],
  ['School', 'staffCount', 'INTEGER NOT NULL DEFAULT 0'],

  // SchoolStudent
  ['SchoolStudent', 'fullName', 'TEXT'],
  ['SchoolStudent', 'grade', 'TEXT'],
  ['SchoolStudent', 'className', 'TEXT'],
  ['SchoolStudent', 'enrollmentYear', 'INTEGER'],
  ['SchoolStudent', 'joinCode', 'TEXT'],
  ['SchoolStudent', 'joinCodeGeneratedAt', 'DATETIME'],
  ['SchoolStudent', 'joinCodeExpiresAt', 'DATETIME'],
  ['SchoolStudent', 'joinCodeRevoked', 'BOOLEAN NOT NULL DEFAULT false'],
  ['SchoolStudent', 'status', "TEXT NOT NULL DEFAULT 'active'"],
  ['SchoolStudent', 'userId', 'TEXT'],
]

export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Array<{ sql: string; ok: boolean; error?: string }> = []
  let created = 0
  let skipped = 0
  let failed = 0

  // Run CREATE TABLE / CREATE INDEX statements one at a time so a single
  // failure doesn't abort the whole sync.
  for (const sql of SCHEMA_STATEMENTS) {
    try {
      await db.$executeRawUnsafe(sql)
      results.push({ sql: sql.slice(0, 80).replace(/\s+/g, ' '), ok: true })
      created++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // "already exists" errors are OK — the table/index was already there.
      if (/already exists|duplicate/i.test(msg)) {
        results.push({
          sql: sql.slice(0, 80).replace(/\s+/g, ' '),
          ok: true,
        })
        skipped++
      } else {
        results.push({
          sql: sql.slice(0, 80).replace(/\s+/g, ' '),
          ok: false,
          error: msg.slice(0, 200),
        })
        failed++
      }
    }
  }

  // Try to add missing columns via ALTER TABLE. Ignore "duplicate column"
  // errors so the same column doesn't get added twice.
  const alterResults: Array<{ table: string; column: string; ok: boolean; error?: string }> = []
  for (const [table, column, typeDef] of ALTER_COLUMNS) {
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${typeDef}`)
      alterResults.push({ table, column, ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/duplicate column|already exists/i.test(msg)) {
        alterResults.push({ table, column, ok: true })
      } else {
        alterResults.push({ table, column, ok: false, error: msg.slice(0, 200) })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    database: process.env.USE_TURSO === 'true' ? 'turso' : 'local-sqlite',
    stats: {
      createStatements: SCHEMA_STATEMENTS.length,
      created,
      skipped,
      failed,
      alterAttempts: ALTER_COLUMNS.length,
      alterApplied: alterResults.filter((r) => r.ok).length,
    },
    failures: results.filter((r) => !r.ok).slice(0, 10),
    alterFailures: alterResults.filter((r) => !r.ok).slice(0, 10),
  })
}

// GET — same effect as POST but easier to trigger from a browser URL bar.
export async function GET() {
  return POST()
}
