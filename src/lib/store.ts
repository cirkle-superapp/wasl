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
  // Role within the group: 'admin' can add/remove members, change group name,
  // and pin messages. 'member' is the default. Absent for 1-on-1 conversations.
  role?: 'admin' | 'member'
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
  // Optional AI-generated transcription for voice messages. Populated by
  // POST /api/ai/transcribe. Null/undefined when no transcription is
  // available yet (the bubble then shows a "Transcribe" CTA).
  transcription?: string | null
  // ---- Read-receipt summary (sender-only, computed by the messages API) ----
  // `readByEveryone` is true when EVERY other participant has read the message.
  // `readCount` is how many of `totalRecipients` have read it.
  // `totalRecipients` is the number of OTHER participants (excluding the sender).
  // All three are only populated for messages the current user sent; they're
  // undefined for incoming messages. They drive the "Read by all" indicator
  // on the outgoing message bubble.
  readByEveryone?: boolean
  readCount?: number
  totalRecipients?: number
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
  // Optional group description ("about" text set by admins). Absent for 1-on-1s.
  description?: string | null
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
  // Bumps `readCount` by 1 for each affected outgoing message (clamped to
  // `totalRecipients`) and sets `readByEveryone = true` once the count reaches
  // the total. Used by the chat-window socket `message:status` handler when a
  // 'read' event arrives from another participant — the server doesn't push the
  // full per-recipient breakdown over the socket, so we incrementally update
  // the local summary on each 'read' receipt.
  bumpMessageReadCount: (
    conversationId: string,
    messageIds: string[]
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

  // ---- Search highlight ----------------------------------------------------
  // When the user clicks a message in the chat-search dialog, we set both
  // `highlightQuery` (the substring to wrap in <mark>) and
  // `highlightedMessageId` (the message bubble that should receive the
  // highlight). The chat-search dialog also dispatches the existing
  // `wasl:jump-to-message` window event so the chat window scrolls the
  // target message into view. The dialog is responsible for clearing these
  // (typically after a short delay) so the highlight naturally fades away.
  highlightQuery: string
  setHighlightQuery: (q: string) => void
  highlightedMessageId: string | null
  setHighlightedMessageId: (id: string | null) => void

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

  // ---- Bookmark (Save for later) -------------------------------------------
  // Set of message IDs the current user has bookmarked. Kept in sync with the
  // /api/bookmarks endpoint — fetched once on app load and updated whenever
  // the user adds/removes a bookmark from the message-bubble toolbar or the
  // bookmarks dialog.
  bookmarkedMessageIds: Set<string>
  setBookmarkedIds: (ids: string[]) => void
  setBookmarked: (messageId: string, bookmarked: boolean) => void

  // ---- Drafts (unsent message persistence) ---------------------------------
  // Map of `conversationId` → draft text for the current user. Kept in sync
  // with the /api/drafts endpoint — bootstrapped on app load and updated
  // optimistically as the user types in the message-input. The sidebar uses
  // this to render the "Draft" badge + "Draft: <preview>" last-message text.
  // A missing / empty entry means "no draft".
  drafts: Record<string, string>
  setDrafts: (drafts: Record<string, string>) => void
  setDraft: (conversationId: string, content: string) => void
  clearDraft: (conversationId: string) => void
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

  bumpMessageReadCount: (conversationId, messageIds) =>
    set((state) => {
      const existing = state.messagesByConversation[conversationId] || []
      const idSet = new Set(messageIds)
      let changed = false
      const updated = existing.map((m) => {
        if (!idSet.has(m.id)) return m
        // Only meaningful for outgoing messages the current user sent
        // (incoming messages have no `totalRecipients`).
        const total = m.totalRecipients
        if (!total || total <= 0) return m
        const current = m.readCount ?? 0
        // Don't double-count beyond the total (avoids runaway increments if
        // the same participant re-emits a 'read' event for the same message).
        if (current >= total) return m
        const nextReadCount = current + 1
        const nextReadByEveryone = nextReadCount >= total
        changed = true
        return {
          ...m,
          readCount: nextReadCount,
          readByEveryone: nextReadByEveryone,
          // Once anyone has read it, the message is at minimum 'read' status.
          status: m.status === 'read' ? m.status : 'read',
        }
      })
      if (!changed) return state
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

  highlightQuery: '',
  setHighlightQuery: (q) => set({ highlightQuery: q }),
  highlightedMessageId: null,
  setHighlightedMessageId: (id) => set({ highlightedMessageId: id }),

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

  // ---- Bookmark (Save for later) -------------------------------------------
  bookmarkedMessageIds: new Set<string>(),
  setBookmarkedIds: (ids) =>
    set({ bookmarkedMessageIds: new Set(ids) }),
  setBookmarked: (messageId, bookmarked) =>
    set((state) => {
      const next = new Set(state.bookmarkedMessageIds)
      if (bookmarked) next.add(messageId)
      else next.delete(messageId)
      return { bookmarkedMessageIds: next }
    }),

  // ---- Drafts (unsent message persistence) ---------------------------------
  drafts: {},
  setDrafts: (drafts) => set({ drafts }),
  setDraft: (conversationId, content) =>
    set((state) => {
      // Empty / whitespace-only drafts are treated as "no draft" — remove the
      // key entirely so the sidebar badge + preview disappear cleanly.
      if (!content.trim()) {
        if (!(conversationId in state.drafts)) return state
        const next = { ...state.drafts }
        delete next[conversationId]
        return { drafts: next }
      }
      return {
        drafts: { ...state.drafts, [conversationId]: content },
      }
    }),
  clearDraft: (conversationId) =>
    set((state) => {
      if (!(conversationId in state.drafts)) return state
      const next = { ...state.drafts }
      delete next[conversationId]
      return { drafts: next }
    }),
}))

function cryptoId(): string {
  return 'r_' + Math.random().toString(36).slice(2, 10)
}
