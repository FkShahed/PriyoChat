import { create } from 'zustand';

const useChatStore = create((set, get) => ({
  conversations: [],
  messages: {}, // { conversationId: [message, ...] }
  typingUsers: {}, // { conversationId: userId | null }
  onlineUsers: {}, // { userId: bool }
  activeConversationId: null, // the conversation the user is currently viewing

  setConversations: (conversations) => set({ conversations }),
  setActiveConversationId: (id) => set({ activeConversationId: id }),

  addOrUpdateConversation: (convo) => {
    const { conversations } = get();
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
    if (existing.find((m) => m._id === message._id)) return;
    const updated = [...existing, message].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
    set({
      messages: {
        ...messages,
        [conversationId]: updated,
      },
    });
  },

  updateMessageStatus: (conversationId, messageId, status) => {
    const { messages } = get();
    const convoMsgs = messages[conversationId] || [];
    const updated = convoMsgs.map((m) =>
      m._id === messageId ? { ...m, status } : m
    );
    set({ messages: { ...messages, [conversationId]: updated } });
  },

  markConvoAsSeen: (conversationId) => {
    const { messages } = get();
    const convoMsgs = messages[conversationId] || [];
    const updated = convoMsgs.map((m) => ({ ...m, status: 'seen' }));
    set({ messages: { ...messages, [conversationId]: updated } });
  },

  deleteMessage: (conversationId, messageId) => {
    const { messages } = get();
    const convoMsgs = messages[conversationId] || [];
    const updated = convoMsgs.map((m) =>
      m._id === messageId ? { ...m, isDeleted: true, text: '' } : m
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
