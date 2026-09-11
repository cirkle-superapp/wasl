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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Loader2,
  Building2,
  ShieldCheck,
  Users,
  Plus,
  Globe,
  Lock,
  Trash2,
  Search,
  UserPlus,
  Crown,
} from 'lucide-react'
import { WaslAvatar } from './wasl-avatar'
import { useWaslStore } from '@/lib/store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Member = {
  id: string
  role: string
  userId: string
  name: string
  avatar: string | null
  avatarColor: string | null
  phone: string
  verified: boolean
  joinedAt: string
}

type Group = {
  id: string
  name: string
  description: string
  visibility: string
  category: string | null
  conversationId: string
  createdAt: string
}

type BusinessData = {
  id: string
  name: string
  description: string
  avatarPath: string | null
  avatarColor: string | null
  category: string | null
  verified: boolean
  ownerId: string
  hidePhone: boolean
  hiddenPhone: string | null
  owner: { id: string; name: string; verified: boolean }
  members: Member[]
  groups: Group[]
}

export function BusinessDashboardDialog({
  open,
  onOpenChange,
  businessId,
  onOpenConversation,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  businessId: string | null
  onOpenConversation?: (conversationId: string) => void
}) {
  const { user, setActiveConversation, upsertConversation, conversations } =
    useWaslStore()
  const [business, setBusiness] = useState<BusinessData | null>(null)
  const [loading, setLoading] = useState(true)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [newGroupVis, setNewGroupVis] = useState<'public' | 'private'>('private')
  const [newGroupCat, setNewGroupCat] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])

  const load = useCallback(async () => {
    if (!businessId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/business/${businessId}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setBusiness(data.business)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    if (open) {
      load()
      setNewGroupName('')
      setNewGroupDesc('')
      setNewGroupVis('private')
      setNewGroupCat('')
      setSearchQuery('')
      setSearchResults([])
    }
  }, [open, load])

  // Search users to invite
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`)
        if (!res.ok) return
        const data = await res.json()
        setSearchResults(data.users || [])
      } catch {
        // ignore
      }
    }, 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  async function createGroup() {
    if (!businessId || !newGroupName.trim()) return
    setCreatingGroup(true)
    try {
      const res = await fetch(`/api/business/${businessId}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim(),
          visibility: newGroupVis,
          category: newGroupCat.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to create group')
        return
      }
      toast.success(`Group "${data.group.name}" created`)
      await load()
      setNewGroupName('')
      setNewGroupDesc('')
      setNewGroupCat('')
      setNewGroupVis('private')
    } catch {
      toast.error('Network error')
    } finally {
      setCreatingGroup(false)
    }
  }

  async function inviteMember(userId: string) {
    if (!businessId) return
    try {
      const res = await fetch(`/api/business/${businessId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to invite')
        return
      }
      toast.success('Member invited')
      await load()
      setSearchQuery('')
      setSearchResults([])
    } catch {
      toast.error('Network error')
    }
  }

  async function removeMember(userId: string) {
    if (!businessId) return
    if (!confirm('Remove this member from the business?')) return
    try {
      const res = await fetch(
        `/api/business/${businessId}/members/${userId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Failed to remove')
        return
      }
      toast.success('Member removed')
      await load()
    } catch {
      toast.error('Network error')
    }
  }

  async function deleteGroup(groupId: string, conversationId: string) {
    if (!businessId) return
    if (!confirm('Delete this group? Messages will be lost.')) return
    try {
      await fetch(`/api/business/${businessId}/groups/${groupId}`, {
        method: 'DELETE',
      })
      toast.success('Group deleted')
      await load()
    } catch {
      toast.error('Network error')
    }
  }

  async function toggleGroupVisibility(groupId: string, current: string) {
    if (!businessId) return
    const next = current === 'public' ? 'private' : 'public'
    try {
      await fetch(`/api/business/${businessId}/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: next }),
      })
      toast.success(`Group is now ${next}`)
      await load()
    } catch {
      toast.error('Network error')
    }
  }

  async function openGroupConversation(conversationId: string) {
    // Refresh conversation list to ensure the group is present, then activate
    const freshRes = await fetch('/api/conversations', { cache: 'no-store' })
    if (freshRes.ok) {
      const convs = await freshRes.json()
      const target = (convs.conversations || []).find(
        (c: any) => c.id === conversationId
      )
      if (target) upsertConversation(target)
    }
    setActiveConversation(conversationId)
    onOpenConversation?.(conversationId)
    onOpenChange(false)
  }

  const isAdmin = business?.ownerId === user?.id ||
    business?.members.find((m) => m.userId === user?.id)?.role === 'admin'

  if (loading || !business) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WaslAvatar
              name={business.name}
              src={business.avatarPath}
              color={business.avatarColor}
              size={28}
            />
            <span className="truncate">{business.name}</span>
            {business.verified && (
              <ShieldCheck className="w-4 h-4 text-[var(--wasl-green)] shrink-0" />
            )}
          </DialogTitle>
          <DialogDescription>
            {business.category || 'Business'} · {business.members.length} member{business.members.length === 1 ? '' : 's'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="groups" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="groups">Groups</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>

          {/* Groups tab */}
          <TabsContent value="groups" className="flex-1 overflow-y-auto wasl-scroll -mx-1 px-1">
            {/* Existing groups */}
            <div className="space-y-2">
              {business.groups.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No groups yet. Create one below.
                </p>
              )}
              {business.groups.map((g) => (
                <div
                  key={g.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openGroupConversation(g.conversationId)}
                          className="font-medium text-sm truncate hover:underline text-left"
                        >
                          {g.name}
                        </button>
                        <span
                          className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0 cursor-pointer',
                            g.visibility === 'public'
                              ? 'bg-[var(--wasl-green)]/15 text-[var(--wasl-green)]'
                              : 'bg-muted text-muted-foreground'
                          )}
                          onClick={() => isAdmin && toggleGroupVisibility(g.id, g.visibility)}
                          title={isAdmin ? 'Click to toggle visibility' : g.visibility}
                        >
                          {g.visibility === 'public' ? (
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
                        <p className="text-xs text-muted-foreground mt-1">{g.description}</p>
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => deleteGroup(g.id, g.conversationId)}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-destructive shrink-0"
                        title="Delete group"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2 h-7 text-xs"
                    onClick={() => openGroupConversation(g.conversationId)}
                  >
                    Open chat
                  </Button>
                </div>
              ))}
            </div>

            {/* Create group (admin only) */}
            {isAdmin && (
              <div className="mt-4 pt-3 border-t border-border space-y-2.5">
                <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Create group
                </div>
                <Input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Group name (e.g. Customer Service)"
                  className="h-8 text-sm"
                />
                <Input
                  value={newGroupCat}
                  onChange={(e) => setNewGroupCat(e.target.value)}
                  placeholder="Category (optional)"
                  className="h-8 text-sm"
                />
                <Textarea
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="text-sm"
                />
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="grp-vis" className="text-xs cursor-pointer">
                      Public group
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      Public groups appear in business search; private are invite-only.
                    </p>
                  </div>
                  <Switch
                    id="grp-vis"
                    checked={newGroupVis === 'public'}
                    onCheckedChange={(v) => setNewGroupVis(v ? 'public' : 'private')}
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
                  disabled={creatingGroup || !newGroupName.trim()}
                  onClick={createGroup}
                >
                  {creatingGroup && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                  Create group
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Members tab */}
          <TabsContent value="members" className="flex-1 overflow-y-auto wasl-scroll -mx-1 px-1">
            <div className="space-y-1.5">
              {business.members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
                >
                  <WaslAvatar
                    name={m.name}
                    src={m.avatar}
                    color={m.avatarColor}
                    size={36}
                    showStatus
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{m.name}</span>
                      {m.userId === business.ownerId && (
                        <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      )}
                      {m.verified && (
                        <ShieldCheck className="w-3 h-3 text-[var(--wasl-green)] shrink-0" />
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {m.role === 'admin' ? 'Admin' : 'Member'} · {m.phone}
                    </div>
                  </div>
                  {isAdmin && m.userId !== business.ownerId && (
                    <button
                      onClick={() => removeMember(m.userId)}
                      className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                      title="Remove member"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Invite (admin only) */}
            {isAdmin && (
              <div className="mt-3 pt-3 border-t border-border space-y-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <UserPlus className="w-3 h-3" /> Invite member
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or phone"
                    className="pl-9 h-8 text-sm"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto wasl-scroll space-y-1">
                  {searchResults
                    .filter((u) => !business.members.find((m) => m.userId === u.id))
                    .map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50"
                      >
                        <WaslAvatar
                          name={u.name}
                          src={u.avatar}
                          color={u.avatarColor}
                          size={28}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{u.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {u.phone}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-2"
                          onClick={() => inviteMember(u.id)}
                        >
                          Invite
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
