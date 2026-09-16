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
  CheckCheck,
  Phone,
  Archive,
  Landmark,
} from 'lucide-react'
import { useWaslStore, type Conversation } from '@/lib/store'
import { WaslAvatar, WaslGroupAvatar } from './wasl-avatar'
import { WaslLogo } from './wasl-logo'
import { StoryBar } from './story-bar'
import { PhoneNumbersDialog } from './phone-numbers-dialog'
import { useColorTheme } from './color-theme-provider'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AnnouncementsDialog } from './announcements-dialog'
import { ConversationRowSkeleton } from '@/components/ui/skeleton'
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
  const [phoneNumbersOpen, setPhoneNumbersOpen] = useState(false)
  const [announcementsOpen, setAnnouncementsOpen] = useState(false)
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

  async function handleArchive(id: string) {
    try {
      await fetch(`/api/conversations/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      })
      removeConversation(id)
      toast.success('Chat archived')
    } catch {
      toast.error('Failed to archive')
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
            className="pl-9 pr-12 bg-muted/50 border-0 h-9 rounded-full"
          />
          {!search && (
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-medium text-muted-foreground/60 bg-muted-foreground/10 px-1.5 py-0.5 rounded border border-muted-foreground/15 pointer-events-none">
              ⌘K
            </kbd>
          )}
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

      {/* Official Announcements button */}
      <div className="px-3 pt-2 bg-[var(--wasl-sidebar-bg)]">
        <button
          onClick={() => setAnnouncementsOpen(true)}
          className="w-full flex items-center gap-2 p-2 rounded-lg border border-[var(--wasl-green)]/20 bg-[var(--wasl-green)]/5 hover:bg-[var(--wasl-green)]/10 transition-colors text-left"
        >
          <Landmark className="w-4 h-4 text-[var(--wasl-green)] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-foreground">Official Announcements</div>
            <div className="text-[10px] text-muted-foreground">Government · Banks · Utilities</div>
          </div>
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-2 py-2 border-b border-border bg-[var(--wasl-sidebar-bg)]">
        {[
          { key: 'all', label: 'All', count: conversations.length },
          { key: 'unread', label: 'Unread', count: conversations.filter(c => (c.unreadCount || 0) > 0).length },
          { key: 'groups', label: 'Groups', count: conversations.filter(c => c.isGroup).length },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as any)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5',
              filter === f.key
                ? 'bg-[var(--wasl-teal)] text-white'
                : 'bg-muted text-foreground hover:bg-muted/80'
            )}
          >
            {f.label}
            {f.count > 0 && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                filter === f.key
                  ? 'bg-white/20 text-white'
                  : f.key === 'unread'
                    ? 'bg-[var(--wasl-green)] text-white'
                    : 'bg-muted-foreground/20 text-muted-foreground'
              )}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto wasl-scroll bg-[var(--wasl-sidebar-bg)]">
        <StoryBar />
        {loading && conversations.length === 0 ? (
          // Skeleton placeholders while the conversation list loads.
          <div className="py-2">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <ConversationRowSkeleton key={i} />
            ))}
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
              onArchive={() => handleArchive(c.id)}
            />
          ))
        )}
      </div>

      {/* Profile footer */}
      <div className="border-t border-border bg-[var(--wasl-sidebar-bg)] px-3 py-2 flex items-center gap-2">
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
              {user?.phone || user?.username || 'No number'}
            </div>
          </div>
        </button>
        {/* Phone-number switcher button */}
        <button
          onClick={() => setPhoneNumbersOpen(true)}
          className="p-2 rounded-lg text-muted-foreground hover:text-[var(--wasl-green)] hover:bg-muted transition-colors shrink-0"
          title="Switch phone number"
        >
          <Phone className="w-4 h-4" />
        </button>
      </div>

      <PhoneNumbersDialog open={phoneNumbersOpen} onOpenChange={setPhoneNumbersOpen} />
      <AnnouncementsDialog open={announcementsOpen} onOpenChange={setAnnouncementsOpen} />
    </div>
  )
}

function ConversationRow({
  conversation,
  active,
  onlineUserIds,
  onClick,
  onDelete,
  onArchive,
}: {
  conversation: Conversation
  active: boolean
  onlineUserIds: Set<string>
  onClick: () => void
  onDelete: () => void
  onArchive: () => void
}) {
  const last = conversation.lastMessage
  const otherUser = !conversation.isGroup
    ? conversation.participants.find((p) => p.userId !== useWaslStore.getState().user?.id)
    : null
  const isOnline =
    !conversation.isGroup &&
    !!otherUser &&
    (onlineUserIds.has(otherUser.userId) || otherUser.online)

  // Reactive subscription to typing state for THIS conversation.
  // Select only the raw typing object (not a transformed array) so Zustand
  // can cache the reference and avoid infinite re-renders. The transformation
  // to display names is done in the component body below.
  const typingByConv = useWaslStore((s) => s.typingByConversation[conversation.id])
  const myId = useWaslStore((s) => s.user?.id)
  const typingNames = typingByConv
    ? Object.entries(typingByConv)
        .filter(([uid]) => uid !== myId)
        .map(([uid]) => {
          const p = conversation.participants.find((pp) => pp.userId === uid)
          return p?.name?.split(' ')[0] || 'Someone'
        })
    : []
  const isTyping = typingNames.length > 0

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

  // Typing preview text — "typing…" for 1-on-1, "Name is typing…" for groups
  const typingText =
    conversation.isGroup && typingNames.length === 1
      ? `${typingNames[0]} is typing…`
      : conversation.isGroup && typingNames.length > 1
        ? `${typingNames.length} people typing…`
        : 'typing…'

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
      {conversation.isGroup ? (
        <WaslGroupAvatar
          name={conversation.name}
          participants={conversation.participants.map((p) => ({
            name: p.name,
            avatar: p.avatar,
            avatarColor: p.avatarColor,
          }))}
          size={48}
        />
      ) : (
        <WaslAvatar
          name={conversation.name}
          src={conversation.avatar}
          color={conversation.avatarColor}
          size={48}
          online={isOnline}
          showStatus
        />
      )}
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
              isTyping
                ? 'text-[var(--wasl-green)] font-medium'
                : conversation.unreadCount > 0
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground'
            )}
          >
            {isTyping ? (
              <>
                {/* Animated typing dots for the sidebar preview */}
                <span className="inline-flex items-center gap-0.5 mr-0.5">
                  <span className="wasl-typing-dot w-1 h-1 bg-[var(--wasl-green)] rounded-full inline-block" />
                  <span className="wasl-typing-dot w-1 h-1 bg-[var(--wasl-green)] rounded-full inline-block" />
                  <span className="wasl-typing-dot w-1 h-1 bg-[var(--wasl-green)] rounded-full inline-block" />
                </span>
                <span className="truncate">{typingText}</span>
              </>
            ) : (
              <>
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
              </>
            )}
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
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive() }}>
                    <Archive className="w-4 h-4 mr-2" /> Archive chat
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-destructive focus:text-destructive">
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
