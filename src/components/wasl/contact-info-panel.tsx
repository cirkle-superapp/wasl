'use client'

import { useEffect, useState } from 'react'
import {
  Phone,
  Bell,
  Trash2,
  X,
  Image as ImageIcon,
  Users,
  Star,
  Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WaslAvatar } from './wasl-avatar'
import { useWaslStore } from '@/lib/store'
import { formatLastSeen } from '@/lib/time'
import { toast } from 'sonner'

export function ContactInfoPanel({ onClose }: { onClose: () => void }) {
  const {
    activeConversationId,
    conversations,
    user,
    onlineUserIds,
    setShowProfilePanel,
  } = useWaslStore()
  const conversation =
    conversations.find((c) => c.id === activeConversationId) || null
  const [media, setMedia] = useState<string[]>([])

  useEffect(() => {
    async function loadMedia() {
      if (!activeConversationId) return
      try {
        const res = await fetch(
          `/api/conversations/${activeConversationId}/messages?limit=100`,
          { cache: 'no-store' }
        )
        if (!res.ok) return
        const data = await res.json()
        setMedia(
          (data.messages as any[])
            .filter((m) => m.type === 'image')
            .map((m) => m.content)
            .slice(0, 9)
        )
      } catch {
        // ignore
      }
    }
    loadMedia()
  }, [activeConversationId])

  if (!conversation) return null

  const otherUser =
    !conversation.isGroup
      ? conversation.participants.find((p) => p.userId !== user?.id)
      : null
  const isOnline =
    !!otherUser &&
    (onlineUserIds.has(otherUser.userId) || otherUser.online)

  async function handleDelete() {
    if (!conversation) return
    if (!confirm('Delete this conversation? This cannot be undone.')) return
    try {
      await fetch(`/api/conversations/${conversation.id}`, {
        method: 'DELETE',
      })
      useWaslStore.getState().removeConversation(conversation.id)
      setShowProfilePanel(false)
      toast.success('Conversation deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  return (
    <div className="h-full flex flex-col bg-[var(--wasl-sidebar-bg)] border-l border-border w-full">
      <div className="bg-[var(--wasl-teal)] text-white px-4 py-3 flex items-center justify-between">
        <div className="font-medium">Info</div>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto wasl-scroll p-4 space-y-6">
        {/* Hero */}
        <div className="flex flex-col items-center text-center">
          <WaslAvatar
            name={conversation.name}
            src={conversation.avatar}
            color={conversation.avatarColor}
            size={120}
            online={isOnline}
            showStatus={!conversation.isGroup}
          />
          <h2 className="text-xl font-semibold mt-3">{conversation.name}</h2>
          {!conversation.isGroup && otherUser && (
            <p className="text-sm text-muted-foreground">
              {formatLastSeen(otherUser.lastSeen, isOnline)}
            </p>
          )}
          {conversation.isGroup && (
            <p className="text-sm text-muted-foreground">
              Group · {conversation.participants.length} members
            </p>
          )}
        </div>

        {/* About */}
        {!conversation.isGroup && otherUser && (
          <div className="bg-white dark:bg-[var(--wasl-chat-bg)] rounded-lg p-3 border border-border/60">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              About
            </div>
            <p className="text-sm">{otherUser.about || 'No bio yet'}</p>
          </div>
        )}

        {/* Phone */}
        {!conversation.isGroup && otherUser && (
          <div className="bg-white dark:bg-[var(--wasl-chat-bg)] rounded-lg p-3 border border-border/60">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Phone
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-[var(--wasl-teal)]" />
              <p className="text-sm font-medium">{otherUser.phone}</p>
            </div>
          </div>
        )}

        {/* Participants */}
        {conversation.isGroup && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Members
            </div>
            <div className="space-y-1">
              {conversation.participants.map((p) => (
                <div
                  key={p.userId}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/60"
                >
                  <WaslAvatar
                    name={p.name}
                    src={p.avatar}
                    color={p.avatarColor}
                    size={36}
                    online={onlineUserIds.has(p.userId) || p.online}
                    showStatus
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {p.name}
                      {p.userId === user?.id && (
                        <span className="text-xs text-muted-foreground ml-1">
                          (you)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {formatLastSeen(p.lastSeen, onlineUserIds.has(p.userId) || p.online)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Media */}
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
            <ImageIcon className="w-3.5 h-3.5" /> Shared media
          </div>
          {media.length === 0 ? (
            <p className="text-sm text-muted-foreground">No media shared yet</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {media.map((src, i) => (
                 
                <img
                  key={i}
                  src={src}
                  alt="shared"
                  className="w-full aspect-square object-cover rounded-md cursor-pointer"
                />
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start text-foreground hover:bg-muted"
            onClick={() => toast.info('Notifications toggle is coming soon')}
          >
            <Bell className="w-4 h-4 mr-3" /> Mute notifications
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => toast.info('Starred messages is coming soon')}
          >
            <Star className="w-4 h-4 mr-3" /> Starred messages
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => toast.info('Encryption details')}
          >
            <Shield className="w-4 h-4 mr-3" /> Encryption
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
          >
            <Trash2 className="w-4 h-4 mr-3" /> Delete chat
          </Button>
        </div>
      </div>
    </div>
  )
}
