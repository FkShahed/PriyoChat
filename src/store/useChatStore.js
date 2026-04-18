import { create } from 'zustand';

const useChatStore = create((set, get) => ({
  conversations: [],
  messages: {}, // { conversationId: [message, ...] }
  typingUsers: {}, // { conversationId: userId | null }
  onlineUsers: {}, // { userId: bool }

  setConversations: (conversations) => set({ conversations }),

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

  setMessages: (conversationId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [conversationId]: messages },
    })),

  appendMessages: (conversationId, newMessages) => {
    const { messages } = get();
    const existing = messages[conversationId] || [];
    set({
      messages: {
        ...messages,
        [conversationId]: [...existing, ...newMessages],
      },
    });
  },

  addMessage: (conversationId, message) => {
    const { messages } = get();
    const existing = messages[conversationId] || [];
    // Avoid duplicates
    if (existing.find((m) => m._id === message._id)) return;
    set({
      messages: {
        ...messages,
        [conversationId]: [...existing, message],
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
