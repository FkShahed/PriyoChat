import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ARCHIVED_KEY = '@priyo_archived_convos';
const MUTED_KEY = '@priyo_muted_convos';
const DELETED_KEY = '@priyo_deleted_convos';

const useChatStore = create((set, get) => ({
  conversations: [],
  messages: {}, // { conversationId: [message, ...] }
  typingUsers: {}, // { conversationId: userId | null }
  onlineUsers: {}, // { userId: bool }
  activeConversationId: null, // the conversation the user is currently viewing

  archivedConversationIds: [],
  mutedConversationIds: {},
  deletedConversationIds: [],

  initPreferences: async () => {
    try {
      const [archived, muted, deleted] = await Promise.all([
        AsyncStorage.getItem(ARCHIVED_KEY),
        AsyncStorage.getItem(MUTED_KEY),
        AsyncStorage.getItem(DELETED_KEY),
      ]);
      set({
        archivedConversationIds: archived ? JSON.parse(archived) : [],
        mutedConversationIds: muted ? JSON.parse(muted) : {},
        deletedConversationIds: deleted ? JSON.parse(deleted) : [],
      });
    } catch (err) {
      console.warn('[useChatStore] initPreferences error:', err.message);
    }
  },

  archiveConversation: async (convoId) => {
    const { archivedConversationIds } = get();
    if (!archivedConversationIds.includes(convoId)) {
      const updated = [convoId, ...archivedConversationIds];
      set({ archivedConversationIds: updated });
      try {
        await AsyncStorage.setItem(ARCHIVED_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Save archive error:', e);
      }
    }
  },

  unarchiveConversation: async (convoId) => {
    const { archivedConversationIds } = get();
    const updated = archivedConversationIds.filter((id) => id !== convoId);
    set({ archivedConversationIds: updated });
    try {
      await AsyncStorage.setItem(ARCHIVED_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Save unarchive error:', e);
    }
  },

  toggleMuteConversation: async (convoId) => {
    const { mutedConversationIds } = get();
    const isCurrentlyMuted = !!mutedConversationIds[convoId];
    const updated = { ...mutedConversationIds, [convoId]: !isCurrentlyMuted };
    if (isCurrentlyMuted) {
      delete updated[convoId];
    }
    set({ mutedConversationIds: updated });
    try {
      await AsyncStorage.setItem(MUTED_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Save mute error:', e);
    }
  },

  deleteConversation: async (convoId) => {
    const { conversations, messages, deletedConversationIds, archivedConversationIds } = get();
    // Don't remove from conversations array so the user stays in "online friends" (Active Now list)
    const updatedMessages = { ...messages };
    delete updatedMessages[convoId];
    const updatedDeleted = [convoId, ...deletedConversationIds.filter((id) => id !== convoId)];
    const updatedArchived = archivedConversationIds.filter((id) => id !== convoId);

    set({
      messages: updatedMessages,
      deletedConversationIds: updatedDeleted,
      archivedConversationIds: updatedArchived,
    });

    try {
      await Promise.all([
        AsyncStorage.setItem(DELETED_KEY, JSON.stringify(updatedDeleted)),
        AsyncStorage.setItem(ARCHIVED_KEY, JSON.stringify(updatedArchived)),
      ]);
    } catch (e) {
      console.warn('Save delete convo error:', e);
    }
  },

  isMuted: (convoId) => !!get().mutedConversationIds[convoId],
  isArchived: (convoId) => get().archivedConversationIds.includes(convoId),

  setConversations: (conversations) => {
    const valid = Array.isArray(conversations) ? conversations : [];
    set({ conversations: valid });
  },

  setActiveConversationId: (id) => set({ activeConversationId: id }),

  addOrUpdateConversation: (convo) => {
    const { conversations, deletedConversationIds } = get();
    if (deletedConversationIds.includes(convo._id)) {
      // If a new message comes in for a deleted conversation, restore it
      const updatedDeleted = deletedConversationIds.filter((id) => id !== convo._id);
      set({ deletedConversationIds: updatedDeleted });
      AsyncStorage.setItem(DELETED_KEY, JSON.stringify(updatedDeleted)).catch(() => {});
    }

    const idx = conversations.findIndex((c) => c._id === convo._id);
    if (idx > -1) {
      const updated = [...conversations];
      updated[idx] = { ...updated[idx], ...convo };
      // Sort by updatedAt
      updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      set({ conversations: updated });
    } else {
      set({ conversations: [convo, ...conversations] });
    }
  },

  setMessages: (conversationId, messages) => {
    const sorted = [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    set((state) => ({
      messages: { ...state.messages, [conversationId]: sorted },
    }));
  },

  appendMessages: (conversationId, newMessages) => {
    const { messages } = get();
    const existing = messages[conversationId] || [];
    const map = new Map();
    for (const m of existing) {
      if (m?._id) map.set(m._id.toString(), m);
    }
    for (const m of newMessages) {
      if (m?._id) map.set(m._id.toString(), m);
    }
    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
    set({
      messages: {
        ...messages,
        [conversationId]: merged,
      },
    });
  },

  addMessage: (conversationId, message) => {
    const { messages } = get();
    const existing = messages[conversationId] || [];
    if (existing.find((m) => m._id?.toString() === message._id?.toString())) return;

    // Replace optimistic temporary message if one exists matching this new message
    const tempIndex = existing.findIndex(
      (m) =>
        m._id?.toString().startsWith('temp_') &&
        m.status === 'sending' &&
        (m.text === message.text ||
          (m.images?.length > 0 && message.images?.length > 0) ||
          (m.isVoiceNote && message.isVoiceNote))
    );

    let updated;
    if (tempIndex > -1) {
      updated = [...existing];
      updated[tempIndex] = message;
    } else {
      updated = [...existing, message];
    }

    updated.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    set({
      messages: {
        ...messages,
        [conversationId]: updated,
      },
    });
  },

  replaceOptimisticMessage: (conversationId, tempId, realMessage) => {
    const { messages } = get();
    const existing = messages[conversationId] || [];
    const alreadyHasReal = existing.some((m) => m._id?.toString() === realMessage._id?.toString());
    if (alreadyHasReal) {
      const filtered = existing.filter((m) => m._id !== tempId);
      set({ messages: { ...messages, [conversationId]: filtered } });
      return;
    }
    const updated = existing.map((m) => (m._id === tempId ? realMessage : m));
    set({ messages: { ...messages, [conversationId]: updated } });
  },

  updateMessageStatus: (conversationId, messageId, status, seenAt) => {
    const { messages } = get();
    const convoMsgs = messages[conversationId] || [];
    const updated = convoMsgs.map((m) =>
      m._id === messageId
        ? {
            ...m,
            status,
            ...(seenAt ? { seenAt } : {}),
          }
        : m
    );
    set({ messages: { ...messages, [conversationId]: updated } });
  },

  clearUnreadCount: (conversationId) => {
    const { conversations } = get();
    // Safely get current user ID to verify who sent the last message
    const currentUserId = require('./useAuthStore').default?.getState?.()?.user?._id;
    
    const updated = conversations.map((c) => {
      if (c._id === conversationId) {
        let updatedLastMessage = c.lastMessage;
        if (c.lastMessage) {
          const senderId = typeof c.lastMessage.sender === 'object' ? c.lastMessage.sender?._id : c.lastMessage.sender;
          // If the last message was NOT sent by me, then me opening the chat means I've seen it.
          if (senderId && String(senderId) !== String(currentUserId)) {
            updatedLastMessage = { ...c.lastMessage, status: 'seen' };
          }
        }
        return {
          ...c,
          unreadCount: 0,
          lastMessage: updatedLastMessage,
        };
      }
      return c;
    });
    set({ conversations: updated });
  },

  incrementUnreadCount: (conversationId) => {
    const { conversations, activeConversationId } = get();
    if (activeConversationId === conversationId) return;
    const updated = conversations.map((c) => {
      if (c._id === conversationId) {
        let currentCount = 0;
        if (typeof c.unreadCount === 'number') {
          currentCount = c.unreadCount;
        } else if (c.unreadCount && typeof c.unreadCount === 'object') {
          const userId = require('./useAuthStore').default?.getState?.()?.user?._id;
          currentCount = c.unreadCount[userId] || c.unreadCount[userId?.toString()] || 0;
        }
        return {
          ...c,
          unreadCount: currentCount + 1,
        };
      }
      return c;
    });
    set({ conversations: updated });
  },

  markConvoAsSeen: (conversationId, seenAt, seenBy) => {
    const { messages, conversations } = get();
    const convoMsgs = messages[conversationId] || [];
    const timestamp = seenAt || new Date().toISOString();
    const updated = convoMsgs.map((m) => {
      const senderId = typeof m.sender === 'object' ? m.sender?._id : m.sender;
      if (seenBy && senderId && String(senderId) === String(seenBy)) {
        return m; // Don't mark my own message as seen just because I saw the conversation
      }
      return {
        ...m,
        status: 'seen',
        seenAt: m.seenAt || timestamp,
      };
    });
    
    const updatedConvos = conversations.map((c) => {
      if (c._id === conversationId) {
        let updatedLastMessage = c.lastMessage;
        if (c.lastMessage) {
          const senderId = typeof c.lastMessage.sender === 'object' ? c.lastMessage.sender?._id : c.lastMessage.sender;
          if (!seenBy || (senderId && String(senderId) !== String(seenBy))) {
            updatedLastMessage = { ...c.lastMessage, status: 'seen' };
          }
        }
        return {
          ...c,
          unreadCount: 0,
          lastMessage: updatedLastMessage,
        };
      }
      return c;
    });
    set({ messages: { ...messages, [conversationId]: updated }, conversations: updatedConvos });
  },

  deleteMessage: (conversationId, messageId) => {
    const { messages } = get();
    const convoMsgs = messages[conversationId] || [];
    if (messageId?.toString().startsWith('temp_')) {
      const filtered = convoMsgs.filter((m) => m._id !== messageId);
      set({ messages: { ...messages, [conversationId]: filtered } });
      return;
    }
    const updated = convoMsgs.map((m) =>
      m._id === messageId ? { ...m, isDeleted: true, text: '', images: [], voiceNoteUrl: '' } : m
    );
    set({ messages: { ...messages, [conversationId]: updated } });
  },

  setTyping: (conversationId, userId) =>
    set((state) => ({
      typingUsers: { ...state.typingUsers, [conversationId]: userId },
    })),

  clearTyping: (conversationId) =>
    set((state) => ({
      typingUsers: { ...state.typingUsers, [conversationId]: null },
    })),

  setUserOnline: (userId, isOnline) =>
    set((state) => ({
      onlineUsers: { ...state.onlineUsers, [userId]: isOnline },
    })),
}));

export default useChatStore;
