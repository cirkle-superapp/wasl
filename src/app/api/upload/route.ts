import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'image/svg+xml',
]

const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json(
      { error: `File type ${file.type} not allowed. Allowed: ${ALLOWED_MIME.join(', ')}` },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` },
      { status: 400 }
    )
  }

  const ext = file.name.split('.').pop() || 'bin'
  const filename = `${randomUUID()}.${ext}`
  const uploadDir = join(process.cwd(), 'public', 'uploads')

  try {
    await mkdir(uploadDir, { recursive: true })
    const bytes = await file.arrayBuffer()
    await writeFile(join(uploadDir, filename), Buffer.from(bytes))
    return NextResponse.json({ url: `/uploads/${filename}` })
  } catch (err) {
    console.error('[upload] error:', err)
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 })
  }
}
