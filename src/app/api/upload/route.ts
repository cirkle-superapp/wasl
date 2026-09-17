import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// Allowed image MIME types for uploads. We're strict so the endpoint can't
// be abused as a generic file-dump.
const ALLOWED_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB upload cap

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

// POST /api/upload — accepts a single multipart image upload (`file` field)
// and writes it to `public/uploads/`. Returns the public-facing URL the
// caller can store / pass to other API endpoints (e.g. group avatar).
//
// Optional `?type=group-avatar` query param tags the upload for the caller's
// own bookkeeping (e.g. logs / future per-type quotas) but isn't required.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json(
      { error: 'Expected multipart/form-data' },
      { status: 400 }
    )
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Missing "file" field' },
      { status: 400 }
    )
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
      { status: 413 }
    )
  }

  const mime = (file.type || '').toLowerCase()
  const ext = ALLOWED_MIME[mime]
  if (!ext) {
    return NextResponse.json(
      { error: 'Unsupported file type — only images are allowed' },
      { status: 415 }
    )
  }

  // Make sure public/uploads exists (Next.js serves files from /public).
  await fs.mkdir(UPLOAD_DIR, { recursive: true })

  // Generate a unique filename: <userId>-<timestamp>-<random>.<ext>
  const rand = Math.random().toString(36).slice(2, 10)
  const filename = `${session.id}-${Date.now()}-${rand}.${ext}`
  const fullPath = path.join(UPLOAD_DIR, filename)

  const bytes = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(fullPath, bytes)

  // Public URL (Next.js serves /public at the root).
  const url = `/uploads/${filename}`

  return NextResponse.json({
    url,
    size: bytes.length,
    mimeType: mime,
  })
}
