import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// POST — create a receipt split
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { conversationId, title, totalAmount, currency, participantIds } = await req.json()
  if (!conversationId || !title || !totalAmount || !participantIds?.length) {
    return NextResponse.json({ error: 'conversationId, title, totalAmount, participantIds required' }, { status: 400 })
  }
  const allIds = Array.from(new Set([session.id, ...participantIds]))
  const perPerson = Math.round((totalAmount / allIds.length) * 100) / 100
  
  const split = await db.receiptSplit.create({
    data: {
      conversationId,
      creatorId: session.id,
      title,
      totalAmount,
      currency: currency || 'SAR',
      splitCount: allIds.length,
      participants: {
        create: allIds.map(uid => ({ userId: uid, amount: perPerson })),
      },
    },
    include: { participants: true },
  })
  return NextResponse.json({ ok: true, split })
}
