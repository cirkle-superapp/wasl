'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Clock,
  Loader2,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Repeat,
  Users,
  Building2,
  GraduationCap,
  Briefcase,
  User,
  Folder as FolderIcon,
  Check,
  Send,
  Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useWaslStore, type Conversation } from '@/lib/store'

const REPEAT_OPTIONS = [
  { value: 'none', label: 'One-time', desc: 'Send once' },
  { value: 'daily', label: 'Daily', desc: 'Repeat every day' },
  { value: 'weekly', label: 'Weekly', desc: 'Repeat every week' },
  { value: 'monthly', label: 'Monthly', desc: 'Repeat every month' },
] as const

type BatchMessage = {
  id: string
  content: string
  delaySeconds: number
}

type RecipientSelection = {
  // Specific conversations selected (recipientType = "conversation")
  conversationIds: Set<string>
  // Scope shortcuts (recipientType = scope)
  scopes: Set<'business' | 'school' | 'work' | 'personal'>
  // Folder recipients
  folderIds: Set<string>
}

const SCOPE_SHORTCUTS = [
  { value: 'business' as const, label: 'All Business', icon: Building2, desc: 'Conversations where you send as a business' },
  { value: 'school' as const, label: 'All School', icon: GraduationCap, desc: 'School Connect conversations' },
  { value: 'work' as const, label: 'All Work', icon: Briefcase, desc: 'Conversations in your "Work" folders' },
  { value: 'personal' as const, label: 'All Personal', icon: User, desc: 'All 1-on-1 personal chats' },
]

export function ScheduleBatchDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const conversations = useWaslStore((s) => s.conversations)
  const [name, setName] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [repeat, setRepeat] = useState<string>('none')
  const [repeatUntil, setRepeatUntil] = useState('')
  const [messages, setMessages] = useState<BatchMessage[]>([
    { id: 'm1', content: '', delaySeconds: 0 },
  ])
  const [recipients, setRecipients] = useState<RecipientSelection>({
    conversationIds: new Set(),
    scopes: new Set(),
    folderIds: new Set(),
  })
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([])
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')

  // Fetch folders for the folder-recipient option
  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/folders')
      if (!res.ok) return
      const data = await res.json()
      setFolders((data.folders || []).map((f: any) => ({ id: f.id, name: f.name })))
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    if (open) fetchFolders()
  }, [open, fetchFolders])

  function addMessage() {
    setMessages((prev) => [
      ...prev,
      { id: `m${prev.length + 1}-${Date.now()}`, content: '', delaySeconds: 30 },
    ])
  }

  function removeMessage(id: string) {
    setMessages((prev) => prev.length > 1 ? prev.filter((m) => m.id !== id) : prev)
  }

  function updateMessage(id: string, patch: Partial<BatchMessage>) {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m))
  }

  function moveMessage(id: string, dir: -1 | 1) {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id)
      if (idx < 0) return prev
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(idx, 1)
      next.splice(newIdx, 0, moved)
      // Re-assign order based on new position
      return next.map((m, i) => ({ ...m, delaySeconds: i === 0 ? 0 : m.delaySeconds }))
    })
  }

  function toggleConversation(id: string) {
    setRecipients((prev) => {
      const next = new Set(prev.conversationIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, conversationIds: next }
    })
  }

  function toggleScope(s: 'business' | 'school' | 'work' | 'personal') {
    setRecipients((prev) => {
      const next = new Set(prev.scopes)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return { ...prev, scopes: next }
    })
  }

  function toggleFolder(id: string) {
    setRecipients((prev) => {
      const next = new Set(prev.folderIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, folderIds: next }
    })
  }

  // Filtered conversations (by search)
  const filteredConversations = conversations.filter((c) => {
    if (!search) return true
    return c.name.toLowerCase().includes(search.toLowerCase())
  })

  // Total recipients summary
  const totalRecipients =
    recipients.conversationIds.size +
    recipients.scopes.size +
    recipients.folderIds.size
  const validMessages = messages.filter((m) => m.content.trim().length > 0)

  // Preview: how many messages × recipients will be sent
  const previewOps = validMessages.length * Math.max(totalRecipients, 1)

  function reset() {
    setName('')
    setScheduledFor('')
    setRepeat('none')
    setRepeatUntil('')
    setMessages([{ id: 'm1', content: '', delaySeconds: 0 }])
    setRecipients({ conversationIds: new Set(), scopes: new Set(), folderIds: new Set() })
    setSearch('')
  }

  async function submit() {
    if (!scheduledFor) { toast.error('Pick a date/time'); return }
    const schedDate = new Date(scheduledFor)
    if (isNaN(schedDate.getTime())) { toast.error('Invalid date'); return }
    if (schedDate.getTime() < Date.now()) { toast.error('Date must be in the future'); return }
    if (validMessages.length === 0) { toast.error('Add at least 1 message with content'); return }
    if (totalRecipients === 0) { toast.error('Select at least 1 recipient'); return }

    setSending(true)
    try {
      const body: any = {
        name: name.trim() || undefined,
        scheduledFor: schedDate.toISOString(),
        repeat,
        messages: validMessages.map((m) => ({
          content: m.content,
          delaySeconds: m.delaySeconds || 0,
        })),
        recipients: [
          ...Array.from(recipients.conversationIds).map((id) => ({
            recipientType: 'conversation' as const,
            conversationId: id,
          })),
          ...Array.from(recipients.scopes).map((s) => ({
            recipientType: s as const,
          })),
          ...Array.from(recipients.folderIds).map((fid) => ({
            recipientType: 'folder' as const,
            folderId: fid,
          })),
        ],
      }
      if (repeat !== 'none' && repeatUntil) {
        body.repeatUntil = new Date(repeatUntil).toISOString()
      }
      const res = await fetch('/api/scheduled-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error || 'Failed'); return }
      toast.success(`Batch scheduled: ${validMessages.length} message${validMessages.length === 1 ? '' : 's'} × ${totalRecipients} recipient${totalRecipients === 1 ? '' : 's'} = ${previewOps} total sends`)
      reset()
      onOpenChange(false)
    } catch {
      toast.error('Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto wasl-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4 text-[var(--wasl-green)]" />
            Schedule multi-message blast
          </DialogTitle>
          <DialogDescription>
            Send multiple messages to multiple recipients (specific convs,
            entire categories, or folders) at a chosen day/time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name + When */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="batch-name">Batch name (optional)</Label>
              <Input
                id="batch-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Black Friday promo"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-when" className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-[var(--wasl-green)]" />
                Send at
              </Label>
              <Input
                id="batch-when"
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
          </div>

          {/* Repeat */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Repeat className="w-3 h-3 text-[var(--wasl-green)]" />
              Repeat
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {REPEAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRepeat(opt.value)}
                  className={cn(
                    'text-left p-2 rounded-lg border text-xs transition-colors',
                    repeat === opt.value
                      ? 'border-[var(--wasl-green)] bg-[var(--wasl-green)]/10 text-foreground'
                      : 'border-border hover:border-[var(--wasl-green)]/40 hover:bg-muted/50 text-muted-foreground',
                  )}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                </button>
              ))}
            </div>
            {repeat !== 'none' && (
              <Input
                type="date"
                value={repeatUntil}
                onChange={(e) => setRepeatUntil(e.target.value)}
                min={scheduledFor ? scheduledFor.split('T')[0] : undefined}
                className="mt-2"
                placeholder="End date (optional)"
              />
            )}
          </div>

          {/* Messages */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-[var(--wasl-green)]" />
                Messages ({validMessages.length})
              </Label>
              <Button onClick={addMessage} size="sm" variant="outline" className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" />
                Add message
              </Button>
            </div>
            <div className="space-y-2">
              {messages.map((m, i) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-border p-2.5 space-y-2 wasl-anim-slide-up"
                >
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--wasl-green)]/15 text-[var(--wasl-green)] text-[10px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex-1">
                      {i === 0 ? 'First message (sends immediately when batch fires)' : `Sends ${m.delaySeconds}s after previous`}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => moveMessage(m.id, -1)}
                        disabled={i === 0}
                        title="Move up"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => moveMessage(m.id, 1)}
                        disabled={i === messages.length - 1}
                        title="Move down"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => removeMessage(m.id)}
                        disabled={messages.length === 1}
                        title="Remove"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <textarea
                    value={m.content}
                    onChange={(e) => updateMessage(m.id, { content: e.target.value })}
                    placeholder={`Message ${i + 1} content…`}
                    maxLength={5000}
                    rows={2}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[var(--wasl-green)]/30"
                  />
                  {i > 0 && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>Delay:</span>
                      <Input
                        type="number"
                        min={0}
                        max={86400}
                        value={m.delaySeconds}
                        onChange={(e) => updateMessage(m.id, { delaySeconds: Math.max(0, Math.min(86400, Number(e.target.value) || 0)) })}
                        className="h-7 w-20 text-xs"
                      />
                      <span>seconds after previous</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Users className="w-3 h-3 text-[var(--wasl-green)]" />
              Recipients ({totalRecipients})
            </Label>

            {/* Scope shortcuts */}
            <div className="grid grid-cols-2 gap-2">
              {SCOPE_SHORTCUTS.map((s) => {
                const checked = recipients.scopes.has(s.value)
                const Icon = s.icon
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleScope(s.value)}
                    className={cn(
                      'text-left p-2 rounded-lg border text-xs transition-all flex items-center gap-2',
                      checked
                        ? 'border-[var(--wasl-green)] bg-[var(--wasl-green)]/10'
                        : 'border-border hover:border-[var(--wasl-green)]/40 hover:bg-muted/40',
                    )}
                  >
                    <Icon className={cn('w-3.5 h-3.5 shrink-0', checked ? 'text-[var(--wasl-green)]' : 'text-muted-foreground')} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{s.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{s.desc}</div>
                    </div>
                    {checked && <Check className="w-3 h-3 text-[var(--wasl-green)] shrink-0" />}
                  </button>
                )
              })}
            </div>

            {/* Folder shortcuts (if any) */}
            {folders.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 mt-2">Folders</div>
                <div className="flex flex-wrap gap-1.5">
                  {folders.map((f) => {
                    const checked = recipients.folderIds.has(f.id)
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleFolder(f.id)}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border',
                          checked
                            ? 'border-[var(--wasl-green)] bg-[var(--wasl-green)]/10 text-[var(--wasl-green)]'
                            : 'border-border text-muted-foreground hover:bg-muted/40',
                        )}
                      >
                        <FolderIcon className="w-2.5 h-2.5" />
                        {f.name}
                        {checked && <Check className="w-2.5 h-2.5" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Specific conversations */}
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Or pick specific conversations</div>
              <Input
                placeholder="Search conversations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="max-h-48 overflow-y-auto wasl-scroll rounded-md border border-border/60">
                {filteredConversations.length === 0 ? (
                  <div className="p-3 text-[11px] text-muted-foreground text-center">No matching conversations</div>
                ) : (
                  filteredConversations.slice(0, 30).map((c) => (
                    <ConversationCheckbox
                      key={c.id}
                      conversation={c}
                      checked={recipients.conversationIds.has(c.id)}
                      onToggle={() => toggleConversation(c.id)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Preview summary */}
          <div className="rounded-lg p-3 bg-gradient-to-br from-[var(--wasl-green)]/8 to-transparent border border-[var(--wasl-green)]/20 wasl-anim-slide-up">
            <div className="text-[10px] uppercase tracking-wide text-[var(--wasl-green)] font-semibold mb-1">
              Preview
            </div>
            <div className="text-sm">
              <strong>{validMessages.length}</strong> message{validMessages.length === 1 ? '' : 's'}
              {' × '}
              <strong>{Math.max(totalRecipients, 0)}</strong> recipient{totalRecipients === 1 ? '' : 's'}
              {validMessages.length > 0 && totalRecipients > 0 && (
                <>
                  {' = '}
                  <strong className="text-[var(--wasl-green)]">{previewOps}</strong> total sends
                </>
              )}
            </div>
            {scheduledFor && (
              <div className="text-[11px] text-muted-foreground mt-1">
                On {new Date(scheduledFor).toLocaleString()}
                {repeat !== 'none' && ` · repeats ${repeat}`}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={sending}
            className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
          >
            {sending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Schedule batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConversationCheckbox({ conversation, checked, onToggle }: {
  conversation: Conversation
  checked: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/40 transition-colors border-b border-border/30 last:border-b-0',
        checked && 'bg-[var(--wasl-green)]/10',
      )}
    >
      <div className={cn(
        'w-4 h-4 rounded border flex items-center justify-center shrink-0',
        checked ? 'bg-[var(--wasl-green)] border-[var(--wasl-green)]' : 'border-border',
      )}>
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{conversation.name}</div>
        <div className="text-[10px] text-muted-foreground">
          {conversation.isGroup ? 'Group' : '1-on-1'}
          {conversation.lastMessage && ` · ${conversation.lastMessage.content.slice(0, 40)}`}
        </div>
      </div>
    </button>
  )
}
