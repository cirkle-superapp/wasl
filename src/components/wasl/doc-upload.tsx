'use client'

import { useRef, useState } from 'react'
import { Upload, Loader2, X, FileText, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uploadFile } from '@/lib/upload'
import { toast } from 'sonner'

// A reusable document-upload field used by the verification flows.
// Uploads to /api/upload and reports the resulting path via onChange.
export function DocUpload({
  label,
  hint,
  required,
  value,
  onChange,
  accept = 'image/*,application/pdf',
}: {
  label: string
  hint?: string
  required?: boolean
  value: string | null
  onChange: (path: string | null) => void
  accept?: string
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setUploading(true)
    try {
      const path = await uploadFile(file)
      onChange(path)
      toast.success(`${label} uploaded`)
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed')
      onChange(null)
    } finally {
      setUploading(false)
    }
  }

  function clear() {
    onChange(null)
    setFileName(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div
        className={cn(
          'relative rounded-lg border-2 border-dashed p-3 transition-colors',
          value
            ? 'border-[var(--wasl-green)]/50 bg-[var(--wasl-green)]/5'
            : 'border-border hover:border-foreground/30'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFile}
          disabled={uploading}
          className="hidden"
        />
        {value && !uploading ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[var(--wasl-green)] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{fileName || 'Document'}</div>
              <div className="text-[10px] text-muted-foreground truncate">{value}</div>
            </div>
            <button
              type="button"
              onClick={clear}
              className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
              title="Remove"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-xs text-[var(--wasl-green)] font-medium hover:underline"
            >
              Replace
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full flex flex-col items-center gap-1 py-2 text-muted-foreground hover:text-foreground"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
            <span className="text-xs">
              {uploading ? 'Uploading…' : 'Tap to upload'}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
