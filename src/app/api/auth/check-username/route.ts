import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// GET /api/auth/check-username?u=...
// Returns { available: boolean, suggestions: string[] }
// Suggestions are auto-generated Cirkle usernames based on the input.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const raw = (searchParams.get('u') || '').trim().toLowerCase()
  if (!raw) {
    return NextResponse.json({ available: false, suggestions: [], message: 'Enter a username' })
  }
  // Validate format
  if (!/^[a-z0-9_]+$/.test(raw)) {
    return NextResponse.json({
      available: false,
      suggestions: [],
      message: 'Username can only contain lowercase letters, numbers, and underscores',
    })
  }
  if (raw.length < 3) {
    return NextResponse.json({
      available: false,
      suggestions: [],
      message: 'Username must be at least 3 characters',
    })
  }
  const existing = await db.user.findUnique({ where: { username: raw } })
  if (existing) {
    // Generate suggestions by appending numbers / underscores
    const suggestions: string[] = []
    for (const suffix of ['1', '2', '3', '_', '_1', '_2', '99', '007', 'x']) {
      const candidate = `${raw}${suffix}`.slice(0, 20)
      const taken = await db.user.findUnique({ where: { username: candidate } })
      if (!taken && !suggestions.includes(candidate)) {
        suggestions.push(candidate)
      }
      if (suggestions.length >= 4) break
    }
    return NextResponse.json({
      available: false,
      suggestions,
      message: 'This username is taken. Try one of the suggestions.',
    })
  }
  return NextResponse.json({ available: true, suggestions: [], message: 'Available' })
}
