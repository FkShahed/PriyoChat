import * as Notifications from 'expo-notifications';
import { Platform, AppState } from 'react-native';
import { userApi } from '../api/services';
import { navigationRef } from '../navigation/navigationRef';

// Your Expo project ID from app.json
const PROJECT_ID = 'ad727065-625e-4696-95f9-467baf61dd1a';

// Configure foreground notification behavior — ALWAYS show heads-up banner with action buttons (Native only)
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

class NotificationService {
  static _responseListener = null;
  static _initialized = false;
  static _activeMessageHistory = {}; // { conversationId: [text1, text2, ...] }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /** Call once after the user is authenticated. */
  static async initialize() {
    // Always run channels & categories setup so changes take effect immediately
    await this._setupAndroidChannels();
    await this._setupCategories();

    if (this._initialized) return;
    this._initialized = true;

    try {
      const CallKeepService = require('./CallKeepService').default;
      await CallKeepService.initialize();
    } catch (e) {}

    const token = await this._requestPermissionsAndGetToken();
    if (token) {
      await this._registerTokenWithBackend(token);
    }

    this._setupTapListener();

    // Check if app was launched by tapping a notification (cold start)
    try {
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (lastResponse) {
        this._handleNotificationResponse(lastResponse);
      }
    } catch (e) {
      console.warn('[Push] Error handling cold start notification response:', e);
    }
  }

  /** Call on logout. */
  static cleanup() {
    if (this._responseListener) {
      if (typeof this._responseListener.remove === 'function') {
        this._responseListener.remove();
      } else if (typeof Notifications.removeNotificationSubscription === 'function') {
        Notifications.removeNotificationSubscription(this._responseListener);
      }
      this._responseListener = null;
    }
    this._initialized = false;
  }

  /**
   * Show a local notification for an incoming chat message.
   * Only fires when the user is NOT inside the active chat.
   * Groups messages by conversation so multiple messages from the same sender
   * are cleanly bundled together (like WhatsApp) instead of spamming separate notifications!
   */
  static async showMessageNotification({ senderName, senderId, text, callData, conversationId, avatarUrl }) {
    try {
      let bodyText = text;
      if (!bodyText) {
        if (callData) {
          bodyText = `📞 ${callData.status === 'rejected' ? 'Missed Call' : 'Call Ended'}`;
        } else {
          bodyText = '📷 Sent an image';
        }
      }

      const convKey = conversationId ? String(conversationId) : (senderId ? String(senderId) : 'general');
      const notifIdentifier = `msg_thread_${convKey}`;

      if (!this._activeMessageHistory[convKey]) {
        this._activeMessageHistory[convKey] = [];
      }
      this._activeMessageHistory[convKey].push(bodyText);

      // Keep up to 6 recent messages in the stack
      if (this._activeMessageHistory[convKey].length > 6) {
        this._activeMessageHistory[convKey].shift();
      }

      const count = this._activeMessageHistory[convKey].length;
      let displayTitle = senderName;
      let displayBody = bodyText;

      if (count > 1) {
        displayTitle = `${senderName} (${count} new messages)`;
        // Show stacked preview (latest messages separated by newline)
        displayBody = this._activeMessageHistory[convKey].slice(-3).join('\n');
      }

      await Notifications.scheduleNotificationAsync({
        identifier: notifIdentifier,
        content: {
          title: displayTitle,
          body: displayBody,
          sound: 'default',
          categoryIdentifier: 'message_reply_category',
          data: { type: 'message', conversationId, senderId, senderName, avatarUrl },
          ...(Platform.OS === 'android' && { channelId: 'messages_v2' }),
        },
        trigger: null, // show immediately
      });
    } catch (e) {
      console.warn('[Push] showMessageNotification error:', e.message);
    }
  }

  /**
   * Clear message history stack and dismiss notifications for a specific conversation when opened.
   */
  static async dismissConversationNotifications(conversationId) {
    if (!conversationId) return;
    try {
      const convKey = String(conversationId);
      delete this._activeMessageHistory[convKey];
      await Notifications.dismissNotificationAsync(`msg_thread_${convKey}`);
    } catch (e) {}
  }

  /**
   * Show a high-priority local notification for an incoming call.
   * Includes interactive Accept / Decline action buttons in Android top notification bar!
   */
  static async showCallNotification({ callerName, callType, callId, caller, offer }) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: callType === 'video' ? '📹 Incoming Video Call' : '📞 Incoming Call',
          body: `${callerName || 'Someone'} is calling you...`,
          categoryIdentifier: 'incoming_call_category',
          data: { type: 'call', callerName, callType, callId, caller, offer },
          ...(Platform.OS === 'android' && { channelId: 'incoming_calls_v5', sticky: true }),
        },
        trigger: null,
      });
    } catch (e) {
      console.warn('[Push] showCallNotification error:', e.message);
    }
  }

  /**
   * Show a persistent ongoing call notification with caller name, duration, and "End Call" button.
   * Keeps active even when the app is in the background or minimized.
   */
  static async showOngoingCallNotification({ remoteUser, callType, duration = 0 }) {
    if (Platform.OS === 'web') return;
    try {
      const callerName = remoteUser?.name || 'PriyoChat User';
      const m = Math.floor((duration || 0) / 60).toString().padStart(2, '0');
      const s = ((duration || 0) % 60).toString().padStart(2, '0');
      const timeStr = `${m}:${s}`;

      await Notifications.scheduleNotificationAsync({
        identifier: 'ongoing_call_notification',
        content: {
          title: `${callType === 'video' ? '📹 In video call' : '📞 In call'} with ${callerName}`,
          body: `Duration: ${timeStr} • Tap to return to call`,
          categoryIdentifier: 'ongoing_call_category',
          data: {
            type: 'ongoing_call',
            remoteUser,
            callType,
          },
          ...(Platform.OS === 'android' && {
            channelId: 'ongoing_calls_v1',
            sticky: true,
            autoDismiss: false,
          }),
        },
        trigger: null,
      });
    } catch (e) {
      console.warn('[Push] showOngoingCallNotification error:', e.message);
    }
  }

  /** Dismiss ongoing active call notification when the call ends. */
  static async dismissOngoingCallNotification() {
    if (Platform.OS === 'web') return;
    try {
      await Notifications.dismissNotificationAsync('ongoing_call_notification');
    } catch (e) {}
  }

  /** Dismiss the persistent call notification after call is handled. */
  static async dismissCallNotification() {
    try {
      await Notifications.dismissAllNotificationsAsync();
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (e) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  static async _setupCategories() {
    if (Platform.OS === 'web') return;
    try {
      await Notifications.setNotificationCategoryAsync('message_reply_category', [
        {
          identifier: 'REPLY_ACTION',
          buttonTitle: 'Reply',
          textInput: {
            submitButtonTitle: 'Send',
            placeholder: 'Type a message...',
          },
          options: {
            opensAppToForeground: false, // Allows background sending without forcing app open
          },
        },
      ]);

      await Notifications.setNotificationCategoryAsync('incoming_call_category', [
        {
          identifier: 'ACCEPT_CALL_ACTION',
          buttonTitle: '✓ Answer',
          title: '✓ Answer',
          options: {
            opensAppToForeground: true,
          },
        },
        {
          identifier: 'DECLINE_CALL_ACTION',
          buttonTitle: '✕ Decline',
          title: '✕ Decline',
          options: {
            isDestructive: true,
            opensAppToForeground: true,
          },
        },
      ]);

      await Notifications.setNotificationCategoryAsync('ongoing_call_category', [
        {
          identifier: 'END_CALL_ACTION',
          buttonTitle: '✕ End Call',
          title: '✕ End Call',
          options: {
            isDestructive: true,
            opensAppToForeground: false,
          },
        },
      ]);
      console.log('[Push] Notification categories set up successfully');
    } catch (e) {
      console.warn('[Push] Category setup error:', e.message);
    }
  }

  static async _setupAndroidChannels() {
    if (Platform.OS !== 'android') return;

    // Regular messages — high importance with default notification sound
    await Notifications.setNotificationChannelAsync('messages_v2', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0084FF',
      enableLights: true,
      enableVibrate: true,
      sound: 'default',
    });

    // Calls — MAX importance, respects Do Not Disturb / Silent Mode
    await Notifications.setNotificationChannelAsync('incoming_calls_v5', {
      name: 'Incoming Calls Alert',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      lightColor: '#34C759',
      enableLights: true,
      enableVibrate: true,
      sound: 'default',
    });

    // Ongoing Active Call Notification Channel (Low sound/no vibrate so it doesn't disturb)
    await Notifications.setNotificationChannelAsync('ongoing_calls_v1', {
      name: 'Ongoing Call',
      importance: Notifications.AndroidImportance.LOW,
      lightColor: '#0084FF',
      enableLights: false,
      enableVibrate: false,
      sound: null,
    });
  }

  static async _requestPermissionsAndGetToken() {
    if (Platform.OS === 'web') return null;
    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;

      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('[Push] Notification permission denied');
        return null;
      }

      // Try getting raw FCM Device Token first (for Android standalone builds)
      try {
        const deviceTokenData = await Notifications.getDevicePushTokenAsync();
        if (deviceTokenData && deviceTokenData.data) {
          console.log('[Push] Raw FCM Device token obtained:', deviceTokenData.data);
          return deviceTokenData.data;
        }
      } catch (e) {
        console.warn('[Push] Could not get device token, falling back to Expo token:', e.message);
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
      console.log('[Push] Expo push token obtained FULL:', tokenData.data);
      return tokenData.data;
    } catch (err) {
      console.error('[Push] Failed to get push token:', err.message);
      return null;
    }
  }

  static async _registerTokenWithBackend(token) {
    try {
      await userApi.updateFcmToken(token);
      console.log('[Push] Token registered with backend ✅');
    } catch (err) {
      console.warn('[Push] Backend token registration failed:', err.message);
    }
  }

  /** Handle user tapping a notification or notification action buttons. */
  static _setupTapListener() {
    if (this._receivedListener) {
      try { this._receivedListener.remove(); } catch (e) {}
    }
    if (this._responseListener) {
      try { this._responseListener.remove(); } catch (e) {}
    }

    this._receivedListener = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      if (data?.type === 'call' && (data?.caller || data?.from)) {
        if (AppState.currentState === 'active') return; // Don't spam notifications when app is active!
        try {
          const useCallStore = require('../store/useCallStore').default;
          const CallKeepService = require('./CallKeepService').default;
          const callUuid = data.callId || ('call-' + Date.now());

          let callerObj = data.caller;
          if (typeof callerObj === 'string') {
            try { callerObj = JSON.parse(callerObj); } catch (e) {}
          }
          const callerName = callerObj?.name || data.callerName || 'PriyoChat User';
          const fromId = callerObj?._id || callerObj?.id || data.from;

          const accepted = useCallStore.getState().setIncomingCall({
            from: fromId,
            callId: data.callId,
            caller: callerObj || { name: callerName },
            callerName,
            offer: data.offer,
            callType: data.callType || 'audio',
          });
          if (accepted) {
            CallKeepService.displayIncomingCall(callUuid, callerName, 'PriyoChat', data.callType || 'audio');
            if (navigationRef.isReady()) {
              navigationRef.navigate('IncomingCall');
            }
          }
        } catch (e) {
          console.warn('[Push] Error handling incoming call notification arrival:', e.message);
        }
      }
    });

    this._responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('[Push] Notification response received, actionIdentifier:', response?.actionIdentifier);
      this._handleNotificationResponse(response);
    });
  }

  static _handleNotificationResponse(response) {
    const rawActionId = response?.actionIdentifier || '';
    const actionId = rawActionId.toUpperCase();
    const data = response?.notification?.request?.content?.data;

    console.log('[Push] Processing notification response, rawActionId:', rawActionId, 'data:', data?.type);

    // Handle interactive notification actions (ACCEPT vs DECLINE from top status bar)
    if (actionId.includes('ACCEPT')) {
      console.log('[Push] User tapped ACCEPT on top notification bar ✅');
      try {
        const useCallStore = require('../store/useCallStore').default;
        const state = useCallStore.getState();

        let callerObj = data?.caller;
        if (typeof callerObj === 'string') {
          try { callerObj = JSON.parse(callerObj); } catch (e) {}
        }
        if (!callerObj || typeof callerObj !== 'object') {
          callerObj = {};
        }
        const callerName = callerObj.name || data?.callerName || state.remoteUser?.name || 'PriyoChat User';
        const callerId = callerObj._id || callerObj.id || data?.from || state.remoteUserId;
        const callTypeData = data?.callType || state.callType || 'audio';

        state.setIncomingCall({
          from: callerId,
          callId: data?.callId,
          caller: { ...callerObj, name: callerName },
          callerName,
          offer: data?.offer || state.offer,
          callType: callTypeData,
        });

        state.setCallAccepted();
        if (navigationRef.isReady()) {
          navigationRef.navigate('Call', {
            otherUser: state.remoteUser || { _id: callerId, name: callerName },
            callType: callTypeData,
          });
        }
      } catch (e) {
        console.warn('[Push] Accept action error:', e.message);
      }
      return;
    }

    if (actionId.includes('DECLINE') || actionId.includes('REJECT')) {
      console.log('[Push] User tapped DECLINE on top notification bar 🔴');
      try {
        const useCallStore = require('../store/useCallStore').default;
        const useSocketStore = require('../store/useSocketStore').default;

        let callerObj = data?.caller;
        if (typeof callerObj === 'string') {
          try { callerObj = JSON.parse(callerObj); } catch (e) {}
        }
        const callerId = callerObj?._id || callerObj?.id || data?.from || useCallStore.getState().remoteUserId || useCallStore.getState().remoteUser?._id;

        console.log('[Push] Decline action target callerId:', callerId);
        
        const sendRejectSignal = async () => {
          if (!callerId) return;
          try {
            let socket = useSocketStore.getState().socket;
            if (!socket || !socket.connected) {
              await useSocketStore.getState().connect();
              socket = useSocketStore.getState().socket;
            }
            if (socket) {
              console.log('[Push] Emitting call_reject to socket for caller:', callerId);
              socket.emit('call_reject', { to: callerId, callId: data?.callId, callType: data?.callType || 'audio' });
            }
          } catch (e) {
            console.warn('[Push] sendRejectSignal error:', e.message);
          }
        };

        sendRejectSignal();
        useCallStore.getState().endCall('rejected');
        Notifications.dismissAllNotificationsAsync();
        Notifications.cancelAllScheduledNotificationsAsync();
      } catch (e) {
        console.warn('[Push] Decline action error:', e.message);
      }
      return;
    }

    // Handle "End Call" action from ongoing call notification
    if (actionId.includes('END_CALL')) {
      console.log('[Push] User tapped END CALL from ongoing notification bar 🛑');
      try {
        const useCallStore = require('../store/useCallStore').default;
        const useSocketStore = require('../store/useSocketStore').default;
        const state = useCallStore.getState();
        const targetUserId =
          (typeof state.remoteUser === 'string' ? state.remoteUser : (state.remoteUser?._id || state.remoteUser?.id)) ||
          state.remoteUserId;

        if (targetUserId) {
          useSocketStore.getState().emit('call_end', {
            to: targetUserId,
            callType: state.callType,
            duration: state.callDuration,
          });
        }
        state.resetCall();
        NotificationService.dismissOngoingCallNotification();
      } catch (e) {
        console.warn('[Push] End call action error:', e.message);
      }
      return;
    }

    // Handle Quick Reply directly from the notification panel
    if (actionId.includes('REPLY')) {
      const replyText = (response?.userText || '').trim();
      const conversationId = data?.conversationId;
      console.log('[Push] Quick reply received:', replyText, 'for conversation:', conversationId);

      if (replyText && conversationId) {
        try {
          const useSocketStore = require('../store/useSocketStore').default;
          const useChatStore = require('../store/useChatStore').default;
          const useAuthStore = require('../store/useAuthStore').default;

          const currentUser = useAuthStore.getState().user;
          const tempId = `temp_reply_${Date.now()}`;
          const optimisticMsg = {
            _id: tempId,
            conversation: conversationId,
            sender: currentUser,
            text: replyText,
            images: [],
            status: 'sending',
            createdAt: new Date().toISOString(),
          };

          useChatStore.getState().addMessage(conversationId, optimisticMsg);

          const sendReply = async () => {
            let socket = useSocketStore.getState().socket;
            if (!socket || !socket.connected) {
              await useSocketStore.getState().connect();
              socket = useSocketStore.getState().socket;
            }
            if (socket) {
              socket.emit('send_message', { conversationId, text: replyText, images: [] }, (res) => {
                if (res?.message) {
                  useChatStore.getState().replaceOptimisticMessage(conversationId, tempId, res.message);
                } else if (res?.error) {
                  useChatStore.getState().updateMessageStatus(conversationId, tempId, 'failed');
                }
              });
            }
          };

          sendReply();
          // Dismiss the message notification once replied
          const notificationId = response?.notification?.request?.identifier;
          if (notificationId) {
            Notifications.dismissNotificationAsync(notificationId).catch(() => {});
          }
        } catch (err) {
          console.warn('[Push] Quick reply handler error:', err.message);
        }
      }
      return;
    }

    if (!data) return;

    const navigateWhenReady = (screen, params) => {
      if (navigationRef.isReady()) {
        navigationRef.navigate(screen, params);
      } else {
        setTimeout(() => navigateWhenReady(screen, params), 500);
      }
    };

    if (data?.type === 'message' && data?.conversationId) {
      // Optimistically ingest the message payload into useChatStore immediately
      // so when ChatScreen opens, the message is ALREADY there without waiting for network!
      try {
        const useChatStore = require('../store/useChatStore').default;
        let parsedMessage = data?.message;
        if (typeof parsedMessage === 'string') {
          try { parsedMessage = JSON.parse(parsedMessage); } catch (e) {}
        }
        if (parsedMessage && typeof parsedMessage === 'object' && parsedMessage._id) {
          useChatStore.getState().addMessage(data.conversationId, parsedMessage);
          useChatStore.getState().addOrUpdateConversation({
            _id: data.conversationId,
            lastMessage: parsedMessage,
            updatedAt: parsedMessage.createdAt || new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn('[Push] Error pre-caching message from notification data:', err.message);
      }

      navigateWhenReady('Chat', {
        conversation: { _id: data.conversationId },
        otherUser: {
          _id: data.senderId,
          name: data.senderName,
          avatar: data.avatarUrl || null,
        },
      });
    } else if (data?.type === 'call') {
      if (data?.caller || data?.from) {
        try {
          const useCallStore = require('../store/useCallStore').default;
          let callerObj = data.caller;
          if (typeof callerObj === 'string') {
            try { callerObj = JSON.parse(callerObj); } catch (e) {}
          }
          const callerId = callerObj?._id || callerObj?.id || data.from;
          const callerName = callerObj?.name || data.callerName || 'PriyoChat User';

          useCallStore.getState().setIncomingCall({
            from: callerId,
            callId: data.callId,
            caller: callerObj || { name: callerName },
            callerName,
            offer: data.offer,
            callType: data.callType || 'audio',
          });
        } catch (e) {}
      }
      navigateWhenReady('IncomingCall');
    } else if (data?.type === 'ongoing_call') {
      try {
        const useCallStore = require('../store/useCallStore').default;
        const state = useCallStore.getState();
        navigateWhenReady('Call', {
          otherUser: state.remoteUser || data.remoteUser,
          callType: state.callType || data.callType || 'audio',
        });
      } catch (e) {}
    }
  }
}

// Auto-initialize notification listeners on module import (native only)
if (Platform.OS !== 'web') {
  try {
    NotificationService._setupTapListener();
    NotificationService._setupCategories();
  } catch (e) {}
}

export default NotificationService;
