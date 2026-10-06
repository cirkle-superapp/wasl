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
import { Switch } from '@/components/ui/switch'
import {
  Key,
  Plus,
  Copy,
  Check,
  Loader2,
  Trash2,
  Clock,
  Shield,
  Building2,
  GraduationCap,
  Briefcase,
  User,
  Eye,
  Pencil,
  AlertTriangle,
  CheckCircle2,
  Activity,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Scope = 'business' | 'school' | 'work' | 'personal' | 'read' | 'write' | 'schedule'

type Token = {
  id: string
  name: string
  prefix: string
  scopes: Scope[]
  rateLimitPerMin: number
  expiresAt: string | null
  lastUsedAt: string | null
  lastUsedIp: string | null
  totalCalls: number
  revokedAt: string | null
  isRevoked: boolean
  isExpired: boolean
  createdAt: string
}

const CATEGORY_SCOPES: { value: Scope; label: string; icon: typeof User; desc: string }[] = [
  { value: 'business', label: 'Business', icon: Building2, desc: 'Conversations where you send as a business' },
  { value: 'school', label: 'School', icon: GraduationCap, desc: 'School Connect conversations' },
  { value: 'work', label: 'Work', icon: Briefcase, desc: 'Conversations filed under "Work" folders' },
  { value: 'personal', label: 'Personal', icon: User, desc: '1-on-1 personal chats' },
]

const PERMISSION_SCOPES: { value: Scope; label: string; icon: typeof Eye; desc: string }[] = [
  { value: 'read', label: 'Read', icon: Eye, desc: 'List conversations + read messages' },
  { value: 'write', label: 'Write', icon: Pencil, desc: 'Send messages on your behalf' },
  { value: 'schedule', label: 'Schedule', icon: Clock, desc: 'Schedule multi-message batches' },
]

export function ApiTokensDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)

  const fetchTokens = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tokens', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setTokens(data.tokens || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchTokens()
  }, [open, fetchTokens])

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this token? Any integration using it will stop working immediately. This cannot be undone.')) return
    try {
      const res = await fetch(`/api/tokens/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const e = await res.json()
        toast.error(e?.error || 'Failed')
        return
      }
      toast.success('Token revoked')
      fetchTokens()
    } catch {
      toast.error('Network error')
    }
  }

  function copyToken(token: string) {
    navigator.clipboard.writeText(token).then(() => {
      toast.success('Token copied to clipboard')
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto wasl-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-4 h-4 text-[var(--wasl-green)]" />
              API Tokens
            </DialogTitle>
            <DialogDescription>
              Generate scoped personal access tokens to integrate Wasl with external
              platforms (CRM, school admin, business automation, custom dashboards).
            </DialogDescription>
          </DialogHeader>

          {/* Header banner: how it works */}
          <div className="rounded-lg p-3 bg-gradient-to-br from-[var(--wasl-green)]/8 to-transparent border border-[var(--wasl-green)]/20">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-[var(--wasl-green)] mt-0.5 shrink-0" />
              <div className="text-[11px] text-foreground/80 leading-relaxed">
                Tokens are <strong>SHA-256 hashed at rest</strong> — we never store the
                raw token after creation. Each token is scoped to specific conversation
                categories (business / school / work / personal) and permissions
                (read / write / schedule). Revoke any time.
              </div>
            </div>
          </div>

          {/* Create button */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {tokens.length} active token{tokens.length === 1 ? '' : 's'}
            </span>
            <Button
              onClick={() => setCreateOpen(true)}
              size="sm"
              className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              New token
            </Button>
          </div>

          {/* Token list */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="wasl-empty-orb mb-3 flex items-center justify-center" style={{ width: 64, height: 64 }}>
                <Key className="w-8 h-8 text-[var(--wasl-green)]" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium">No API tokens yet</p>
              <p className="text-[11px] mt-1 max-w-[280px]">
                Create one to let an external platform send messages, schedule batches,
                or read conversations on your behalf — scoped to only what you allow.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => (
                <TokenRow
                  key={t.id}
                  token={t}
                  onRevoke={() => handleRevoke(t.id)}
                />
              ))}
            </div>
          )}

          {/* Integration docs footer */}
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-[10px] text-muted-foreground font-mono">
            <div className="font-sans font-semibold mb-1 text-foreground">Integration endpoints:</div>
            <div>GET  /api/v1/conversations   — list scoped conversations</div>
            <div>POST /api/v1/send            — send a message (scopes: write + category)</div>
            <div>POST /api/v1/schedule        — schedule multi-msg batch (scopes: schedule + category)</div>
            <div className="mt-1.5">Auth: <code>Authorization: Bearer wasl_xxxxx</code></div>
          </div>
        </DialogContent>
      </Dialog>

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(raw) => {
          setNewToken(raw)
          fetchTokens()
        }}
      />

      {/* Show-once token reveal dialog */}
      <Dialog open={!!newToken} onOpenChange={(v) => { if (!v) setNewToken(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--wasl-green)]">
              <CheckCircle2 className="w-4 h-4" />
              Token created
            </DialogTitle>
            <DialogDescription>
              Copy your token now. For security, we will never show it again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-[11px] text-foreground/80 leading-relaxed">
                Treat this token like a password. Anyone with it can perform
                any action allowed by its scopes. If compromised, revoke immediately.
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Your API token</div>
              <code className="text-xs font-mono break-all">{newToken}</code>
            </div>
            <Button
              onClick={() => newToken && copyToken(newToken)}
              className="w-full bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              Copy token
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function TokenRow({ token, onRevoke }: { token: Token; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false)
  const lastUsed = token.lastUsedAt ? new Date(token.lastUsedAt) : null
  const lastUsedLabel = lastUsed ? lastUsed.toLocaleString() : 'Never'
  const expiresAt = token.expiresAt ? new Date(token.expiresAt) : null
  const isExpired = token.isExpired
  const isRevoked = token.isRevoked
  const isInactive = isExpired || isRevoked

  return (
    <div className={cn(
      'rounded-lg border p-3 transition-colors',
      isRevoked ? 'border-rose-500/30 bg-rose-500/5' :
      isExpired ? 'border-amber-500/30 bg-amber-500/5' :
      'border-border bg-card hover:border-[var(--wasl-green)]/30',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{token.name}</span>
            {isRevoked && (
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-500">
                Revoked
              </span>
            )}
            {isExpired && !isRevoked && (
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500">
                Expired
              </span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{token.prefix}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Activity className="w-2.5 h-2.5" />
            {token.totalCalls} calls
          </span>
          {!isInactive && (
            <Button
              onClick={onRevoke}
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              title="Revoke"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Scopes */}
      <div className="flex flex-wrap gap-1 mt-2">
        {token.scopes.map((s) => {
          const isCategory = (['business', 'school', 'work', 'personal'] as Scope[]).includes(s)
          const meta = isCategory
            ? CATEGORY_SCOPES.find((c) => c.value === s)!
            : PERMISSION_SCOPES.find((p) => p.value === s)!
          const Icon = meta.icon
          return (
            <span
              key={s}
              className={cn(
                'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium',
                isCategory
                  ? 'bg-[var(--wasl-green)]/10 text-[var(--wasl-green)]'
                  : 'bg-blue-500/10 text-blue-500',
              )}
            >
              <Icon className="w-2.5 h-2.5" />
              {meta.label}
            </span>
          )
        })}
      </div>

      {/* Meta */}
      <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] text-muted-foreground">
        <div>
          <div className="opacity-70">Last used</div>
          <div className="font-medium">{lastUsedLabel}</div>
        </div>
        <div>
          <div className="opacity-70">Rate limit</div>
          <div className="font-medium">{token.rateLimitPerMin}/min</div>
        </div>
        <div>
          <div className="opacity-70">Expires</div>
          <div className="font-medium">{expiresAt ? expiresAt.toLocaleDateString() : 'Never'}</div>
        </div>
      </div>
    </div>
  )
}

function CreateTokenDialog({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (rawToken: string) => void
}) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Scope[]>(['personal', 'read'])
  const [rateLimit, setRateLimit] = useState(60)
  const [expiresAt, setExpiresAt] = useState('')
  const [creating, setCreating] = useState(false)

  function toggleScope(s: Scope) {
    setScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
  }

  function reset() {
    setName('')
    setScopes(['personal', 'read'])
    setRateLimit(60)
    setExpiresAt('')
  }

  async function submit() {
    if (!name.trim()) { toast.error('Name is required'); return }
    if (scopes.length === 0) { toast.error('Select at least one scope'); return }
    // Require at least one category scope + at least one permission scope
    const hasCategory = scopes.some((s) => ['business', 'school', 'work', 'personal'].includes(s))
    const hasPermission = scopes.some((s) => ['read', 'write', 'schedule'].includes(s))
    if (!hasCategory) { toast.error('Select at least one category scope (business/school/work/personal)'); return }
    if (!hasPermission) { toast.error('Select at least one permission scope (read/write/schedule)'); return }

    setCreating(true)
    try {
      const body: any = { name: name.trim(), scopes, rateLimitPerMin: rateLimit }
      if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString()
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error || 'Failed'); return }
      onCreated(data.token)
      toast.success('Token created — copy it now!')
      reset()
      onOpenChange(false)
    } catch {
      toast.error('Network error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto wasl-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-[var(--wasl-green)]" />
            New API token
          </DialogTitle>
          <DialogDescription>
            Choose which conversation categories this token can access and what it can do.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="tok-name">Token name</Label>
            <Input
              id="tok-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HubSpot CRM sync"
              maxLength={100}
            />
            <p className="text-[10px] text-muted-foreground">A friendly label so you remember what this token is for.</p>
          </div>

          {/* Category scopes */}
          <div className="space-y-2">
            <div>
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-[var(--wasl-green)]" />
                Conversation access
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Pick one or more categories of conversations this token can access.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_SCOPES.map((c) => {
                const checked = scopes.includes(c.value)
                const Icon = c.icon
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => toggleScope(c.value)}
                    className={cn(
                      'text-left p-2 rounded-lg border text-xs transition-all',
                      checked
                        ? 'border-[var(--wasl-green)] bg-[var(--wasl-green)]/10'
                        : 'border-border hover:border-[var(--wasl-green)]/40 hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-center gap-1.5 font-medium">
                      <Icon className={cn('w-3 h-3', checked ? 'text-[var(--wasl-green)]' : 'text-muted-foreground')} />
                      {c.label}
                      {checked && <Check className="w-3 h-3 text-[var(--wasl-green)] ml-auto" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{c.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Permission scopes */}
          <div className="space-y-2">
            <div>
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-blue-500" />
                Permissions
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                What can this token DO within the categories above?
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PERMISSION_SCOPES.map((p) => {
                const checked = scopes.includes(p.value)
                const Icon = p.icon
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => toggleScope(p.value)}
                    className={cn(
                      'text-left p-2 rounded-lg border text-xs transition-all',
                      checked
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-border hover:border-blue-500/40 hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-center gap-1 font-medium">
                      <Icon className={cn('w-3 h-3', checked ? 'text-blue-500' : 'text-muted-foreground')} />
                      {p.label}
                      {checked && <Check className="w-3 h-3 text-blue-500 ml-auto" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Rate limit */}
          <div className="space-y-1.5">
            <Label htmlFor="tok-rate">Rate limit (per minute)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="tok-rate"
                type="number"
                min={1}
                max={1000}
                value={rateLimit}
                onChange={(e) => setRateLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 60)))}
                className="w-24"
              />
              <span className="text-[10px] text-muted-foreground">requests / minute</span>
            </div>
          </div>

          {/* Expiration */}
          <div className="space-y-1.5">
            <Label htmlFor="tok-exp">Expiration (optional)</Label>
            <Input
              id="tok-exp"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
            />
            <p className="text-[10px] text-muted-foreground">Leave empty for a token that never expires.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={creating}
            className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
          >
            {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Create token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
