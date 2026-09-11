'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus, X, ShieldCheck, Sparkles } from 'lucide-react'
import { useWaslStore } from '@/lib/store'
import { COMMIT_TYPES, COMMIT_CURRENCIES } from '@/lib/commit'
import { getSocket } from '@/lib/socket'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function NewCommitDialog({
  open,
  onOpenChange,
  conversationId,
  counterpartyId,
  counterpartyName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  conversationId: string | null
  counterpartyId: string | null
  counterpartyName?: string
}) {
  const { user, upsertCommit, addMessage, upsertConversation, conversations } =
    useWaslStore()
  const [type, setType] = useState<string>('price')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState<string>('')
  const [currency, setCurrency] = useState<string>('SAR')
  const [deadline, setDeadline] = useState<string>('')
  const [conditions, setConditions] = useState<string[]>([''])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (open) {
      setType('price')
      setTitle('')
      setDescription('')
      setAmount('')
      setCurrency('SAR')
      setDeadline('')
      setConditions([''])
      setCreating(false)
    }
  }, [open])

  const validConditions = conditions.map((c) => c.trim()).filter(Boolean)

  async function create() {
    if (!conversationId || !counterpartyId || !user?.id) return
    const safeTitle = title.trim()
    if (!safeTitle) {
      toast.error('Please add a title for this commit')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/commits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          counterpartyId,
          type,
          title: safeTitle,
          description: description.trim(),
          amount: amount ? Number(amount) : 0,
          currency,
          deadline: deadline || undefined,
          conditions: validConditions,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to create commit')
        return
      }
      if (data.commit) upsertCommit(data.commit)
      if (data.message) {
        addMessage(conversationId, data.message)
        // Broadcast the commit message to others in the conversation
        try {
          const socket = getSocket()
          socket.emit('message:send', {
            conversationId,
            message: data.message,
          })
          if (data.commit) {
            socket.emit('commit:updated', {
              conversationId,
              commitId: data.commit.id,
            })
          }
        } catch {
          // ignore socket errors
        }
      }
      // Update sidebar conversation preview
      const conv = conversations.find((c) => c.id === conversationId)
      if (conv && data.message) {
        upsertConversation({
          ...conv,
          lastMessage: data.message,
          updatedAt: data.message.createdAt,
        })
      }
      toast.success('Commit created · hash secured · awaiting counterparty signature')
      onOpenChange(false)
    } catch (e) {
      console.error(e)
      toast.error('Network error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto wasl-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--wasl-green)]" />
            New Commit
          </DialogTitle>
          <DialogDescription>
            Turn this conversation into a verified agreement with{' '}
            <span className="font-medium text-foreground">
              {counterpartyName || 'the other party'}
            </span>
            . Cirkle-inspired commitments secured by a hash.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type selector */}
          <div className="space-y-2">
            <Label>Commit type</Label>
            <div className="grid grid-cols-5 gap-2">
              {COMMIT_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setType(t.key)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors',
                    type === t.key
                      ? 'border-[var(--wasl-green)] bg-[var(--wasl-green)]/10 text-foreground'
                      : 'border-border hover:bg-muted/60 text-muted-foreground'
                  )}
                >
                  <span className="text-lg">{t.emoji}</span>
                  <span className="font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="commit-title">Title</Label>
            <Input
              id="commit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Used MacBook Air M2 — 500 SAR"
              maxLength={120}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="commit-desc">Description (optional)</Label>
            <Textarea
              id="commit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the agreement in detail…"
              rows={3}
              maxLength={500}
            />
          </div>

          {/* Amount + currency */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="commit-amount">Amount</Label>
              <Input
                id="commit-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commit-currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="commit-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMIT_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Deadline */}
          <div className="space-y-2">
            <Label htmlFor="commit-deadline">Deadline (optional)</Label>
            <Input
              id="commit-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            <Label>Conditions</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Add the terms both parties are agreeing to.
            </p>
            <div className="space-y-2">
              {conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={c}
                    onChange={(e) => {
                      const next = [...conditions]
                      next[i] = e.target.value
                      setConditions(next)
                    }}
                    placeholder={`Condition ${i + 1}`}
                    maxLength={120}
                  />
                  {conditions.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setConditions(conditions.filter((_, idx) => idx !== i))
                      }
                      className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {conditions.length < 8 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConditions([...conditions, ''])}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add condition
                </Button>
              )}
            </div>
          </div>

          {/* Fairness teaser */}
          <div className="flex items-start gap-2 rounded-lg bg-muted/60 border border-border p-3 text-xs">
            <Sparkles className="w-4 h-4 text-[var(--wasl-green)] mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground mb-0.5">
                Fairness check runs on save
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Wasl scores the proposed amount against a market range and shows
                a confidence note before the counterparty signs.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={create}
            disabled={creating || !title.trim()}
            className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
          >
            {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create commit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
