'use client'

import { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'

export function SmartReplyChips({ conversationId }: { conversationId: string }) {
  const [replies, setReplies] = useState<string[]>([])
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!conversationId) return
    let cancelled = false
    fetch('/api/ai/smart-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    })
      .then(r => r.json())
      .then(d => {
        if (!cancelled && d.replies) {
          setReplies(d.replies)
          setShow(true)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [conversationId])

  if (!show || replies.length === 0) return null

  return (
    <div className="px-3 py-1 flex items-center gap-1.5 overflow-x-auto wasl-scroll">
      <Sparkles className="w-3 h-3 text-[var(--wasl-green)] shrink-0" />
      {replies.map((reply, i) => (
        <button
          key={i}
          type="button"
          className="shrink-0 px-3 py-1 rounded-full text-xs bg-[var(--wasl-green)]/10 text-foreground border border-[var(--wasl-green)]/30 hover:bg-[var(--wasl-green)]/20 transition-colors"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('wasl:smart-reply', { detail: { reply } }))
            setShow(false)
          }}
        >
          {reply}
        </button>
      ))}
    </div>
  )
}
