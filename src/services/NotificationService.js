import * as Notifications from 'expo-notifications';
import { Platform, AppState } from 'react-native';
import { userApi } from '../api/services';
import { navigationRef } from '../navigation/navigationRef';

// Your Expo project ID from app.json
const PROJECT_ID = 'ab48d8dd-0cb6-4a1d-82b0-84f55577a6d1';

// Configure foreground notification behavior
// Since we only trigger local notifications when NOT in the active chat,
// we DO want to show the banner alert even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class NotificationService {
  static _responseListener = null;
  static _initialized = false;

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /** Call once after the user is authenticated. */
  static async initialize() {
    if (this._initialized) return;
    this._initialized = true;

    await this._setupAndroidChannels();

    const token = await this._requestPermissionsAndGetToken();
    if (token) {
      await this._registerTokenWithBackend(token);
    }

    this._setupTapListener();
  }

  /** Call on logout. */
  static cleanup() {
    if (this._responseListener) {
      Notifications.removeNotificationSubscription(this._responseListener);
      this._responseListener = null;
    }
    this._initialized = false;
  }

  /**
   * Show a local notification for an incoming chat message.
   * Only fires when the user is NOT inside the active chat.
   */
  static async showMessageNotification({ senderName, senderId, text, conversationId, avatarUrl }) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: senderName,
          body: text || '📷 Sent an image',
          sound: 'default',
          data: { type: 'message', conversationId, senderId, senderName, avatarUrl },
          ...(Platform.OS === 'android' && { channelId: 'messages' }),
        },
        trigger: null, // show immediately
      });
    } catch (e) {
      console.warn('[Push] showMessageNotification error:', e.message);
    }
  }

  /**
   * Show a high-priority local notification for an incoming call.
   * This shows a heads-up banner even when the phone is locked.
   */
  static async showCallNotification({ callerName, callType }) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: callType === 'video' ? '📹 Incoming Video Call' : '📞 Incoming Call',
          body: `${callerName} is calling you...`,
          data: { type: 'call' },
          ...(Platform.OS === 'android' && { channelId: 'calls_ringtone', sticky: true }),
        },
        trigger: null,
      });
    } catch (e) {
      console.warn('[Push] showCallNotification error:', e.message);
    }
  }

  /** Dismiss the persistent call notification after call is handled. */
  static async dismissCallNotification() {
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch (e) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  static async _setupAndroidChannels() {
    if (Platform.OS !== 'android') return;

    // Regular messages — high importance
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0084FF',
      sound: 'default',
    });

    // Calls — MAX importance, bypass DND, ringtone usage
    await Notifications.setNotificationChannelAsync('calls_ringtone', {
      name: 'Incoming Calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      lightColor: '#34C759',
      enableLights: true,
      enableVibrate: true,
      bypassDnd: true,
      sound: null, // Let InCallManager handle the actual sound
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
  }

  static async _requestPermissionsAndGetToken() {
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

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
      console.log('[Push] Expo push token obtained:', tokenData.data.slice(0, 30) + '…');
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

  /** Handle user tapping a notification → navigate to the right screen. */
  static _setupTapListener() {
    this._responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (!navigationRef.isReady()) return;

      if (data?.type === 'message' && data?.conversationId) {
        // Navigate to the specific chat
        navigationRef.navigate('Chat', {
          conversation: { _id: data.conversationId },
          otherUser: {
            _id: data.senderId,
            name: data.senderName,
            avatar: data.avatarUrl || null,
          },
        });
      } else if (data?.type === 'call') {
        // Navigate to incoming call screen if still active
        navigationRef.navigate('IncomingCall');
      }
    });
  }
}

export default NotificationService;
