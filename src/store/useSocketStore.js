import { create } from 'zustand';
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useChatStore from './useChatStore';
import useCallStore from './useCallStore';

import { Platform, NativeModules } from 'react-native';

// Dynamically get the IP address from the Metro bundler
let localIp = '192.168.1.104'; // fallback
if (__DEV__ && Platform.OS !== 'web') {
  const scriptURL = NativeModules.SourceCode?.scriptURL;
  if (scriptURL) {
    const match = scriptURL.match(/^https?:\/\/([^:]+)/);
    if (match && match[1]) localIp = match[1];
  }
}

const SOCKET_URL = Platform.OS === 'web' 
  ? 'http://localhost:4444' 
  : `http://${localIp}:4444`;

const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,

  connect: async () => {
    const { socket } = get();
    if (socket?.connected) return;

    const token = await AsyncStorage.getItem('auth_token');
    if (!token) return;

    const newSocket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    newSocket.on('connect', () => {
      console.log('✅ Socket connected:', newSocket.id);
      set({ isConnected: true });
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
      set({ isConnected: false });
    });

    // ── Chat events ──────────────────────────────────────────────────
    newSocket.on('new_message', (message) => {
      useChatStore.getState().addMessage(message.conversation, message);
      useChatStore.getState().addOrUpdateConversation({
        _id: message.conversation,
        lastMessage: message,
        updatedAt: message.createdAt,
      });
    });

    newSocket.on('message_status_updated', ({ messageId, status, conversationId }) => {
      // Update all conversations' messages - find the right one
      const { messages } = useChatStore.getState();
      for (const convId of Object.keys(messages)) {
        const found = messages[convId]?.find((m) => m._id === messageId);
        if (found) {
          useChatStore.getState().updateMessageStatus(convId, messageId, status);
          break;
        }
      }
    });

    newSocket.on('messages_seen', ({ conversationId }) => {
      useChatStore.getState().markConvoAsSeen(conversationId);
    });

    newSocket.on('message_deleted', ({ messageId, conversationId }) => {
      useChatStore.getState().deleteMessage(conversationId, messageId);
    });

    newSocket.on('message_reacted', ({ messageId, reactions, conversationId }) => {
      // handled individually in chat screen
    });

    newSocket.on('typing_start', ({ conversationId, userId }) => {
      useChatStore.getState().setTyping(conversationId, userId);
    });

    newSocket.on('typing_stop', ({ conversationId }) => {
      useChatStore.getState().clearTyping(conversationId);
    });

    newSocket.on('user_status', ({ userId, isOnline }) => {
      useChatStore.getState().setUserOnline(userId, isOnline);
    });

    newSocket.on('theme_changed', ({ conversationId, theme }) => {
      useChatStore.getState().addOrUpdateConversation({ _id: conversationId, theme });
    });

    // ── Call events ──────────────────────────────────────────────────
    newSocket.on('incoming_call', (data) => {
      useCallStore.getState().setIncomingCall(data);
    });

    newSocket.on('call_answered', ({ answer }) => {
      useCallStore.getState().setCallAnswered(answer);
    });

    newSocket.on('call_ice', ({ candidate }) => {
      useCallStore.getState().addIceCandidate(candidate);
    });

    newSocket.on('call_rejected', () => {
      useCallStore.getState().endCall('rejected');
    });

    newSocket.on('call_ended', () => {
      useCallStore.getState().endCall('ended');
    });

    // ── Friend request events ────────────────────────────────────────
    newSocket.on('friend_request', ({ request }) => {
      // Navigation handled in FriendRequestsScreen
    });

    newSocket.on('request_accepted', ({ conversation }) => {
      useChatStore.getState().addOrUpdateConversation(conversation);
    });

    set({ socket: newSocket });
  },

  disconnect: () => {
    const { socket } = get();
    socket?.disconnect();
    set({ socket: null, isConnected: false });
  },

  emit: (event, data, callback) => {
    const { socket } = get();
    socket?.emit(event, data, callback);
  },
}));

export default useSocketStore;
