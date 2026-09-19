'use client'

import { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { useWaslStore } from '@/lib/store'

// Offline smart-reply heuristic (from Cirkle blueprint WaslComposerPro §6)
// Works without any API call — pattern-matches the last incoming message.
function computeSmartReplies(last?: string): string[] {
  if (!last || last.length < 2) return []
  const lower = last.toLowerCase()
  if (/[?؟]/.test(last)) return ['Yes 👍', 'No, sorry', "Let me check"]
  if (/(thanks|thank you|شكرا)/i.test(lower)) return ["You're welcome 🌿", 'Anytime', '🤝']
  if (/(meet|coffee|lunch|dinner|قهوة|مقهى)/i.test(lower)) return ['Sounds great', 'What time?', 'Where?']
  if (/(sad|sorry|condolences|عزائي)/i.test(lower)) return ["I'm here for you", '🤍', 'Take your time']
  if (/(congrats|congratulations|mabrouk|مبروك)/i.test(lower)) return ['Mabrouk! 🎉', 'So proud', 'Allah ybarek']
  return ['👍', 'Got it', 'On my way']
}

export function SmartReplyChips({ conversationId }: { conversationId: string }) {
  const [replies, setReplies] = useState<string[]>([])
  const [show, setShow] = useState(false)
  const messages = useWaslStore((s) =>
    conversationId ? s.messagesByConversation[conversationId] : undefined
  )

  useEffect(() => {
    if (!conversationId) return
    let cancelled = false

    // Try AI smart-reply first
    fetch('/api/ai/smart-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.replies && d.replies.length > 0) {
          setReplies(d.replies)
          setShow(true)
        } else {
          // AI returned no replies — fall back to offline heuristic
          const lastIncoming = messages?.filter(m => m.senderId !== useWaslStore.getState().user?.id).slice(-1)[0]
          const fallback = computeSmartReplies(lastIncoming?.content)
          if (fallback.length > 0) {
            setReplies(fallback)
            setShow(true)
          }
        }
      })
      .catch(() => {
        if (cancelled) return
        // Network/AI failure — use offline heuristic
        const lastIncoming = messages?.filter(m => m.senderId !== useWaslStore.getState().user?.id).slice(-1)[0]
        const fallback = computeSmartReplies(lastIncoming?.content)
        if (fallback.length > 0) {
          setReplies(fallback)
          setShow(true)
        }
      })
    return () => { cancelled = true }
  }, [conversationId, messages])

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
