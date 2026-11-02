import { create } from 'zustand';
import io from 'socket.io-client/dist/socket.io.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState } from 'react-native';
import useChatStore from './useChatStore';
import useCallStore from './useCallStore';
import useAuthStore from './useAuthStore';
import NotificationService from '../services/NotificationService';

import { SOCKET_URL } from '../api/client';

let connectPromise = null;

const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,

  connect: async () => {
    const { socket, isConnected } = get();
    if (socket?.connected && isConnected) return socket;
    if (connectPromise) return connectPromise;

    connectPromise = (async () => {
      try {
        const token = await AsyncStorage.getItem('auth_token');
        if (!token) return null;

        const existingSocket = get().socket;
        if (existingSocket) {
          try {
            existingSocket.removeAllListeners();
            existingSocket.disconnect();
          } catch (e) {}
        }

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

      const currentUserId = useAuthStore.getState().user?._id;
      const senderId = message.sender?._id || message.sender;

      // If we are the recipient, notify server that message is delivered
      if (currentUserId && senderId?.toString() !== currentUserId.toString()) {
        newSocket.emit('message_delivered', { messageId: message._id });

        // If we are currently active inside this conversation, also mark seen
        const activeId = useChatStore.getState().activeConversationId;
        if (activeId === message.conversation) {
          newSocket.emit('message_seen', { conversationId: message.conversation });
        } else {
          useChatStore.getState().incrementUnreadCount(message.conversation);
        }
      }

      // Show push notification if user is NOT in this conversation and NOT muted
      const activeId = useChatStore.getState().activeConversationId;
      const isMuted = useChatStore.getState().isMuted?.(message.conversation);
      if (activeId !== message.conversation && !isMuted) {
        NotificationService.showMessageNotification({
          senderName: message.sender?.name || 'New Message',
          senderId: message.sender?._id,
          text: message.text,
          callData: message.callData,
          conversationId: message.conversation,
          avatarUrl: message.sender?.avatar,
        });
      }
    });

    newSocket.on('message_status_updated', ({ messageId, status, conversationId, seenAt }) => {
      // Update message status in store
      const { messages } = useChatStore.getState();
      const targetConvoId = conversationId || Object.keys(messages).find((convId) =>
        messages[convId]?.some((m) => m._id === messageId)
      );
      if (targetConvoId) {
        useChatStore.getState().updateMessageStatus(targetConvoId, messageId, status, seenAt);
      }
    });

    newSocket.on('messages_seen', ({ conversationId, seenAt, seenBy }) => {
      useChatStore.getState().markConvoAsSeen(conversationId, seenAt, seenBy);
    });

    newSocket.on('message_deleted', ({ messageId, conversationId }) => {
      useChatStore.getState().deleteMessage(conversationId, messageId);
    });

    newSocket.on('message_reacted', ({ messageId, reactions, conversationId }) => {
      useChatStore.getState().updateMessageReactions(conversationId, messageId, reactions);
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
      // Replay of a call this device already answered / ended (e.g. after a socket reconnect):
      // ignore it completely so the phone never rings again for the same call.
      {
        const cs = useCallStore.getState();
        if (data?.callId && cs.isCallHandled(data.callId) && (cs.callState === 'idle' || cs.callState === 'ended')) {
          console.log('[Socket] Ignoring replayed incoming_call already handled:', data.callId);
          return;
        }
      }
      let callerObj = data.caller;
      if (typeof callerObj === 'string') {
        try { callerObj = JSON.parse(callerObj); } catch (e) {}
      }
      const callerName = callerObj?.name || data.callerName || 'PriyoChat User';

      const accepted = useCallStore.getState().setIncomingCall({
        ...data,
        caller: callerObj || { name: callerName },
        callerName,
      });

      if (!accepted) {
        // User is already in a call — notify caller that user is busy
        console.warn('[Socket] Device busy — sending call_reject busy to caller:', data.from);
        newSocket.emit('call_reject', { to: data.from, reason: 'busy' });
        // Show a brief alert to the current user that someone tried to call them
        const { Platform } = require('react-native');
        if (Platform.OS !== 'web' && AppState.currentState === 'active') {
          Alert.alert(
            '📞 Another Call',
            `${callerName} is trying to call you, but you are already in a call.`,
            [{ text: 'OK', style: 'cancel' }],
            { cancelable: true }
          );
        }
        return;
      }
      newSocket.emit('call_ringing', { to: data.from });

      // When app is in background, show ONE single call notification with Answer/Decline buttons
      const { navigationRef } = require('../navigation/navigationRef');
      const currentRoute = navigationRef?.isReady?.() ? navigationRef.getCurrentRoute()?.name : null;
      const isAlreadyOnCallScreen = currentRoute === 'IncomingCall' || currentRoute === 'Call';
      const existingCallState = useCallStore.getState().callState;
      const isAlreadyActiveOrConnecting = existingCallState === 'active' || existingCallState === 'connecting';

      if (AppState.currentState !== 'active' && !isAlreadyOnCallScreen && !isAlreadyActiveOrConnecting) {
        try {
          const CallKeepService = require('../services/CallKeepService').default;
          const callUuid = data.callId || ('call-' + Date.now());
          CallKeepService.displayIncomingCall(callUuid, callerName, 'PriyoChat', data.callType);
        } catch (e) {}

        NotificationService.showCallNotification({
          callerName,
          callType: data.callType,
          callId: data.callId,
          caller: callerObj || { name: callerName },
          offer: data.offer,
        });
      }
    });

    newSocket.on('call_ringing', () => {
      useCallStore.getState().setCallRinging();
    });

    newSocket.on('call_answered', (data) => {
      const answer = data?.answer || data;
      useCallStore.getState().setCallAnswered(answer);
    });

    newSocket.on('call_ice', (data) => {
      const candidate = (data?.candidate && typeof data.candidate === 'object') ? data.candidate : (data?.candidate || data);
      useCallStore.getState().addIceCandidate(candidate);
    });

    // ICE restart signalling (only used when a call could not connect on the first attempt,
    // e.g. answered late after the caller's network paths went stale)
    newSocket.on('call_renegotiate', (data) => {
      if (data?.offer) useCallStore.getState().setRenegotiateOffer(data.offer);
    });

    newSocket.on('call_renegotiate_answer', (data) => {
      if (data?.answer) useCallStore.getState().setRenegotiateAnswer(data.answer);
    });

    newSocket.on('call_rejected', (data) => {
      console.log('[Socket] Received call_rejected from server:', data);
      useCallStore.getState().endCall('rejected');
    });

    // Caller receives this when the receiver is already busy on another call
    newSocket.on('call_busy', (data) => {
      console.log('[Socket] Received call_busy — user is on another call:', data);
      const { callState } = useCallStore.getState();
      if (callState === 'calling' || callState === 'ringing') {
        useCallStore.getState().endCall('ended');
        Alert.alert(
          '📵 User is Busy',
          'The person you are calling is already on another call. Please try again later.',
          [{ text: 'OK' }]
        );
      }
    });

    newSocket.on('call_ended', (data) => {
      console.log('[Socket] Received call_ended from server:', data);
      useCallStore.getState().endCall('ended');
    });

    // Wrap emit to include callId for call-related events
    const originalEmit = newSocket.emit;
    newSocket.emit = (event, data, ...args) => {
      const callRelated = ['call_answer', 'call_reject', 'call_end'];
      if (callRelated.includes(event)) {
        const { callId } = useCallStore.getState();
        if (callId && data && typeof data === 'object') {
          data.callId = callId;
        }
      }
      return originalEmit.apply(newSocket, [event, data, ...args]);
    };

    // ── Friend request events ────────────────────────────────────────
    newSocket.on('friend_request', ({ request }) => {
      // Navigation handled in FriendRequestsScreen
    });

    newSocket.on('request_accepted', ({ conversation }) => {
      useChatStore.getState().addOrUpdateConversation(conversation);
    });

    newSocket.on('user_moderated', ({ type, reason, warnings }) => {
      const title = type === 'warn' ? 'Official Warning' : 'Account Restricted';
      let message = reason || 'No reason provided';
      
      if (type === 'warn') {
        message = `You have received a warning.\nReason: ${reason}\nTotal warnings: ${warnings}`;
        Alert.alert(title, message);
        useAuthStore.getState().updateUser({ ...useAuthStore.getState().user, warnings });
      } else if (type === 'remove_warning') {
        useAuthStore.getState().updateUser({ ...useAuthStore.getState().user, warnings });
      } else if (type === 'ban' || type === 'suspend') {
        Alert.alert(title, `Your account has been ${type === 'ban' ? 'banned' : 'suspended'}.\nReason: ${reason}`, [
          { text: 'OK', onPress: () => useAuthStore.getState().logout() }
        ]);
      }
    });

    set({ socket: newSocket });

        // Keep `connectPromise` alive until this socket is really connected (max ~8s).
        // Other connect() calls made in the meantime (App start, navigator, call screen, ...) then
        // REUSE this in-flight socket instead of tearing it down and starting a new handshake each
        // time — repeated teardown made notification-answered calls sit on "Connecting..." for ages.
        await new Promise((resolve) => {
          if (newSocket.connected) return resolve();
          let timer = null;
          const finish = () => {
            if (timer) { clearTimeout(timer); timer = null; }
            try { newSocket.off('connect', finish); } catch (e) {}
            try { newSocket.off('connect_error', finish); } catch (e) {}
            resolve();
          };
          timer = setTimeout(finish, 8000);
          newSocket.on('connect', finish);
          newSocket.on('connect_error', finish);
        });

        return newSocket;
      } finally {
        connectPromise = null;
      }
    })();

    return connectPromise;
  },

  disconnect: () => {
    connectPromise = null;
    const { socket } = get();
    if (socket) {
      try {
        socket.removeAllListeners();
        socket.disconnect();
      } catch (e) {}
    }
    set({ socket: null, isConnected: false });
  },

  emit: (event, data, callback) => {
    const { socket } = get();
    socket?.emit(event, data, callback);
  },
}));

export default useSocketStore;
