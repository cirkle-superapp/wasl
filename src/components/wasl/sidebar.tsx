'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Search,
  Plus,
  Settings,
  Users,
  LogOut,
  Moon,
  Sun,
  MoreVertical,
  Trash2,
  Loader2,
  CheckCheck,
} from 'lucide-react'
import { useWaslStore, type Conversation } from '@/lib/store'
import { WaslAvatar } from './wasl-avatar'
import { WaslLogo } from './wasl-logo'
import { useColorTheme } from './color-theme-provider'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatRelative, formatTimeShort } from '@/lib/time'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'

export function Sidebar({
  onNewChat,
  onOpenSettings,
}: {
  onNewChat: () => void
  onOpenSettings: () => void
}) {
  const {
    user,
    conversations,
    activeConversationId,
    setActiveConversation,
    setConversations,
    removeConversation,
    onlineUserIds,
  } = useWaslStore()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all')
  const [loading, setLoading] = useState(true)
  const { theme, setTheme } = useTheme()
  const { colorTheme } = useColorTheme()
  const isCirkle = colorTheme === 'cirkle'

  async function loadConversations() {
    setLoading(true)
    try {
      const res = await fetch(`/api/conversations?q=${encodeURIComponent(search)}`, {
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = await res.json()
      setConversations(data.conversations || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConversations()
     
  }, [search])

  const filtered = conversations.filter((c) => {
    if (filter === 'unread' && c.unreadCount === 0) return false
    if (filter === 'groups' && !c.isGroup) return false
    return true
  })

  async function handleLogout() {
    // Mark offline BEFORE clearing the session cookie (so /api/profile can
    // still identify the user).
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: false }),
        keepalive: true,
      })
    } catch {}
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }

  async function handleDeleteConversation(id: string) {
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      removeConversation(id)
      toast.success('Conversation deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  return (
    <div className="h-full flex flex-col bg-[var(--wasl-sidebar-bg)]">
      {/* Header */}
      <div
        className={cn(
          'text-white px-4 py-3 flex items-center justify-between gap-2',
          isCirkle ? 'wasl-gradient-hero-cirkle' : 'bg-[var(--wasl-teal)]'
        )}
      >
        <div className="flex items-center gap-2 min-w-0 text-white">
          <WaslLogo size={36} animated monochrome={!isCirkle} />
          <div className="font-bold text-lg leading-none truncate">Wasl</div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 hover:text-white"
              >
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Menu</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onNewChat}>
                <Plus className="w-4 h-4 mr-2" /> New chat
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenSettings}>
                <Settings className="w-4 h-4 mr-2" /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search & New chat */}
      <div className="px-3 py-2 bg-[var(--wasl-sidebar-bg)] border-b border-border flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or start a new chat"
            className="pl-9 bg-muted/50 border-0 h-9 rounded-full"
          />
        </div>
        <Button
          size="icon"
          className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white rounded-full h-9 w-9 shrink-0"
          onClick={onNewChat}
          title="New chat"
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-2 py-2 border-b border-border bg-[var(--wasl-sidebar-bg)]">
        {[
          { key: 'all', label: 'All' },
          { key: 'unread', label: 'Unread' },
          { key: 'groups', label: 'Groups' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as any)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              filter === f.key
                ? 'bg-[var(--wasl-teal)] text-white'
                : 'bg-muted text-foreground hover:bg-muted/80'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto wasl-scroll bg-[var(--wasl-sidebar-bg)]">
        {loading && conversations.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading chats...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center text-muted-foreground">
            <WaslLogo size={56} animated className="mb-3 opacity-80" />
            <p className="text-sm">
              {search
                ? 'No conversations match your search.'
                : 'No conversations yet. Tap the + button to start a new chat.'}
            </p>
          </div>
        ) : (
          filtered.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              active={c.id === activeConversationId}
              onlineUserIds={onlineUserIds}
              onClick={() => setActiveConversation(c.id)}
              onDelete={() => handleDeleteConversation(c.id)}
            />
          ))
        )}
      </div>

      {/* Profile footer */}
      <div className="border-t border-border bg-[var(--wasl-sidebar-bg)] px-3 py-2 flex items-center gap-3">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-muted/50 rounded-lg p-1 -m-1 transition-colors"
        >
          <WaslAvatar
            name={user?.name || 'Me'}
            src={user?.avatar}
            color={user?.avatarColor || undefined}
            size={36}
          />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {user?.phone}
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}

function ConversationRow({
  conversation,
  active,
  onlineUserIds,
  onClick,
  onDelete,
}: {
  conversation: Conversation
  active: boolean
  onlineUserIds: Set<string>
  onClick: () => void
  onDelete: () => void
}) {
  const last = conversation.lastMessage
  const otherUser = !conversation.isGroup
    ? conversation.participants.find((p) => p.userId !== useWaslStore.getState().user?.id)
    : null
  const isOnline =
    !conversation.isGroup &&
    !!otherUser &&
    (onlineUserIds.has(otherUser.userId) || otherUser.online)

  const isMine = last?.senderId === useWaslStore.getState().user?.id

  let preview = last?.content || 'Tap to start chatting'
  if (last?.type === 'image') preview = '📷 Photo'
  if (last?.type === 'system') preview = last?.content

  const previewSender =
    conversation.isGroup && last && !isMine && last.type !== 'system'
      ? `${conversation.participants.find((p) => p.userId === last.senderId)?.name?.split(' ')[0] || 'Someone'}: `
      : isMine && last && last.type !== 'system'
      ? 'You: '
      : ''

  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex items-center gap-3 px-3 py-3 cursor-pointer border-b border-border/60 transition-colors',
        active
          ? 'bg-muted/70'
          : 'hover:bg-muted/40 bg-[var(--wasl-sidebar-bg)]'
      )}
    >
      <WaslAvatar
        name={conversation.name}
        src={conversation.avatar}
        color={conversation.avatarColor}
        size={48}
        online={isOnline}
        showStatus={!conversation.isGroup}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div
            className={cn(
              'font-semibold truncate text-foreground',
              conversation.unreadCount > 0 && 'text-foreground'
            )}
          >
            {conversation.name}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {last && (
              <span
                className={cn(
                  'text-xs',
                  conversation.unreadCount > 0
                    ? 'text-[var(--wasl-green)] font-medium'
                    : 'text-muted-foreground'
                )}
              >
                {formatTimeShort(last.createdAt)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div
            className={cn(
              'text-sm truncate flex items-center gap-1',
              conversation.unreadCount > 0
                ? 'text-foreground font-medium'
                : 'text-muted-foreground'
            )}
          >
            {isMine && last && last.type !== 'system' && (
              <CheckCheck
                className={cn(
                  'w-4 h-4 shrink-0',
                  last.status === 'read'
                    ? 'text-sky-500'
                    : last.status === 'delivered'
                    ? 'text-sky-400'
                    : 'text-muted-foreground'
                )}
              />
            )}
            <span className="truncate">{previewSender + preview}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {conversation.unreadCount > 0 ? (
              <span className="bg-[var(--wasl-green)] text-white text-xs min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center font-semibold">
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </span>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-muted text-muted-foreground transition-opacity"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete() }}>
                    <Trash2 className="w-4 h-4 mr-2" /> Delete chat
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
