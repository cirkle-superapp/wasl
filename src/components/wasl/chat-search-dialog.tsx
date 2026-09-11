'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Search, X, Loader2 } from 'lucide-react'
import { useWaslStore, type ChatMessage } from '@/lib/store'
import { WaslAvatar } from './wasl-avatar'
import { formatChatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'

export function ChatSearchDialog({
  open,
  onOpenChange,
  conversationId,
  conversationName,
  conversationAvatar,
  conversationAvatarColor,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  conversationId: string | null
  conversationName?: string
  conversationAvatar?: string | null
  conversationAvatarColor?: string | null
}) {
  const { user } = useWaslStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
    }
  }, [open])

  const search = useCallback(async () => {
    if (!conversationId || !query.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/search?q=${encodeURIComponent(query.trim())}`,
        { cache: 'no-store' }
      )
      if (!res.ok) return
      const data = await res.json()
      setResults(data.results || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [conversationId, query])

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim()) void search()
      else setResults([])
    }, 250)
    return () => clearTimeout(t)
  }, [query, search])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WaslAvatar
              name={conversationName || 'Chat'}
              src={conversationAvatar}
              color={conversationAvatarColor}
              size={24}
            />
            <span className="text-base">Search · {conversationName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-96 overflow-y-auto wasl-scroll -mx-2 px-2">
          {loading && (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching…
            </div>
          )}
          {!loading && query.trim() && results.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">
              No messages found.
            </p>
          )}
          {!loading && !query.trim() && (
            <p className="text-center text-sm text-muted-foreground py-6">
              Type to search for messages in this conversation.
            </p>
          )}
          {results.map((m) => {
            const mine = m.senderId === user?.id
            // Highlight the query in the content
            const content = m.content
            const idx = content.toLowerCase().indexOf(query.toLowerCase())
            const before = idx > 0 ? content.slice(0, idx) : ''
            const match = idx >= 0 ? content.slice(idx, idx + query.length) : ''
            const after = idx >= 0 ? content.slice(idx + query.length) : content
            return (
              <div
                key={m.id}
                className={cn(
                  'flex gap-2 px-2 py-2 rounded-lg hover:bg-muted/60 cursor-pointer',
                  mine && 'flex-row-reverse'
                )}
              >
                <div className={cn('max-w-[80%]', mine ? 'text-right' : 'text-left')}>
                  <div
                    className={cn(
                      'inline-block px-2.5 py-1.5 rounded-lg text-sm',
                      mine ? 'wasl-bubble-out' : 'wasl-bubble-in'
                    )}
                  >
                    {before}
                    <mark className="bg-amber-300/60 text-foreground rounded px-0.5">
                      {match}
                    </mark>
                    {after}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {formatChatTimestamp(m.createdAt)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
