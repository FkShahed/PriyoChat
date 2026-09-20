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

  markConvoAsSeen: (conversationId, seenAt) => {
    const { messages } = get();
    const convoMsgs = messages[conversationId] || [];
    const timestamp = seenAt || new Date().toISOString();
    const updated = convoMsgs.map((m) => ({
      ...m,
      status: 'seen',
      seenAt: m.seenAt || timestamp,
    }));
    set({ messages: { ...messages, [conversationId]: updated } });
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
