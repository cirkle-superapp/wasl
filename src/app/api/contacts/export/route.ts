import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/contacts/export — download all of the current user's contacts as a
// CSV file. Columns: name, phone, username, notes.
//
// Content-Disposition is set with a filename that includes today's date so
// repeated exports don't clobber each other.
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contacts = await db.contact.findMany({
    where: { ownerId: session.id },
    include: {
      user: {
        select: { id: true, username: true, name: true, phone: true },
      },
    },
    orderBy: { addedAt: 'desc' },
  })

  const header = ['name', 'phone', 'username', 'notes']
  const rows: string[][] = [header]
  for (const c of contacts) {
    rows.push([
      c.nickname || c.user?.name || '',
      c.phone || c.user?.phone || '',
      c.user?.username || '',
      c.notes || '',
    ])
  }

  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')

  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="wasl-contacts-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}

// RFC-4180-ish CSV cell escaping: wrap in quotes if the value contains a
// comma, quote, newline, or carriage return. Embedded quotes are doubled.
function csvEscape(value: string): string {
  const needsQuoting = /["\n\r,]/.test(value)
  const escaped = value.replace(/"/g, '""')
  return needsQuoting ? `"${escaped}"` : escaped
}
