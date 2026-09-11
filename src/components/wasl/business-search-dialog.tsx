'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Search,
  Loader2,
  Building2,
  ShieldCheck,
  ArrowLeft,
  Lock,
  Globe,
  Plus,
  CheckCircle2,
} from 'lucide-react'
import { WaslAvatar } from './wasl-avatar'
import { useWaslStore } from '@/lib/store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type SearchResult = {
  id: string
  name: string
  description: string
  avatarPath: string | null
  avatarColor: string | null
  category: string | null
  verified: boolean
  hidePhone: boolean
}

type BusinessProfile = {
  id: string
  name: string
  description: string
  avatarPath: string | null
  avatarColor: string | null
  category: string | null
  verified: boolean
  phone: string | null
  memberCount: number
  owner: { id: string; name: string; verified: boolean }
  groups: {
    id: string
    name: string
    description: string
    visibility: string
    category: string | null
    conversationId: string
  }[]
  isMember: boolean
}

export function BusinessSearchDialog({
  open,
  onOpenChange,
  onJoinGroup,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onJoinGroup?: (conversationId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [joining, setJoining] = useState<string | null>(null)
  const { setActiveConversation, upsertConversation, conversations } =
    useWaslStore()

  const search = useCallback(async () => {
    if (!query.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/business/search?q=${encodeURIComponent(query.trim())}`)
      if (!res.ok) return
      const data = await res.json()
      setResults(data.businesses || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setProfile(null)
    }
  }, [open])

  useEffect(() => {
    const t = setTimeout(() => void search(), 250)
    return () => clearTimeout(t)
  }, [query, search])

  async function openProfile(id: string) {
    setProfileLoading(true)
    setProfile(null)
    try {
      const res = await fetch(`/api/business/search/${id}`)
      if (!res.ok) {
        toast.error('Business not found')
        return
      }
      const data = await res.json()
      setProfile(data.business)
    } catch {
      toast.error('Network error')
    } finally {
      setProfileLoading(false)
    }
  }

  async function joinGroup(group: BusinessProfile['groups'][number]) {
    if (!profile) return
    setJoining(group.id)
    try {
      const res = await fetch(`/api/business/search/${profile.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: group.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to join group')
        return
      }
      toast.success(`Joined ${group.name}`)
      // Refresh conversation list and open the joined conversation
      const freshRes = await fetch('/api/conversations', { cache: 'no-store' })
      if (freshRes.ok) {
        const convs = await freshRes.json()
        const target = (convs.conversations || []).find(
          (c: any) => c.id === group.conversationId
        )
        if (target) upsertConversation(target)
      }
      onJoinGroup?.(group.conversationId)
      setActiveConversation(group.conversationId)
      onOpenChange(false)
    } catch {
      toast.error('Network error')
    } finally {
      setJoining(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[var(--wasl-green)]" />
            {profile ? (
              <button
                onClick={() => setProfile(null)}
                className="flex items-center gap-2 hover:opacity-70"
              >
                <ArrowLeft className="w-4 h-4" />
                Business profile
              </button>
            ) : (
              'Business search'
            )}
          </DialogTitle>
          <DialogDescription>
            {profile
              ? 'View public groups and join the ones you need.'
              : 'Find verified businesses on Wasl and connect with their public groups.'}
          </DialogDescription>
        </DialogHeader>

        {!profile && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search businesses (e.g. Apple)"
              className="pl-9"
              autoFocus
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto wasl-scroll -mx-2 px-2">
          {/* Search results list */}
          {!profile && (
            <>
              {loading && (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching…
                </div>
              )}
              {!loading && query.trim() && results.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">
                  No businesses found.
                </p>
              )}
              {!loading && !query.trim() && (
                <p className="text-center text-sm text-muted-foreground py-6">
                  Type to search for verified businesses.
                </p>
              )}
              {results.map((b) => (
                <button
                  key={b.id}
                  onClick={() => openProfile(b.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/60 text-left transition-colors"
                >
                  <WaslAvatar
                    name={b.name}
                    src={b.avatarPath}
                    color={b.avatarColor}
                    size={44}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm truncate">{b.name}</span>
                      {b.verified && (
                        <ShieldCheck className="w-3.5 h-3.5 text-[var(--wasl-green)] shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {b.category || b.description || 'Verified business'}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Business profile */}
          {profile && (
            <div className="space-y-4 py-2">
              {profileLoading && (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
                </div>
              )}
              {profile && !profileLoading && (
                <>
                  <div className="flex items-center gap-3">
                    <WaslAvatar
                      name={profile.name}
                      src={profile.avatarPath}
                      color={profile.avatarColor}
                      size={64}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-base truncate">{profile.name}</span>
                        <ShieldCheck className="w-4 h-4 text-[var(--wasl-green)] shrink-0" />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {profile.category || 'Verified business'} · {profile.memberCount} member{profile.memberCount === 1 ? '' : 's'}
                      </div>
                      {profile.phone && (
                        <div className="text-xs text-foreground/70 mt-0.5">
                          Phone: {profile.phone}
                        </div>
                      )}
                    </div>
                  </div>
                  {profile.description && (
                    <p className="text-sm text-foreground/80">{profile.description}</p>
                  )}

                  {/* Groups */}
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                      Groups ({profile.groups.length})
                    </div>
                    {profile.groups.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No groups available yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {profile.groups.map((g) => {
                          const isPublic = g.visibility === 'public'
                          return (
                            <div
                              key={g.id}
                              className="rounded-lg border border-border p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-sm truncate">{g.name}</span>
                                    <span
                                      className={cn(
                                        'text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0',
                                        isPublic
                                          ? 'bg-[var(--wasl-green)]/15 text-[var(--wasl-green)]'
                                          : 'bg-muted text-muted-foreground'
                                      )}
                                    >
                                      {isPublic ? (
                                        <>
                                          <Globe className="w-2.5 h-2.5" /> Public
                                        </>
                                      ) : (
                                        <>
                                          <Lock className="w-2.5 h-2.5" /> Private
                                        </>
                                      )}
                                    </span>
                                  </div>
                                  {g.category && (
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      {g.category}
                                    </div>
                                  )}
                                  {g.description && (
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                      {g.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                              {isPublic && !profile.isMember && (
                                <Button
                                  size="sm"
                                  className="w-full mt-2 bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white h-8"
                                  disabled={joining === g.id}
                                  onClick={() => joinGroup(g)}
                                >
                                  {joining === g.id ? (
                                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                  ) : (
                                    <Plus className="w-3.5 h-3.5 mr-1" />
                                  )}
                                  Join group
                                </Button>
                              )}
                              {isPublic && profile.isMember && (
                                <div className="flex items-center gap-1 text-xs text-[var(--wasl-green)] mt-2 justify-center">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Member
                                </div>
                              )}
                              {!isPublic && (
                                <p className="text-[10px] text-muted-foreground mt-2 text-center">
                                  Ask a business admin to invite you.
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
