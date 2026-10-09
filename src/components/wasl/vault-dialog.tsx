'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  Lock,
  Key,
  Unlock,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  ShieldCheck,
  Eye,
  EyeOff,
  Clock,
  AlertTriangle,
  FileText,
  CreditCard,
  IdCard,
  KeyRound,
  StickyNote,
  Timer,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  deriveKey,
  verifyMasterPassword,
  encryptString,
  decryptString,
  passwordStrength,
  type CryptoKey as _CK,
} from '@/lib/vault'

type VaultStatus = {
  isSetup: boolean
  salt?: string
  verifier?: string
  entryCount?: number
  expiredCount?: number
}

type EncryptedEntry = {
  id: string
  type: string
  titleCipher: string
  contentCipher: string
  categoryCipher: string | null
  tagsCipher: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  accessedAt: string | null
}

type DecryptedEntry = EncryptedEntry & {
  titlePlain: string
  contentPlain: string
  categoryPlain: string | null
  tagsPlain: string[] | null
}

const TYPE_META: Record<string, { label: string; icon: typeof StickyNote; color: string }> = {
  password: { label: 'Password', icon: KeyRound, color: 'text-rose-500 bg-rose-500/10' },
  note: { label: 'Secure note', icon: StickyNote, color: 'text-[var(--wasl-green)] bg-[var(--wasl-green)]/10' },
  'id-document': { label: 'ID document', icon: IdCard, color: 'text-blue-500 bg-blue-500/10' },
  'recovery-code': { label: 'Recovery code', icon: Key, color: 'text-amber-500 bg-amber-500/10' },
  card: { label: 'Card', icon: CreditCard, color: 'text-purple-500 bg-purple-500/10' },
  custom: { label: 'Custom', icon: FileText, color: 'text-muted-foreground bg-muted/30' },
}

export function VaultDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [masterPassword, setMasterPassword] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null)
  const [entries, setEntries] = useState<DecryptedEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const keyRef = useRef<CryptoKey | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const res = await fetch('/api/vault', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setStatus(data)
    } catch { /* silent */ }
    finally { setLoadingStatus(false) }
  }, [])

  useEffect(() => {
    if (open) fetchStatus()
    else {
      // Lock the vault when the dialog closes
      setUnlocked(false)
      setCryptoKey(null)
      keyRef.current = null
      setMasterPassword('')
      setEntries([])
    }
  }, [open, fetchStatus])

  async function handleUnlock() {
    if (!status?.isSetup || !status.salt || !status.verifier) return
    if (!masterPassword) { toast.error('Enter master password'); return }
    const key = await deriveKey(masterPassword, status.salt)
    if (!key) { toast.error('Web Crypto not available'); return }
    const ok = await verifyMasterPassword(key, status.verifier)
    if (!ok) { toast.error('Wrong master password'); return }
    setCryptoKey(key)
    keyRef.current = key
    setUnlocked(true)
    setMasterPassword('')
    toast.success('Vault unlocked')
    fetchEntries(key)
  }

  async function fetchEntries(key: CryptoKey) {
    setLoadingEntries(true)
    try {
      const res = await fetch('/api/vault/entries', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const encrypted: EncryptedEntry[] = data.entries || []
      // Decrypt client-side
      const decrypted: DecryptedEntry[] = []
      for (const e of encrypted) {
        try {
          const titlePlain = await decryptString(key, e.titleCipher)
          const contentPlain = await decryptString(key, e.contentCipher)
          const categoryPlain = e.categoryCipher ? await decryptString(key, e.categoryCipher) : null
          let tagsPlain: string[] | null = null
          if (e.tagsCipher) {
            const t = await decryptString(key, e.tagsCipher)
            try { tagsPlain = JSON.parse(t) } catch { tagsPlain = null }
          }
          decrypted.push({ ...e, titlePlain, contentPlain, categoryPlain, tagsPlain })
        } catch {
          // Skip entries that fail decryption (e.g. wrong key / corrupted)
        }
      }
      setEntries(decrypted)
    } catch { /* silent */ }
    finally { setLoadingEntries(false) }
  }

  async function handleSetup(password: string) {
    if (password.length < 8) { toast.error('Master password must be at least 8 characters'); return }
    const res = await fetch('/api/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setup', masterPassword: password }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data?.error || 'Failed'); return }
    toast.success('Vault created — you can now add secrets')
    await fetchStatus()
    // Auto-unlock with the same password
    const key = await deriveKey(password, data.salt || status?.salt || '')
    if (key) {
      setCryptoKey(key)
      keyRef.current = key
      setUnlocked(true)
      fetchEntries(key)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this vault entry? The ciphertext will be permanently erased (cryptographic erasure).')) return
    try {
      const res = await fetch(`/api/vault/${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed'); return }
      toast.success('Entry cryptographically erased')
      if (keyRef.current) fetchEntries(keyRef.current)
    } catch { toast.error('Network error') }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
    // Auto-clear clipboard after 30s for security
    setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {})
    }, 30_000)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto wasl-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[var(--wasl-green)]" />
              Wasl Vault
              {unlocked && (
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--wasl-green)]/15 text-[var(--wasl-green)]">
                  Unlocked
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Zero-knowledge encrypted personal vault. Your secrets are encrypted
              in your browser with a master password — even Wasl's server can't decrypt them.
            </DialogDescription>
          </DialogHeader>

          {/* Security banner */}
          <div className="rounded-lg p-3 bg-gradient-to-br from-[var(--wasl-green)]/8 to-transparent border border-[var(--wasl-green)]/20">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--wasl-green)] mt-0.5 shrink-0" />
              <div className="text-[11px] text-foreground/80 leading-relaxed">
                <strong>AES-256-GCM</strong> encryption · <strong>PBKDF2</strong> key derivation
                (310,000 iterations) · key derived in-browser, never sent · entries
                cryptographically erased on deletion or self-destruct.
              </div>
            </div>
          </div>

          {loadingStatus ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !status?.isSetup ? (
            /* ---- Setup mode ---- */
            <SetupForm onSetup={handleSetup} />
          ) : !unlocked ? (
            /* ---- Locked mode ---- */
            <LockForm
              password={masterPassword}
              setPassword={setMasterPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              onUnlock={handleUnlock}
            />
          ) : (
            /* ---- Unlocked mode ---- */
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {entries.length} secret{entries.length === 1 ? '' : 's'} · auto-locks on dialog close
                </span>
                <Button
                  onClick={() => setCreateOpen(true)}
                  size="sm"
                  className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add secret
                </Button>
              </div>

              {loadingEntries ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <div className="wasl-empty-orb mb-3 flex items-center justify-center" style={{ width: 64, height: 64 }}>
                    <Lock className="w-8 h-8 text-[var(--wasl-green)]" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-medium">No secrets yet</p>
                  <p className="text-[11px] mt-1 max-w-[280px]">
                    Store passwords, recovery codes, ID numbers, or secure notes here.
                    Everything is encrypted with your master password.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {entries.map((e) => (
                    <EntryCard
                      key={e.id}
                      entry={e}
                      onDelete={() => handleDelete(e.id)}
                      onCopy={handleCopy}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create entry dialog */}
      <CreateEntryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        cryptoKey={cryptoKey}
        onCreated={() => {
          if (keyRef.current) fetchEntries(keyRef.current)
        }}
      />
    </>
  )
}

function SetupForm({ onSetup }: { onSetup: (password: string) => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [creating, setCreating] = useState(false)
  const strength = passwordStrength(password)

  async function submit() {
    if (password !== confirm) { toast.error('Passwords do not match'); return }
    if (password.length < 8) { toast.error('Min 8 characters'); return }
    setCreating(true)
    await onSetup(password)
    setCreating(false)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <div className="text-[11px] text-foreground/80 leading-relaxed">
          <strong>Set your master password.</strong> This password encrypts all
          vault entries. There is <strong>no recovery</strong> — if you forget it,
          your secrets are unrecoverable (we don't have them, and we can't reset
          the password without erasing all entries).
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="vault-master">Master password</Label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="vault-master"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-9 pr-10"
            placeholder="At least 8 characters"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {/* Strength meter */}
        {password && (
          <div className="space-y-1">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  strength.color === 'green' ? 'bg-[var(--wasl-green)]' :
                  strength.color === 'amber' ? 'bg-amber-500' :
                  'bg-rose-500',
                )}
                style={{ width: `${strength.score}%` }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground">
              Strength: <span className={cn(
                'font-semibold',
                strength.color === 'green' ? 'text-[var(--wasl-green)]' :
                strength.color === 'amber' ? 'text-amber-500' :
                'text-rose-500',
              )}>{strength.label}</span> · {strength.score}/100
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="vault-confirm">Confirm master password</Label>
        <Input
          id="vault-confirm"
          type={show ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-enter to confirm"
        />
      </div>

      <Button
        onClick={submit}
        disabled={creating || password.length < 8 || password !== confirm}
        className="w-full bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
      >
        {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Create vault
      </Button>
    </div>
  )
}

function LockForm({ password, setPassword, showPassword, setShowPassword, onUnlock }: {
  password: string
  setPassword: (v: string) => void
  showPassword: boolean
  setShowPassword: (v: boolean) => void
  onUnlock: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center py-4">
        <div className="wasl-empty-orb mb-3 flex items-center justify-center" style={{ width: 64, height: 64 }}>
          <Lock className="w-8 h-8 text-[var(--wasl-green)]" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium">Vault is locked</p>
        <p className="text-[11px] mt-1 text-muted-foreground">
          Enter your master password to decrypt your secrets.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="vault-unlock">Master password</Label>
        <div className="relative">
          <Unlock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="vault-unlock"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-9 pr-10"
            placeholder="Master password"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') onUnlock() }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <Button
        onClick={onUnlock}
        disabled={!password}
        className="w-full bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
      >
        <Unlock className="w-4 h-4 mr-2" />
        Unlock vault
      </Button>
    </div>
  )
}

function EntryCard({ entry, onDelete, onCopy }: {
  entry: DecryptedEntry
  onDelete: () => void
  onCopy: (text: string) => void
}) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const meta = TYPE_META[entry.type] || TYPE_META.note
  const Icon = meta.icon
  const expiresAt = entry.expiresAt ? new Date(entry.expiresAt) : null
  const isExpired = expiresAt && expiresAt < new Date()

  async function handleCopy() {
    await onCopy(entry.contentPlain)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn(
      'rounded-lg border p-3 transition-colors',
      isExpired ? 'border-rose-500/30 bg-rose-500/5' : 'border-border',
    )}>
      <div className="flex items-start gap-2">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
          meta.color,
        )}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{entry.titlePlain}</span>
            {entry.type === 'password' && (
              <span className="text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-500 shrink-0">
                Sensitive
              </span>
            )}
            {expiresAt && (
              <span className={cn(
                'text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5',
                isExpired ? 'bg-rose-500/15 text-rose-500' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
              )}>
                <Timer className="w-2 h-2" />
                {isExpired ? 'Expired' : `Expires ${expiresAt.toLocaleDateString()}`}
              </span>
            )}
          </div>

          <div className="text-[11px] text-muted-foreground mt-0.5">{meta.label}</div>

          {/* Content — masked for password type */}
          <div className="mt-2 rounded-md bg-muted/40 p-2 font-mono text-xs break-all">
            {entry.type === 'password' && !revealed
              ? '•'.repeat(Math.min(entry.contentPlain.length, 24))
              : entry.contentPlain}
          </div>

          <div className="flex items-center gap-1 mt-2">
            {entry.type === 'password' && (
              <Button
                onClick={() => setRevealed(!revealed)}
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
              >
                {revealed ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                {revealed ? 'Hide' : 'Reveal'}
              </Button>
            )}
            <Button
              onClick={handleCopy}
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
            >
              {copied ? <Check className="w-3 h-3 mr-1 text-[var(--wasl-green)]" /> : <Copy className="w-3 h-3 mr-1" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              onClick={onDelete}
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-destructive hover:text-destructive ml-auto"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Erase
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CreateEntryDialog({ open, onOpenChange, cryptoKey, onCreated }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  cryptoKey: CryptoKey | null
  onCreated: () => void
}) {
  const [type, setType] = useState('password')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [creating, setCreating] = useState(false)

  async function submit() {
    if (!cryptoKey) { toast.error('Vault not unlocked'); return }
    if (!title.trim() || !content.trim()) { toast.error('Title + content required'); return }
    setCreating(true)
    try {
      const titleCipher = await encryptString(cryptoKey, title.trim())
      const contentCipher = await encryptString(cryptoKey, content)
      const body: any = {
        action: 'add',
        type,
        titleCipher,
        contentCipher,
      }
      if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString()
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error || 'Failed'); return }
      toast.success('Secret added to vault')
      setTitle(''); setContent(''); setExpiresAt(''); setType('password')
      onOpenChange(false)
      onCreated()
    } catch {
      toast.error('Network error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto wasl-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-[var(--wasl-green)]" />
            Add vault entry
          </DialogTitle>
          <DialogDescription>
            Encrypted client-side before sending to the server.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Type selector */}
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(TYPE_META).map(([key, meta]) => {
                const Icon = meta.icon
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setType(key)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2 rounded-lg border text-[10px] transition-colors',
                      type === key
                        ? 'border-[var(--wasl-green)] bg-[var(--wasl-green)]/10 text-foreground'
                        : 'border-border hover:bg-muted/40 text-muted-foreground',
                    )}
                  >
                    <Icon className={cn('w-4 h-4', type === key ? 'text-[var(--wasl-green)]' : 'text-muted-foreground')} />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="entry-title">Title</Label>
            <Input
              id="entry-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Email password"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="entry-content">Secret content</Label>
            <textarea
              id="entry-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Password, recovery code, ID number, or note…"
              rows={4}
              maxLength={5000}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[var(--wasl-green)]/30"
            />
            <p className="text-[10px] text-muted-foreground">{content.length}/5000 chars</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="entry-expire" className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-amber-500" />
              Self-destruct (optional)
            </Label>
            <Input
              id="entry-expire"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
            />
            <p className="text-[10px] text-muted-foreground">
              When this date passes, the entry will be cryptographically erased.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={creating || !title.trim() || !content.trim() || !cryptoKey}
            className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
          >
            {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Encrypt + save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
