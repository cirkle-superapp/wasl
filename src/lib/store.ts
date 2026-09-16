'use client'

import { create } from 'zustand'

export type UserPhoneNumber = {
  id: string
  number: string
  label: string | null
  active: boolean
}

export type CurrentUser = {
  id: string
  username: string
  name: string
  email: string | null
  phone: string | null
  avatar: string | null
  avatarColor: string | null
  about: string
  verified?: boolean
  phoneNumbers?: UserPhoneNumber[]
  // Privacy / message-protection settings
  defaultProtectMessages?: boolean
  privacyAlwaysAllow?: boolean
  // Ghost Mode — hides online status, last seen, typing indicator
  ghostMode?: boolean
  // Hides last seen timestamp from others
  hideLastSeen?: boolean
}

export type Participant = {
  userId: string
  username?: string
  name: string
  phone: string | null
  avatar: string | null
  avatarColor: string | null
  online: boolean
  lastSeen: string
  about: string
  verified?: boolean
}

export type Reaction = {
  id: string
  userId: string
  emoji: string
}

export type ChatMessage = {
  id: string
  conversationId: string
  senderId: string
  content: string
  type: string // text | image | system | commit
  status: string // sent | delivered | read
  createdAt: string
  replyToId?: string | null
  commitId?: string | null
  starred?: boolean
  reactions?: Reaction[]
  // Privacy / message-protection flag.
  // `undefined`/`null` → use the sender's `defaultProtectMessages` setting.
  // `true` → message IS protected (recipient cannot screenshot or forward).
  // `false` → message is NOT protected (anyone can screenshot or forward).
  protected?: boolean | null
  // When true, the message has been edited at least once. The edit history
  // can be fetched from /api/messages/[id]/edits.
  edited?: boolean
  // When true, the message is pinned to the top of the conversation.
  pinned?: boolean
}

// Cirkle-inspired Commit (AI-verified agreement) attached to a conversation.
export type Commit = {
  id: string
  conversationId: string
  type: string
  typeLabel: string
  typeEmoji: string
  title: string
  description: string
  amount: number
  currency: string
  deadline: string | null
  conditions: string[]
  status: string // pending | active | completed | disputed
  fairnessScore: number
  fairnessNote: string
  hash: string
  creator: { id: string; name: string; avatar: string | null; avatarColor: string | null; phone: string }
  counterparty: { id: string; name: string; avatar: string | null; avatarColor: string | null; phone: string }
  creatorSigned: boolean
  counterpartySigned: boolean
  creatorSignedAt: string | null
  counterpartySignedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type Conversation = {
  id: string
  name: string
  avatar: string | null
  avatarColor: string | null
  isGroup: boolean
  participants: Participant[]
  lastMessage: ChatMessage | null
  unreadCount: number
  updatedAt: string
}

type WaslState = {
  user: CurrentUser | null
  setUser: (u: CurrentUser | null) => void

  conversations: Conversation[]
  setConversations: (c: Conversation[]) => void
  upsertConversation: (c: Conversation) => void
  removeConversation: (id: string) => void

  activeConversationId: string | null
  setActiveConversation: (id: string | null) => void

  messagesByConversation: Record<string, ChatMessage[]>
  setMessages: (conversationId: string, messages: ChatMessage[]) => void
  addMessage: (conversationId: string, message: ChatMessage) => void
  prependMessages: (conversationId: string, messages: ChatMessage[]) => void
  updateMessageStatus: (
    conversationId: string,
    messageIds: string[],
    status: string
  ) => void

  onlineUserIds: Set<string>
  setOnlineUsers: (ids: string[]) => void
  setUserOnline: (userId: string, online: boolean) => void

  typingByConversation: Record<string, Record<string, boolean>>
  setTyping: (
    conversationId: string,
    userId: string,
    typing: boolean
  ) => void

  // Socket connection status — used to show a small "connecting…" indicator
  // in the chat header when the real-time socket is reconnecting.
  socketStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  setSocketStatus: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void

  showProfilePanel: boolean
  setShowProfilePanel: (show: boolean) => void

  replyTo: ChatMessage | null
  setReplyTo: (m: ChatMessage | null) => void

  // Commits
  commitsByConversation: Record<string, Commit[]>
  setCommits: (conversationId: string, commits: Commit[]) => void
  upsertCommit: (c: Commit) => void

  // Message actions: reactions, star, delete
  toggleReaction: (
    conversationId: string,
    messageId: string,
    reaction: { id?: string; userId: string; emoji: string } | null
  ) => void
  setStarred: (
    conversationId: string,
    messageId: string,
    starred: boolean
  ) => void
  removeMessage: (conversationId: string, messageId: string) => void
  updateMessage: (
    conversationId: string,
    messageId: string,
    patch: Partial<ChatMessage>
  ) => void
}

export const useWaslStore = create<WaslState>((set) => ({
  user: null,
  setUser: (u) => set({ user: u }),

  conversations: [],
  setConversations: (c) => set({ conversations: c }),
  upsertConversation: (c) =>
    set((state) => {
      const idx = state.conversations.findIndex((x) => x.id === c.id)
      let next: Conversation[]
      if (idx === -1) {
        next = [c, ...state.conversations]
      } else {
        next = [...state.conversations]
        next[idx] = c
      }
      // Sort by last message / updatedAt
      next.sort((a, b) => {
        const at = a.lastMessage?.createdAt
          ? new Date(a.lastMessage.createdAt).getTime()
          : new Date(a.updatedAt).getTime()
        const bt = b.lastMessage?.createdAt
          ? new Date(b.lastMessage.createdAt).getTime()
          : new Date(b.updatedAt).getTime()
        return bt - at
      })
      return { conversations: next }
    }),
  removeConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId:
        state.activeConversationId === id ? null : state.activeConversationId,
    })),

  activeConversationId: null,
  setActiveConversation: (id) => set({ activeConversationId: id }),

  messagesByConversation: {},
  setMessages: (conversationId, messages) =>
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: messages,
      },
    })),
  addMessage: (conversationId, message) =>
    set((state) => {
      const existing = state.messagesByConversation[conversationId] || []
      // Avoid duplicates by id
      if (existing.some((m) => m.id === message.id)) {
        return state
      }
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...existing, message],
        },
      }
    }),
  prependMessages: (conversationId, messages) =>
    set((state) => {
      const existing = state.messagesByConversation[conversationId] || []
      const seenIds = new Set(existing.map((m) => m.id))
      const unique = messages.filter((m) => !seenIds.has(m.id))
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...unique, ...existing],
        },
      }
    }),
  updateMessageStatus: (conversationId, messageIds, status) =>
    set((state) => {
      const existing = state.messagesByConversation[conversationId] || []
      const idSet = new Set(messageIds)
      const updated = existing.map((m) =>
        idSet.has(m.id) ? { ...m, status } : m
      )
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: updated,
        },
      }
    }),

  onlineUserIds: new Set<string>(),
  setOnlineUsers: (ids) =>
    set({
      onlineUserIds: new Set(ids),
    }),
  setUserOnline: (userId, online) =>
    set((state) => {
      const next = new Set(state.onlineUserIds)
      if (online) next.add(userId)
      else next.delete(userId)
      return { onlineUserIds: next }
    }),

  typingByConversation: {},
  setTyping: (conversationId, userId, typing) =>
    set((state) => {
      const conv = {
        ...(state.typingByConversation[conversationId] || {}),
      }
      if (typing) {
        conv[userId] = true
      } else {
        delete conv[userId]
      }
      return {
        typingByConversation: {
          ...state.typingByConversation,
          [conversationId]: conv,
        },
      }
    }),

  socketStatus: 'connecting',
  setSocketStatus: (status) => set({ socketStatus: status }),

  showProfilePanel: false,
  setShowProfilePanel: (show) => set({ showProfilePanel: show }),

  replyTo: null,
  setReplyTo: (m) => set({ replyTo: m }),

  commitsByConversation: {},
  setCommits: (conversationId, commits) =>
    set((state) => ({
      commitsByConversation: {
        ...state.commitsByConversation,
        [conversationId]: commits,
      },
    })),
  upsertCommit: (c) =>
    set((state) => {
      const existing = state.commitsByConversation[c.conversationId] || []
      const idx = existing.findIndex((x) => x.id === c.id)
      const next = idx === -1 ? [c, ...existing] : existing.map((x) => (x.id === c.id ? c : x))
      return {
        commitsByConversation: {
          ...state.commitsByConversation,
          [c.conversationId]: next,
        },
      }
    }),

  toggleReaction: (conversationId, messageId, reaction) =>
    set((state) => {
      const msgs = state.messagesByConversation[conversationId] || []
      const next = msgs.map((m) => {
        if (m.id !== messageId) return m
        const existing = m.reactions || []
        // Remove any existing reaction by this user, then add the new one.
        const filtered = existing.filter((r) => r.userId !== reaction?.userId)
        const updated = reaction
          ? [...filtered, { id: reaction.id || cryptoId(), userId: reaction.userId, emoji: reaction.emoji }]
          : filtered
        return { ...m, reactions: updated }
      })
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: next,
        },
      }
    }),

  setStarred: (conversationId, messageId, starred) =>
    set((state) => {
      const msgs = state.messagesByConversation[conversationId] || []
      const next = msgs.map((m) =>
        m.id === messageId ? { ...m, starred } : m
      )
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: next,
        },
      }
    }),

  removeMessage: (conversationId, messageId) =>
    set((state) => {
      const msgs = state.messagesByConversation[conversationId] || []
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: msgs.filter((m) => m.id !== messageId),
        },
      }
    }),

  updateMessage: (conversationId, messageId, patch) =>
    set((state) => {
      const msgs = state.messagesByConversation[conversationId] || []
      const next = msgs.map((m) =>
        m.id === messageId ? { ...m, ...patch } : m
      )
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: next,
        },
      }
    }),
}))

function cryptoId(): string {
  return 'r_' + Math.random().toString(36).slice(2, 10)
}
