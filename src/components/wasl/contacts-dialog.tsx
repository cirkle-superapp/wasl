'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Search,
  UserPlus,
  Phone,
  Trash2,
  Loader2,
  MessageSquare,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { WaslAvatar } from './wasl-avatar'
import { useWaslStore } from '@/lib/store'

type Contact = {
  id: string
  userId: string | null
  nickname: string | null
  phone: string | null
  notes: string | null
  addedAt: string
  name: string
  user: {
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
  } | null
}

export function ContactsDialog({
  open,
  onOpenChange,
  onStartChat,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onStartChat?: (userId: string) => void
}) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const loadContacts = useCallback(async () => {
    setLoading(true)
    try {
      const url = search
        ? `/api/contacts?q=${encodeURIComponent(search)}`
        : '/api/contacts'
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      setContacts(data.contacts || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    if (open) {
      setShowAdd(false)
      loadContacts()
    }
  }, [open, loadContacts])

  // Debounced search
  useEffect(() => {
    if (!open) return
    const t = setTimeout(loadContacts, 300)
    return () => clearTimeout(t)
  }, [search, open, loadContacts])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[var(--wasl-green)]" />
            Contacts
          </DialogTitle>
        </DialogHeader>

        {!showAdd ? (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Add button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdd(true)}
              className="w-full border-dashed"
            >
              <UserPlus className="w-4 h-4 mr-1.5" />
              Add new contact
            </Button>

            {/* Contact list */}
            <div className="flex-1 overflow-y-auto wasl-scroll -mx-2 px-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : contacts.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {search
                    ? 'No contacts found.'
                    : 'No contacts yet. Tap "Add new contact" to get started.'}
                </div>
              ) : (
                <div className="space-y-1">
                  {contacts.map((c) => (
                    <ContactRow
                      key={c.id}
                      contact={c}
                      onStartChat={onStartChat}
                      onDeleted={loadContacts}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <AddContactForm
            onDone={() => {
              setShowAdd(false)
              loadContacts()
            }}
            onCancel={() => setShowAdd(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ContactRow({
  contact,
  onStartChat,
  onDeleted,
}: {
  contact: Contact
  onStartChat?: (userId: string) => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const name = contact.nickname || contact.user?.name || contact.phone || 'Unknown'
  const subtitle = contact.user
    ? `@${contact.user.username}`
    : contact.phone || 'Not on Wasl'

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Contact removed')
        onDeleted()
      } else {
        toast.error('Failed to remove')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="group flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors">
      <WaslAvatar
        name={name}
        avatar={contact.user?.avatar}
        avatarColor={contact.user?.avatarColor || undefined}
        size={40}
        online={contact.user?.online}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate flex items-center gap-1">
          {name}
          {contact.user?.verified && (
            <Check className="w-3 h-3 text-[var(--wasl-teal)]" />
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
      </div>
      {contact.user && onStartChat && (
        <button
          type="button"
          onClick={() => onStartChat(contact.user!.id)}
          className="shrink-0 p-2 rounded-full text-muted-foreground hover:text-[var(--wasl-green)] hover:bg-[var(--wasl-green)]/10 transition-colors opacity-0 group-hover:opacity-100"
          title="Start chat"
          aria-label="Start chat"
        >
          <MessageSquare className="w-4 h-4" />
        </button>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="shrink-0 p-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
        title="Remove contact"
        aria-label="Remove contact"
      >
        {deleting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Trash2 className="w-4 h-4" />
        )}
      </button>
    </div>
  )
}

function AddContactForm({
  onDone,
  onCancel,
}: {
  onDone: () => void
  onCancel: () => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<
    Array<{ id: string; name: string; username: string; phone: string | null; avatar: string | null; avatarColor: string | null; verified: boolean }>
  >([])
  const [searching, setSearching] = useState(false)
  const [phone, setPhone] = useState('')
  const [nickname, setNickname] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Search users
  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(searchQuery)}`
        )
        const data = await res.json()
        setResults(data.users || [])
      } catch {
        // ignore
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  async function handleAddByUser(userId: string) {
    setSaving(true)
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, nickname: nickname || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Contact added')
        onDone()
      } else if (res.status === 409) {
        toast.error('Already in your contacts')
      } else {
        toast.error(data?.error || 'Failed')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddByPhone() {
    if (!phone.trim()) {
      toast.error('Phone number is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone,
          nickname: nickname || undefined,
          notes: notes || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Contact added')
        onDone()
      } else {
        toast.error(data?.error || 'Failed')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 flex-1 overflow-y-auto wasl-scroll">
      {/* Search for existing Wasl users */}
      <div className="space-y-2">
        <Label>Search Wasl users</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Name, username, or phone…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {searching && (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {results.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto wasl-scroll border border-border/60 rounded-lg p-1">
            {results.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => handleAddByUser(u.id)}
                disabled={saving}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-left"
              >
                <WaslAvatar
                  name={u.name}
                  avatar={u.avatar}
                  avatarColor={u.avatarColor || undefined}
                  size={32}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{u.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    @{u.username}
                  </div>
                </div>
                <UserPlus className="w-4 h-4 text-[var(--wasl-green)] shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">OR</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Add by phone (for non-Wasl users) */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5 text-[var(--wasl-green)]" />
          Add by phone number
        </Label>
        <Input
          placeholder="+20 100 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Input
          placeholder="Nickname (optional)"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
        <Textarea
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="resize-none"
        />
        <Button
          onClick={handleAddByPhone}
          disabled={saving || !phone.trim()}
          className="w-full bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
        >
          {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          Add contact
        </Button>
      </div>

      <Button variant="ghost" onClick={onCancel} className="w-full">
        Back
      </Button>
    </div>
  )
}
