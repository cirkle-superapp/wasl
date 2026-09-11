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
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Loader2, Plus, X, BarChart3 } from 'lucide-react'
import { useWaslStore } from '@/lib/store'
import { getSocket } from '@/lib/socket'
import { toast } from 'sonner'

export function NewPollDialog({
  open,
  onOpenChange,
  conversationId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  conversationId: string | null
}) {
  const { user, addMessage, upsertConversation, conversations } =
    useWaslStore()
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [multiChoice, setMultiChoice] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (open) {
      setQuestion('')
      setOptions(['', ''])
      setMultiChoice(false)
      setCreating(false)
    }
  }, [open])

  async function create() {
    if (!conversationId || !user?.id) return
    const safeQuestion = question.trim()
    if (safeQuestion.length < 3) {
      toast.error('Question must be at least 3 characters')
      return
    }
    const safeOptions = options.map((o) => o.trim()).filter(Boolean)
    if (safeOptions.length < 2) {
      toast.error('At least 2 options are required')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          question: safeQuestion,
          options: safeOptions,
          multiChoice,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to create poll')
        return
      }
      if (data.message) {
        addMessage(conversationId, data.message)
        try {
          getSocket().emit('message:send', {
            conversationId,
            message: data.message,
          })
        } catch {}
      }
      const conv = conversations.find((c) => c.id === conversationId)
      if (conv && data.message) {
        upsertConversation({
          ...conv,
          lastMessage: data.message,
          updatedAt: data.message.createdAt,
        })
      }
      toast.success('Poll created')
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--wasl-green)]" />
            New Poll
          </DialogTitle>
          <DialogDescription>
            Create a poll and post it to the chat. Members can vote on options.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="poll-question">Question</Label>
            <Textarea
              id="poll-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What's your question?"
              rows={2}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label>Options ({options.filter((o) => o.trim()).length})</Label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const next = [...options]
                      next[i] = e.target.value
                      setOptions(next)
                    }}
                    placeholder={`Option ${i + 1}`}
                    maxLength={120}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                      className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOptions([...options, ''])}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add option
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="multi-choice" className="cursor-pointer">
                Multiple answers
              </Label>
              <p className="text-xs text-muted-foreground">
                Allow voting on more than one option
              </p>
            </div>
            <Switch
              id="multi-choice"
              checked={multiChoice}
              onCheckedChange={setMultiChoice}
            />
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
            disabled={creating || question.trim().length < 3 || options.filter((o) => o.trim()).length < 2}
            className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
          >
            {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create poll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
