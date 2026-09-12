'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Pencil, Loader2, ChevronRight } from 'lucide-react'
import { formatChatTimestamp } from '@/lib/time'

type EditEntry = {
  id: string
  content: string
  editedAt: string
}

export function EditHistoryDialog({
  open,
  onOpenChange,
  messageId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  messageId: string | null
}) {
  const [edits, setEdits] = useState<EditEntry[]>([])
  const [currentContent, setCurrentContent] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!messageId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/messages/${messageId}/edits`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        setEdits([])
        return
      }
      const data = await res.json()
      setEdits(data.edits || [])
      setCurrentContent(data.currentContent || '')
    } catch {
      setEdits([])
    } finally {
      setLoading(false)
    }
  }, [messageId])

  useEffect(() => {
    if (open) {
      load()
    }
  }, [open, load])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-muted-foreground" />
            Edit history
          </DialogTitle>
          <DialogDescription>
            {edits.length > 0
              ? `${edits.length} previous version${edits.length === 1 ? '' : 's'}`
              : 'No edit history'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto wasl-scroll -mx-2 px-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : edits.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No previous versions.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Current version (top) */}
              <div className="rounded-lg border-2 border-[var(--wasl-green)]/40 bg-[var(--wasl-green)]/5 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--wasl-green)] mb-1.5 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" /> Current
                </div>
                <div className="text-sm text-foreground break-words whitespace-pre-wrap">
                  {currentContent}
                </div>
              </div>

              {/* Previous versions */}
              {edits.map((edit, i) => (
                <div
                  key={edit.id}
                  className="rounded-lg border border-border bg-muted/20 p-3"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    {i === 0 ? 'Previous' : `Edit ${edits.length - i}`}
                    <span className="ml-2 normal-case font-normal text-muted-foreground/70">
                      {formatChatTimestamp(edit.editedAt)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground break-words whitespace-pre-wrap line-through opacity-80">
                    {edit.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
