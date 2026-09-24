'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Ban, ShieldOff, Trash2, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { WaslAvatar } from './wasl-avatar'

type BlockedUser = {
  id: string
  reason: string | null
  createdAt: string
  user: {
    id: string
    username: string
    name: string
    avatar: string | null
    avatarColor: string | null
    phone: string | null
    about: string
    online: boolean
    lastSeen: string
    verified: boolean
  }
}

export function BlockListDialog({
  open,
  onOpenChange,
  onBlockAdded,
  onUnblock,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onBlockAdded?: (userId: string) => void
  onUnblock?: (userId: string) => void
}) {
  const [loading, setLoading] = useState(true)
  const [blocks, setBlocks] = useState<BlockedUser[]>([])
  const [unblocking, setUnblocking] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/blocks', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setBlocks(data.blocks || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  async function unblock(blockId: string, userId: string) {
    setUnblocking(blockId)
    try {
      const res = await fetch(`/api/blocks/${blockId}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Failed to unblock')
        return
      }
      toast.success('User unblocked')
      onUnblock?.(userId)
      await load()
    } catch {
      toast.error('Network error')
    } finally {
      setUnblocking(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Blocked users
          </DialogTitle>
          <DialogDescription>
            Blocked users can&apos;t send you messages or see your online status.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto wasl-scroll">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mb-2" />
              <span className="text-sm">Loading blocked users…</span>
            </div>
          ) : blocks.length === 0 ? (
            <div className="flex flex-col items-center text-center py-10 px-4">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <ShieldOff className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold">No blocked users</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-[260px]">
                When you block someone, they&apos;ll appear here. You can unblock them anytime.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {blocks.map((b) => (
                <li key={b.id} className="px-4 py-2.5 flex items-center gap-2.5 hover:bg-muted/30 transition">
                  <WaslAvatar
                    name={b.user.name}
                    src={b.user.avatar}
                    color={b.user.avatarColor}
                    size={36}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{b.user.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">@{b.user.username}</div>
                    {b.reason && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">Reason: {b.reason}</div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={unblocking === b.id}
                    onClick={() => unblock(b.id, b.user.id)}
                  >
                    {unblocking === b.id ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <UserX className="h-3 w-3 mr-1" />
                    )}
                    Unblock
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
