'use client'

import { create } from 'zustand'

export type CurrentUser = {
  id: string
  phone: string
  name: string
  avatar: string | null
  avatarColor: string | null
  about: string
}

export type Participant = {
  userId: string
  name: string
  phone: string
  avatar: string | null
  avatarColor: string | null
  online: boolean
  lastSeen: string
  about: string
}

export type ChatMessage = {
  id: string
  conversationId: string
  senderId: string
  content: string
  type: string // text | image | system
  status: string // sent | delivered | read
  createdAt: string
  replyToId?: string | null
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

  showProfilePanel: boolean
  setShowProfilePanel: (show: boolean) => void

  replyTo: ChatMessage | null
  setReplyTo: (m: ChatMessage | null) => void
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

  showProfilePanel: false,
  setShowProfilePanel: (show) => set({ showProfilePanel: show }),

  replyTo: null,
  setReplyTo: (m) => set({ replyTo: m }),
}))
