import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

// Per-type size caps (in bytes). Images stay tight (1.5MB) to keep the
// existing DB-stored data-URL messages comparable; the new file types
// (PDF / document / audio) get a 5MB ceiling per the task spec.
const MAX_IMAGE = 1.5 * 1024 * 1024
const MAX_OTHER = 5 * 1024 * 1024

export type UploadedFileType = 'image' | 'pdf' | 'document' | 'audio'

const DOC_EXTENSIONS = new Set(['.doc', '.docx', '.txt', '.md'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.ogg'])
const DOC_MIME = new Set([
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

/**
 * Categorise an incoming file into one of the four supported message types.
 * Falls back to extension sniffing when the browser-supplied MIME is empty
 * (common for .md / .docx on Linux).
 */
function categorize(
  mime: string,
  ext: string
): UploadedFileType | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  if (DOC_MIME.has(mime)) return 'document'
  // Extension fallback (also covers the case where the browser doesn't know
  // the type — e.g. `.md` is `text/markdown` per IANA but Chrome often sends
  // an empty string for it).
  if (ext === '.pdf') return 'pdf'
  if (DOC_EXTENSIONS.has(ext)) return 'document'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  return null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// POST /api/upload — multipart/form-data with a `file` field.
// Writes the file to `public/uploads/` and returns `{ url, type, name, size }`.
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
      { error: 'Invalid multipart/form-data body' },
      { status: 400 }
    )
  }

  const file = form.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'No file provided (expected a `file` field)' },
      { status: 400 }
    )
  }

  const originalName = file.name || 'file'
  const ext = path.extname(originalName).toLowerCase()
  const fileType = categorize(file.type, ext)
  if (!fileType) {
    return NextResponse.json(
      {
        error: `Unsupported file type: ${file.type || ext || 'unknown'} (allowed: images, PDF, .doc/.docx/.txt/.md, audio)`,
      },
      { status: 400 }
    )
  }

  const maxSize = fileType === 'image' ? MAX_IMAGE : MAX_OTHER
  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  }
  if (file.size > maxSize) {
    return NextResponse.json(
      {
        error: `File too large: ${formatBytes(file.size)} (max ${formatBytes(maxSize)} for ${fileType})`,
      },
      { status: 400 }
    )
  }

  // Persist to public/uploads/<uuid><ext>
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  try {
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true })
    }
    const id = randomUUID()
    const safeExt = ext || ''
    const filename = `${id}${safeExt}`
    const filepath = path.join(uploadDir, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filepath, buffer)

    return NextResponse.json({
      url: `/uploads/${filename}`,
      type: fileType,
      name: originalName,
      size: file.size,
    })
  } catch (e) {
    console.error('[upload] failed to persist file:', e)
    return NextResponse.json(
      { error: 'Failed to store file' },
      { status: 500 }
    )
  }
}
