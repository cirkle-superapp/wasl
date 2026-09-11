'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Search, Users, UserPlus, MessageCircle } from 'lucide-react'
import { WaslAvatar } from './wasl-avatar'
import { useWaslStore } from '@/lib/store'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

type SearchUser = {
  id: string
  name: string
  phone: string
  avatar: string | null
  avatarColor: string | null
  about: string
  online: boolean
  lastSeen: string
}

export function NewChatDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchUser[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<SearchUser[]>([])
  const [creating, setCreating] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [showGroupMode, setShowGroupMode] = useState(false)
  const { user, upsertConversation, setActiveConversation, conversations } =
    useWaslStore()
  const router = useRouter()

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setSelected([])
      setShowGroupMode(false)
      setGroupName('')
    }
  }, [open])

  useEffect(() => {
    let cancelled = false
    if (!query.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setResults(data.users || [])
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  function toggleSelect(u: SearchUser) {
    if (showGroupMode) {
      setSelected((prev) =>
        prev.some((p) => p.id === u.id)
          ? prev.filter((p) => p.id !== u.id)
          : [...prev, u]
      )
    } else {
      setSelected([u])
    }
  }

  async function startChat() {
    if (selected.length === 0) return
    setCreating(true)
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantIds: selected.map((s) => s.id),
          name: groupName,
          isGroup: showGroupMode,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Failed to start chat')
        return
      }
      const data = await res.json()
      // Refresh conversation list and open this one
      const freshRes = await fetch(`/api/conversations`, { cache: 'no-store' })
      if (freshRes.ok) {
        const convs = await freshRes.json()
        const targetConv = (convs.conversations || []).find(
          (c: any) => c.id === data.id
        )
        if (targetConv) upsertConversation(targetConv)
      }
      setActiveConversation(data.id)
      onOpenChange(false)
      toast.success(
        data.existed ? 'Opened existing chat' : 'Started a new chat'
      )
      router.refresh()
    } catch (e) {
      console.error(e)
      toast.error('Failed to start chat')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {showGroupMode ? 'New group' : 'New chat'}
          </DialogTitle>
          <DialogDescription>
            {showGroupMode
              ? 'Select multiple people to start a group conversation.'
              : 'Search for someone by name or phone to start chatting.'}
          </DialogDescription>
        </DialogHeader>

        {showGroupMode && (
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name (e.g. Family)"
            className="mb-2"
          />
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone"
            className="pl-9"
            autoFocus
          />
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-1.5 bg-muted rounded-full pl-1 pr-2 py-0.5"
              >
                <WaslAvatar name={s.name} src={s.avatar} color={s.avatarColor} size={20} />
                <span className="text-xs">{s.name}</span>
                <button
                  onClick={() => toggleSelect(s)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="max-h-72 overflow-y-auto wasl-scroll -mx-2 px-2">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching…
            </div>
          ) : !query.trim() ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-sm gap-3">
              <MessageCircle className="w-10 h-10 opacity-30" />
              <p>Type a name or phone to find people.</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-sm gap-2">
              <p>No results found.</p>
              {showGroupMode ? null : (
                <p className="text-xs">
                  Tip: ask your friend to sign up using their phone number.
                </p>
              )}
            </div>
          ) : (
            results.map((u) => {
              const isSelected = selected.some((s) => s.id === u.id)
              return (
                <button
                  key={u.id}
                  onClick={() => toggleSelect(u)}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${
                    isSelected ? 'bg-muted' : 'hover:bg-muted/60'
                  }`}
                >
                  <WaslAvatar
                    name={u.name}
                    src={u.avatar}
                    color={u.avatarColor}
                    size={40}
                    online={u.online}
                    showStatus
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {u.about || u.phone}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-[var(--wasl-green)] text-white flex items-center justify-center text-xs">
                      ✓
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowGroupMode((v) => !v)
              setSelected([])
            }}
          >
            {showGroupMode ? (
              <>
                <UserPlus className="w-4 h-4 mr-1" /> Single chat
              </>
            ) : (
              <>
                <Users className="w-4 h-4 mr-1" /> New group
              </>
            )}
          </Button>
          <Button
            type="button"
            disabled={creating || selected.length === 0 || (showGroupMode && !groupName.trim() && selected.length > 1)}
            onClick={startChat}
            className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
          >
            {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {showGroupMode
              ? `Create group${selected.length > 0 ? ` (${selected.length})` : ''}`
              : 'Start chat'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
