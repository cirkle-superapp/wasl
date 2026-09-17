import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * POST /api/scheduled-messages/process
 *
 * Processes all scheduled messages that are due (scheduledFor <= now).
 * This endpoint is idempotent and safe to call repeatedly.
 *
 * For one-time messages (repeat='none'):
 *   - Sends the message to the conversation
 *   - Marks sent=true, sentAt=now
 *
 * For recurring messages (repeat='daily'|'weekly'|'monthly'):
 *   - Sends the message to the conversation
 *   - Advances scheduledFor to the next occurrence
 *   - If repeatUntil is set and the next occurrence is past it, marks sent=true
 *
 * This endpoint can be called by:
 *   - A cron job (e.g. Vercel Cron, or the mini-services scheduler)
 *   - The chat-app on mount / on interval (client-side polling)
 *   - Manually via curl
 *
 * Returns a summary of what was processed.
 */
export async function POST() {
  const now = new Date()
  const due = await db.scheduledMessage.findMany({
    where: {
      sent: false,
      scheduledFor: { lte: now },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 50, // process at most 50 per call to avoid timeouts
  })

  let sent = 0
  let advanced = 0
  let completed = 0
  const errors: string[] = []

  for (const sm of due) {
    try {
      // Create the actual message in the conversation
      await db.message.create({
        data: {
          conversationId: sm.conversationId,
          senderId: sm.senderId,
          content: sm.content,
          type: sm.type,
          status: 'sent',
        },
      })
      sent++

      // Update the conversation's updatedAt so it sorts to the top
      await db.conversation.update({
        where: { id: sm.conversationId },
        data: { updatedAt: now },
      })

      if (sm.repeat === 'none') {
        // One-time: mark as sent
        await db.scheduledMessage.update({
          where: { id: sm.id },
          data: { sent: true, sentAt: now },
        })
        completed++
      } else {
        // Recurring: advance to next occurrence
        const next = computeNextOccurrence(sm.scheduledFor, sm.repeat, now)
        if (sm.repeatUntil && next > sm.repeatUntil) {
          // Past the end date — stop recurring
          await db.scheduledMessage.update({
            where: { id: sm.id },
            data: { sent: true, sentAt: now },
          })
          completed++
        } else {
          // Advance to next occurrence
          await db.scheduledMessage.update({
            where: { id: sm.id },
            data: { scheduledFor: next },
          })
          advanced++
        }
      }
    } catch (err) {
      errors.push(`${sm.id}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  return NextResponse.json({
    ok: true,
    processed: due.length,
    sent,
    advanced,
    completed,
    errors: errors.length > 0 ? errors : undefined,
  })
}

/**
 * Compute the next occurrence of a recurring schedule.
 * Advances from the PREVIOUS scheduledFor (not from now) so that the
 * interval stays consistent regardless of when the processor runs.
 */
function computeNextOccurrence(
  prev: Date,
  repeat: string,
  now: Date
): Date {
  let next = new Date(prev)
  switch (repeat) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      break
    case 'weekly':
      next.setDate(next.getDate() + 7)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    default:
      next = new Date(now.getTime() + 24 * 60 * 60 * 1000) // fallback +1 day
  }
  // If the computed next is still in the past (e.g. processor was down for
  // a while), keep advancing until it's in the future.
  while (next <= now) {
    const tmp = new Date(next)
    switch (repeat) {
      case 'daily':
        tmp.setDate(tmp.getDate() + 1)
        break
      case 'weekly':
        tmp.setDate(tmp.getDate() + 7)
        break
      case 'monthly':
        tmp.setMonth(tmp.getMonth() + 1)
        break
    }
    next = tmp
  }
  return next
}
