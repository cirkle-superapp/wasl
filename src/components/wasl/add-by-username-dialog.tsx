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
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, AtSign, Search, Check, Plus, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { WaslAvatar } from './wasl-avatar'
import { cn } from '@/lib/utils'

type FoundUser = {
  id: string
  username: string
  name: string
  phone: string | null
  avatar: string | null
  avatarColor: string | null
  about: string
  online: boolean
  lastSeen: string
  verified: boolean
}

export function AddByUsernameDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onAdded?: (userId: string) => void
}) {
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [notes, setNotes] = useState('')
  const [looking, setLooking] = useState(false)
  const [adding, setAdding] = useState(false)
  const [found, setFound] = useState<FoundUser | null>(null)
  const [searchResults, setSearchResults] = useState<FoundUser[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setUsername('')
      setNickname('')
      setNotes('')
      setFound(null)
      setSearchResults([])
      setError(null)
    }
  }, [open])

  // Live-search as the user types (debounced)
  useEffect(() => {
    if (!open) return
    const q = username.replace(/^@/, '').trim()
    if (q.length < 2) {
      setSearchResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
        if (res.ok) {
          const data = await res.json()
          setSearchResults(data.users || [])
        }
      } catch {}
    }, 250)
    return () => clearTimeout(t)
  }, [username, open])

  async function addContact(userId: string) {
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/contacts/by-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: found?.username || username.replace(/^@/, ''),
          nickname: nickname.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Failed to add contact')
        return
      }
      if (data.alreadyContact) {
        toast.info('Already in your contacts')
      } else {
        toast.success(`Added @${data.contact.user.username}`)
      }
      onAdded?.(userId)
      onOpenChange(false)
    } catch {
      setError('Network error')
    } finally {
      setAdding(false)
    }
  }

  function selectUser(u: FoundUser) {
    setFound(u)
    setNickname(u.name)
    setError(null)
    setSearchResults([])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AtSign className="h-5 w-5 text-[var(--wasl-green)]" />
            Add by username
          </DialogTitle>
          <DialogDescription>
            Find a Wasl user by their <span className="font-medium text-foreground">@username</span> and add them to your contacts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          {/* Username search input */}
          <div>
            <Label className="text-xs">Username</Label>
            <div className="relative mt-1">
              <AtSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  setFound(null)
                  setError(null)
                }}
                placeholder="username"
                className="pl-8 h-9 text-sm font-mono"
                autoFocus
              />
            </div>
          </div>

          {/* Search results (live) */}
          {searchResults.length > 0 && !found && (
            <div className="rounded-lg border border-border max-h-48 overflow-y-auto wasl-scroll">
              {searchResults.slice(0, 5).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => selectUser(u)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-muted/60 transition text-left"
                >
                  <WaslAvatar
                    name={u.name}
                    src={u.avatar}
                    color={u.avatarColor}
                    size={32}
                    online={u.online}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">@{u.username}</div>
                  </div>
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          {/* Found user preview */}
          {found && (
            <div className="rounded-xl border border-[var(--wasl-green)]/40 bg-[var(--wasl-green)]/5 p-3">
              <div className="flex items-center gap-2.5">
                <WaslAvatar
                  name={found.name}
                  src={found.avatar}
                  color={found.avatarColor}
                  size={40}
                  online={found.online}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{found.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">@{found.username}</div>
                </div>
                <button
                  type="button"
                  onClick={() => { setFound(null); setUsername('') }}
                  className="p-1 rounded-full hover:bg-muted text-muted-foreground"
                  aria-label="Clear selection"
                >
                  <Plus className="h-3.5 w-3.5 rotate-45" />
                </button>
              </div>
              {found.about && (
                <div className="text-[11px] text-muted-foreground mt-2 truncate">“{found.about}”</div>
              )}
            </div>
          )}

          {/* Optional nickname + notes (only when a user is selected) */}
          {found && (
            <>
              <div>
                <Label className="text-xs">Nickname (optional)</Label>
                <Input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={found.name}
                  className="h-9 mt-1 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="How you know them"
                  className="h-9 mt-1 text-sm"
                />
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Action button */}
          <Button
            onClick={() => addContact(found?.id || '')}
            disabled={!found || adding}
            className="w-full"
          >
            {adding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : found ? (
              <UserCheck className="h-4 w-4 mr-2" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            {found ? `Add @${found.username}` : 'Search for a user'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
