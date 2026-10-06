import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// POST /api/scheduled-batches/process — cron-callable batch processor
// ═══════════════════════════════════════════════════════════════════════
//
// For each due batch (status='pending' AND scheduledFor <= NOW):
//   1. Mark as 'processing'.
//   2. Resolve the recipient list — for scope recipients (business/school/
//      work/personal), expand to concrete conversation ids at process time
//      so we always pick up the latest conversations (e.g. if the user
//      joined a new "work" folder after the batch was scheduled).
//   3. For each (message × recipient) pair, in order:
//        - Wait delaySeconds after the previous message in the batch
//          (we use a simple `await sleep` — fine for small batches).
//        - Create the Message row (text/image), set status='sent'.
//        - Emit a socket event via the chat-service so recipients see it
//          in real-time. (For simplicity in this processor we just create
//          the DB row — the chat-service will pick it up when the
//          recipient fetches messages.)
//   4. Update totalSent / totalFailed / processedAt / status.
//   5. If repeat != 'none', advance scheduledFor to the next occurrence
//      and reset status to 'pending'. Otherwise set status='completed'.
//
// Auth: requires a logged-in Wasl user (cron jobs authenticate via the
// session cookie) OR a CRON_SECRET env var (so external cron services can
// call this endpoint without a session).

export async function POST(req: Request) {
  // Auth: session OR CRON_SECRET
  const authHeader = req.headers.get('authorization') || ''
  const cronSecret = process.env.CRON_SECRET
  let authorized = false

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    authorized = true
  } else {
    const session = await getSession()
    if (session) authorized = true
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find all due batches
  const now = new Date()
  const dueBatches = await db.scheduledBatch.findMany({
    where: {
      status: 'pending',
      scheduledFor: { lte: now },
    },
    include: {
      messages: { orderBy: { order: 'asc' } },
      recipients: true,
      user: { select: { id: true, name: true, username: true } },
    },
    take: 20, // process at most 20 batches per call (avoid timeouts)
  })

  if (dueBatches.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No due batches' })
  }

  const results = []
  for (const batch of dueBatches) {
    try {
      // Mark as processing
      await db.scheduledBatch.update({
        where: { id: batch.id },
        data: { status: 'processing' },
      })

      const result = await processBatch(batch)
      results.push({
        id: batch.id,
        name: batch.name,
        status: result.status,
        sent: result.sent,
        failed: result.failed,
        progress: result.progress,
      })
    } catch (err: any) {
      console.error(`[scheduled-batches/process] batch ${batch.id} failed:`, err)
      await db.scheduledBatch.update({
        where: { id: batch.id },
        data: {
          status: 'failed',
          progress: `Error: ${String(err?.message || err).slice(0, 200)}`,
          processedAt: new Date(),
        },
      })
      results.push({ id: batch.id, status: 'failed', error: String(err?.message || err).slice(0, 200) })
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function processBatch(batch: any): Promise<{ status: string; sent: number; failed: number; progress: string }> {
  // Resolve recipients → concrete conversation IDs (de-duped)
  const conversationIds = await resolveRecipients(batch.userId, batch.recipients)

  if (conversationIds.size === 0) {
    // Nothing to send to. Mark as completed (no recipients = nothing to do).
    await db.scheduledBatch.update({
      where: { id: batch.id },
      data: {
        status: 'completed',
        progress: 'No eligible recipients',
        processedAt: new Date(),
      },
    })
    return { status: 'completed', sent: 0, failed: 0, progress: 'No eligible recipients' }
  }

  const totalOperations = batch.messages.length * conversationIds.size
  let sent = 0
  let failed = 0
  let opNumber = 0

  // Iterate over messages IN ORDER (message order is the primary axis)
  for (let i = 0; i < batch.messages.length; i++) {
    const message = batch.messages[i]
    // Apply the per-message delay AFTER the first message (so the first
    // message sends immediately when the batch fires).
    if (i > 0 && message.delaySeconds > 0) {
      await sleep(message.delaySeconds * 1000)
    }
    // Send the SAME message to ALL recipients
    for (const conversationId of conversationIds) {
      opNumber++
      try {
        await sendOne({
          conversationId,
          senderId: batch.userId,
          content: message.content,
          type: message.type,
        })
        sent++
      } catch (err) {
        console.error(`[scheduled-batches] send failed for batch ${batch.id} conv ${conversationId}:`, err)
        failed++
      }
      // Update progress every 10 operations (avoid DB thrash)
      if (opNumber % 10 === 0 || opNumber === totalOperations) {
        await db.scheduledBatch.update({
          where: { id: batch.id },
          data: {
            totalSent: sent,
            totalFailed: failed,
            progress: `${opNumber}/${totalOperations}`,
          },
        }).catch(() => {})
      }
    }
  }

  // Final status
  const finalStatus = failed === 0 ? 'completed' : (sent === 0 ? 'failed' : 'partial')
  const finalProgress = `${sent}/${totalOperations} sent (${failed} failed)`

  // Schedule recurrence if applicable
  let nextScheduledFor: Date | null = null
  if (batch.repeat !== 'none') {
    nextScheduledFor = computeNextOccurrence(batch.scheduledFor, batch.repeat)
    // If repeatUntil is set and the next occurrence is after it, stop recurring.
    if (batch.repeatUntil && nextScheduledFor && nextScheduledFor > new Date(batch.repeatUntil)) {
      nextScheduledFor = null
    }
  }

  await db.scheduledBatch.update({
    where: { id: batch.id },
    data: {
      status: nextScheduledFor ? 'pending' : finalStatus,
      progress: finalProgress,
      totalSent: sent,
      totalFailed: failed,
      processedAt: new Date(),
      ...(nextScheduledFor ? { scheduledFor: nextScheduledFor } : {}),
    },
  })

  return { status: nextScheduledFor ? 'pending' : finalStatus, sent, failed, progress: finalProgress }
}

async function resolveRecipients(userId: string, recipients: any[]): Promise<Set<string>> {
  const result = new Set<string>()

  // Group recipients by type
  const conversationRecipients = recipients.filter((r) => r.recipientType === 'conversation')
  const scopeRecipients = recipients.filter((r) => ['business', 'school', 'work', 'personal'].includes(r.recipientType))
  const folderRecipients = recipients.filter((r) => r.recipientType === 'folder')

  // Direct conversation recipients
  for (const r of conversationRecipients) {
    if (r.conversationId) result.add(r.conversationId)
  }

  // Scope recipients — expand at runtime
  if (scopeRecipients.length > 0) {
    const scopes = scopeRecipients.map((r) => r.scope).filter(Boolean) as string[]
    const userParticipations = await db.participant.findMany({
      where: { userId },
      select: {
        conversationId: true,
        conversation: { select: { id: true, isGroup: true, name: true } },
      },
    })

    for (const scope of scopes) {
      if (scope === 'personal') {
        for (const p of userParticipations) {
          if (!p.conversation.isGroup) result.add(p.conversationId)
        }
      } else if (scope === 'work') {
        const workFolders = await db.chatFolder.findMany({
          where: { userId, name: { contains: 'work', mode: 'insensitive' } },
          select: { id: true },
        })
        if (workFolders.length > 0) {
          const folderConvs = await db.folderConversation.findMany({
            where: { folderId: { in: workFolders.map((f) => f.id) } },
            select: { conversationId: true },
          })
          for (const fc of folderConvs) result.add(fc.conversationId)
        }
      } else if (scope === 'business') {
        const ownedBusinesses = await db.business.findMany({
          where: { ownerId: userId },
          select: { id: true },
        })
        const businessGroups = await db.businessGroup.findMany({
          where: { businessId: { in: ownedBusinesses.map((b) => b.id) } },
          select: { conversationId: true },
        })
        for (const bg of businessGroups) result.add(bg.conversationId)
      } else if (scope === 'school') {
        const schools = await db.school.findMany({
          where: { ownerId: userId },
          select: { name: true },
        })
        const memberships = await db.schoolMembership.findMany({
          where: { userId },
          select: { school: { select: { name: true } } },
        })
        const schoolNames = [
          ...schools.map((s) => s.name),
          ...memberships.map((m) => m.school.name),
        ].filter(Boolean)
        for (const p of userParticipations) {
          const name = p.conversation.name || ''
          if (schoolNames.some((sn) => name.toLowerCase().includes(sn.toLowerCase()))) {
            result.add(p.conversationId)
          }
        }
      }
    }
  }

  // Folder recipients
  for (const r of folderRecipients) {
    if (!r.folderId) continue
    const folderConvs = await db.folderConversation.findMany({
      where: { folderId: r.folderId },
      select: { conversationId: true },
    })
    for (const fc of folderConvs) result.add(fc.conversationId)
  }

  return result
}

async function sendOne({ conversationId, senderId, content, type }: {
  conversationId: string
  senderId: string
  content: string
  type: string
}): Promise<void> {
  await db.message.create({
    data: {
      conversationId,
      senderId,
      content,
      type: type === 'image' ? 'image' : 'text',
      status: 'sent',
    },
  })
  // Bump the conversation's updatedAt so the conversation moves to the top
  // of the sidebar for the sender AND recipients.
  await db.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  })
}

function computeNextOccurrence(last: Date, repeat: string): Date | null {
  const next = new Date(last)
  switch (repeat) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      return next
    case 'weekly':
      next.setDate(next.getDate() + 7)
      return next
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      return next
    default:
      return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(ms, 30_000)))
}
