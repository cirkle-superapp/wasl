'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  Search,
  UserPlus,
  Phone,
  Trash2,
  Loader2,
  MessageSquare,
  Check,
  Upload,
  Download,
  FileText,
  ClipboardPaste,
  ArrowLeft,
  AtSign,
} from 'lucide-react'
import { toast } from 'sonner'
import { WaslAvatar } from './wasl-avatar'
import { AddByUsernameDialog } from './add-by-username-dialog'
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
  // Three views in the same dialog: list / add / import
  const [view, setView] = useState<'list' | 'add' | 'import'>('list')
  // Add-by-username dialog (Task 67)
  const [byUsernameOpen, setByUsernameOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

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
      setView('list')
      loadContacts()
    }
  }, [open, loadContacts])

  // Debounced search
  useEffect(() => {
    if (!open) return
    const t = setTimeout(loadContacts, 300)
    return () => clearTimeout(t)
  }, [search, open, loadContacts])

  // Trigger a CSV download of all contacts via the export endpoint.
  // Uses the same session cookie so no auth headers needed.
  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch('/api/contacts/export')
      if (!res.ok) {
        toast.error('Failed to export contacts')
        return
      }
      const blob = await res.blob()
      // Pull the filename out of the Content-Disposition header so the
      // download keeps the date-stamped name the server picked.
      const cd = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="?([^";]+)"?/)
      const filename = match?.[1] || 'wasl-contacts.csv'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Contacts exported')
    } catch {
      toast.error('Network error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[var(--wasl-green)]" />
            Contacts
          </DialogTitle>
        </DialogHeader>

        {view === 'list' && (
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

            {/* Add + Import buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setView('add')}
                className="w-full border-dashed"
              >
                <UserPlus className="w-4 h-4 mr-1.5" />
                Add new contact
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setView('import')}
                className="w-full border-dashed"
              >
                <Upload className="w-4 h-4 mr-1.5 text-[var(--wasl-green)]" />
                Import
              </Button>
            </div>

            {/* Add by username (Task 67) — quick-action button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setByUsernameOpen(true)}
              className="w-full border-dashed border-[var(--wasl-green)]/30 text-[var(--wasl-green)] hover:bg-[var(--wasl-green)]/5 hover:text-[var(--wasl-green)]"
            >
              <AtSign className="w-4 h-4 mr-1.5" />
              Add by @username
            </Button>

            {/* Export — secondary action, shown only when there are contacts */}
            {contacts.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExport}
                disabled={exporting}
                className="w-full text-muted-foreground"
              >
                {exporting ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-1.5" />
                )}
                Export {contacts.length} contacts as CSV
              </Button>
            )}

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
        )}

        {view === 'add' && (
          <AddContactForm
            onDone={() => {
              setView('list')
              loadContacts()
            }}
            onCancel={() => setView('list')}
          />
        )}

        {view === 'import' && (
          <ImportPanel
            onDone={() => {
              setView('list')
              loadContacts()
            }}
            onCancel={() => setView('list')}
          />
        )}
      </DialogContent>
      {/* Add-by-username dialog (Task 67) — closes the parent on success and
          triggers a contact reload. */}
      <AddByUsernameDialog
        open={byUsernameOpen}
        onOpenChange={setByUsernameOpen}
        onAdded={() => loadContacts()}
      />
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
        src={contact.user?.avatar}
        color={contact.user?.avatarColor || undefined}
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
                  src={u.avatar}
                  color={u.avatarColor || undefined}
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

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

// Minimal RFC-4180-ish CSV parser. Handles:
//   - quoted cells ("a,b" → a,b)
//   - escaped quotes ("a""b" → a"b)
//   - \r\n and \n line endings
//   - blank trailing lines are dropped
//
// We deliberately don't pull in PapaParse — this is small enough to inline.
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote
          cell += '"'
          i += 2
          continue
        }
        // End of quoted cell
        inQuotes = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    // Not in quotes
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      i++
      continue
    }
    if (ch === '\r') {
      // Swallow — handled by the \n branch
      i++
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i++
      continue
    }
    cell += ch
    i++
  }

  // Flush the last cell/row if there's pending content
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  // Drop empty rows (no non-whitespace content in any cell)
  return rows.filter((r) => r.some((c) => c.trim().length > 0))
}

// One line of CSV (used by the paste path so we don't break lines on quoted
// newlines accidentally — we expect paste input to be one record per line).
function parseCSVLine(line: string): string[] {
  // Reuse the full parser on a single line + take the first row.
  const rows = parseCSV(line + '\n')
  return rows[0] ?? []
}

// ---------------------------------------------------------------------------
// Import panel
// ---------------------------------------------------------------------------

type PreviewStatus = 'pending' | 'new' | 'matched' | 'duplicate'

type ParsedContact = {
  id: string
  name: string
  phone: string
  notes: string
  selected: boolean
  status: PreviewStatus
  matchedUser: { name: string; username: string } | null
}

// Heuristic: detect whether a CSV row looks like a header. We look for the
// literal words "name" / "phone" / "username" / "notes" in any cell.
function looksLikeHeader(row: string[]): boolean {
  const joined = row.map((c) => c.toLowerCase().trim()).join('|')
  return (
    joined.includes('name') ||
    joined.includes('phone') ||
    joined.includes('username') ||
    joined.includes('notes')
  )
}

// Guess whether a string looks like a phone number — used to decide which
// column is the name vs the phone when the user pastes "phone,name" or
// "name,phone" without a header.
function looksLikePhone(s: string): boolean {
  const cleaned = s.replace(/[\s\-()]/g, '')
  return /^[+]?[\d]{6,}$/.test(cleaned)
}

// Normalize phone for display/sending: trim + strip separators.
function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s\-()]/g, '')
}

// Convert a 2D array of CSV cells into ParsedContact[] (without server-side
// status — those come from the preview lookup afterwards).
function rowsToContacts(rows: string[][]): ParsedContact[] {
  if (rows.length === 0) return []
  const dataRows = looksLikeHeader(rows[0]) ? rows.slice(1) : rows

  const out: ParsedContact[] = []
  dataRows.forEach((rawRow, idx) => {
    const row = rawRow.map((c) => c.trim())
    if (row.length === 0 || row.every((c) => !c)) return

    let name = ''
    let phone = ''
    let notes = ''

    if (row.length === 1) {
      phone = row[0]
    } else if (row.length === 2) {
      // Two columns. Decide which is the phone by which looks phoneier.
      const firstIsPhone = looksLikePhone(row[0])
      const secondIsPhone = looksLikePhone(row[1])
      if (firstIsPhone && !secondIsPhone) {
        phone = row[0]
        name = row[1]
      } else if (secondIsPhone && !firstIsPhone) {
        name = row[0]
        phone = row[1]
      } else {
        // Both/neither look like phones — assume the conventional order
        // name,phone (matches the documented CSV header).
        name = row[0]
        phone = row[1]
      }
    } else {
      // 3+ columns: name, phone, notes (notes joins the rest)
      name = row[0]
      phone = row[1]
      notes = row.slice(2).join(', ')
    }

    phone = normalizePhone(phone)
    if (!phone) return

    out.push({
      id: `r${idx}`,
      name,
      phone,
      notes,
      selected: true,
      status: 'pending',
      matchedUser: null,
    })
  })

  return out
}

// Convert pasted textarea text into rows. The paste input can be either:
//   - One phone per line (with optional "Name,phone" per line)
//   - A single comma-separated blob with no newlines (just phones)
// We detect newlines vs. comma-only and parse accordingly.
function pasteToRows(text: string): string[][] {
  const trimmed = text.trim()
  if (!trimmed) return []

  if (text.includes('\n')) {
    // Each line is a record. Within a line, split on commas (using the full
    // CSV parser so quoted values are handled).
    return text
      .split(/\r?\n/)
      .map((line) => parseCSVLine(line))
      .filter((r) => r.some((c) => c.trim().length > 0))
  }

  // No newlines — treat as a single comma-separated list of phones.
  return trimmed
    .split(',')
    .map((s) => [s.trim()])
    .filter((r) => r[0].length > 0)
}

function ImportPanel({
  onDone,
  onCancel,
}: {
  onDone: () => void
  onCancel: () => void
}) {
  const [mode, setMode] = useState<'file' | 'paste'>('file')
  const [pasteText, setPasteText] = useState('')
  const [parsed, setParsed] = useState<ParsedContact[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset preview whenever the user starts a new parse run.
  function resetParsed() {
    setParsed([])
    setProgress(0)
  }

  // After parsing CSV/paste, hit the preview endpoint to enrich each row with
  // its real server-side status: 'new' | 'matched' | 'duplicate'.
  async function lookupStatuses(contacts: ParsedContact[]) {
    if (contacts.length === 0) return
    setParsing(true)
    try {
      const res = await fetch('/api/contacts/import?preview=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: contacts.map((c) => ({
            phone: c.phone,
            nickname: c.name || undefined,
            notes: c.notes || undefined,
          })),
        }),
      })
      if (!res.ok) {
        toast.error('Failed to check contact statuses')
        return
      }
      const data = await res.json()
      const results: Array<{
        phone: string
        status: 'new' | 'matched' | 'duplicate'
        matchedUser: { name: string; username: string } | null
      }> = data.results || []
      const byPhone = new Map(results.map((r) => [r.phone, r]))
      setParsed((prev) =>
        prev.map((c) => {
          const r = byPhone.get(c.phone)
          if (!r) return c
          return {
            ...c,
            status: r.status,
            matchedUser: r.matchedUser,
            // Duplicates default to unselected — they would be skipped anyway.
            selected: r.status === 'duplicate' ? false : c.selected,
          }
        })
      )
    } catch {
      toast.error('Network error')
    } finally {
      setParsing(false)
    }
  }

  async function handleFile(file: File) {
    resetParsed()
    setParsing(true)
    try {
      const text = await file.text()
      const rows = parseCSV(text)
      const contacts = rowsToContacts(rows)
      if (contacts.length === 0) {
        toast.error('No valid contacts found in CSV')
        return
      }
      setParsed(contacts)
      await lookupStatuses(contacts)
    } catch {
      toast.error('Failed to read CSV file')
    } finally {
      setParsing(false)
    }
  }

  async function handleParsePaste() {
    resetParsed()
    const rows = pasteToRows(pasteText)
    if (rows.length === 0) {
      toast.error('Paste at least one phone number')
      return
    }
    const contacts = rowsToContacts(rows)
    if (contacts.length === 0) {
      toast.error('No valid phone numbers found')
      return
    }
    setParsed(contacts)
    await lookupStatuses(contacts)
  }

  async function handleImport() {
    const selected = parsed.filter((c) => c.selected && c.status !== 'duplicate')
    if (selected.length === 0) {
      toast.error('No contacts selected')
      return
    }
    setImporting(true)
    setProgress(5)
    // Fake ramp while waiting for the server response — gives the user a
    // sense of progress and lets us cap at 90% so we don't lie about
    // completion before the response comes back.
    const ramp = setInterval(() => {
      setProgress((p) => (p < 90 ? p + 5 : p))
    }, 150)
    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: selected.map((c) => ({
            phone: c.phone,
            nickname: c.name || undefined,
            notes: c.notes || undefined,
          })),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setProgress(100)
        toast.success(
          `Imported ${data.imported} contacts (${data.matched} matched to Wasl users)`
        )
        if (data.skipped > 0) {
          toast.info(`${data.skipped} contacts were already in your list`)
        }
        // Small delay so the user sees the 100% bar before the panel closes.
        setTimeout(() => onDone(), 600)
      } else {
        toast.error(data?.error || 'Import failed')
        setProgress(0)
      }
    } catch {
      toast.error('Network error')
      setProgress(0)
    } finally {
      clearInterval(ramp)
      setImporting(false)
    }
  }

  function toggleRow(id: string) {
    setParsed((prev) =>
      prev.map((c) =>
        c.id === id && c.status !== 'duplicate'
          ? { ...c, selected: !c.selected }
          : c
      )
    )
  }

  function toggleAll() {
    const selectable = parsed.filter((c) => c.status !== 'duplicate')
    const allSelected = selectable.every((c) => c.selected)
    setParsed((prev) =>
      prev.map((c) =>
        c.status === 'duplicate' ? c : { ...c, selected: !allSelected }
      )
    )
  }

  const selectedCount = parsed.filter((c) => c.selected && c.status !== 'duplicate').length
  const newCount = parsed.filter((c) => c.status === 'new').length
  const matchedCount = parsed.filter((c) => c.status === 'matched').length
  const duplicateCount = parsed.filter((c) => c.status === 'duplicate').length

  return (
    <div className="flex-1 overflow-y-auto wasl-scroll space-y-3">
      {/* Header row with back button */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={importing}
          className="px-2"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium">Import contacts</span>
      </div>

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={mode === 'file' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('file')}
          disabled={importing}
          className={
            mode === 'file'
              ? 'bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white'
              : ''
          }
        >
          <FileText className="w-4 h-4 mr-1.5" />
          CSV file
        </Button>
        <Button
          variant={mode === 'paste' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('paste')}
          disabled={importing}
          className={
            mode === 'paste'
              ? 'bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white'
              : ''
          }
        >
          <ClipboardPaste className="w-4 h-4 mr-1.5" />
          Paste phones
        </Button>
      </div>

      {mode === 'file' ? (
        <div className="space-y-2">
          {/* Click-to-upload dropzone-style button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing || parsing}
            className="w-full border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-[var(--wasl-green)] hover:bg-[var(--wasl-green)]/5 transition-colors"
          >
            <Upload className="w-6 h-6 text-[var(--wasl-green)]" />
            <span className="text-sm font-medium">
              {parsing ? 'Parsing…' : 'Click to select a .csv file'}
            </span>
            <span className="text-xs text-muted-foreground">
              Format: name,phone[,notes] — first line may be a header
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
              // Reset the input so selecting the same file twice still fires.
              e.target.value = ''
            }}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Paste phone numbers</Label>
          <Textarea
            placeholder={
              '+20 100 123 4567\nJane, +20 100 765 4321\n+20 100 999 8888'
            }
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            className="resize-none font-mono text-xs"
            disabled={importing}
          />
          <p className="text-xs text-muted-foreground">
            One per line, or comma-separated. Each line may be{' '}
            <code>Name,phone</code>.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleParsePaste}
            disabled={importing || parsing || !pasteText.trim()}
            className="w-full"
          >
            {parsing ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-1.5" />
            )}
            Parse &amp; preview
          </Button>
        </div>
      )}

      {/* Progress bar — shown only while importing */}
      {importing && (
        <div className="space-y-1">
          <Progress value={progress} className="h-2 bg-[var(--wasl-green)]/15" />
          <p className="text-xs text-muted-foreground text-center">
            Importing… {progress}%
          </p>
        </div>
      )}

      {/* Preview table */}
      {parsed.length > 0 && (
        <div className="space-y-2">
          {/* Summary chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{parsed.length} parsed:</span>
            {newCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 font-medium">
                {newCount} new
              </span>
            )}
            {matchedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 font-medium">
                {matchedCount} matched
              </span>
            )}
            {duplicateCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted text-muted-foreground px-1.5 py-0.5 font-medium">
                {duplicateCount} duplicate
              </span>
            )}
          </div>

          {/* Table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="max-h-56 overflow-y-auto wasl-scroll">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 w-8">
                      <Checkbox
                        checked={
                          parsed.filter((c) => c.status !== 'duplicate')
                            .length > 0 &&
                          parsed
                            .filter((c) => c.status !== 'duplicate')
                            .every((c) => c.selected)
                        }
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-2 py-1.5 font-medium">Name</th>
                    <th className="px-2 py-1.5 font-medium">Phone</th>
                    <th className="px-2 py-1.5 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((c, idx) => (
                    <tr
                      key={c.id}
                      className={
                        idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'
                      }
                    >
                      <td className="px-2 py-1.5 align-middle">
                        <Checkbox
                          checked={c.selected}
                          disabled={c.status === 'duplicate' || parsing}
                          onCheckedChange={() => toggleRow(c.id)}
                          aria-label={`Select ${c.name || c.phone}`}
                        />
                      </td>
                      <td className="px-2 py-1.5 align-middle max-w-[120px]">
                        <div className="truncate">
                          {c.name || (
                            <span className="text-muted-foreground italic">
                              (no name)
                            </span>
                          )}
                        </div>
                        {c.matchedUser && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 truncate">
                            → @{c.matchedUser.username}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 align-middle font-mono">
                        {c.phone}
                      </td>
                      <td className="px-2 py-1.5 align-middle text-right">
                        <StatusBadge status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import button */}
          <Button
            onClick={handleImport}
            disabled={importing || parsing || selectedCount === 0}
            className="w-full bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
          >
            {importing ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-1.5" />
            )}
            Import {selectedCount} {selectedCount === 1 ? 'contact' : 'contacts'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetParsed()
              setPasteText('')
            }}
            disabled={importing}
            className="w-full text-muted-foreground"
          >
            Clear &amp; start over
          </Button>
        </div>
      )}
    </div>
  )
}

// Small status pill component. Kept inline because it's only used here.
function StatusBadge({ status }: { status: PreviewStatus }) {
  if (status === 'new') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 text-[10px] font-medium">
        New
      </span>
    )
  }
  if (status === 'matched') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium">
        Matched
      </span>
    )
  }
  if (status === 'duplicate') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium">
        Duplicate
      </span>
    )
  }
  // 'pending' — while the preview lookup is in flight
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium">
      <Loader2 className="w-3 h-3 animate-spin" />
    </span>
  )
}
