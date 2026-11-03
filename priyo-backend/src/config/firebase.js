const admin = require('firebase-admin');
const https = require('https');

let firebaseApp;

const initFirebase = () => {
  if (!firebaseApp) {
    try {
      const fs = require('fs');
      const path = require('path');
      const keyPath = path.resolve(__dirname, '../../firebase-service-account.json');

      if (fs.existsSync(keyPath)) {
        const serviceAccount = require(keyPath);
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log('✅ Firebase Admin initialized from service-account JSON file');
      } else if (process.env.FIREBASE_PROJECT_ID) {
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        });
        console.log('✅ Firebase Admin initialized from env vars');
      }
    } catch (err) {
      console.warn('⚠️  Firebase init skipped:', err.message);
    }
  }
};

// Send to a single token — auto-detects Expo vs FCM token
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  if (!fcmToken) return;

  const isCallCancel = data.type === 'call_cancel';

  // Expo Push Token (ExponentPushToken[...])
  // A call_cancel is a silent data message handled natively; never show it as a visible notification.
  if (isCallCancel && (fcmToken.startsWith('ExponentPushToken') || fcmToken.startsWith('ExpoPushToken'))) return;
  if (fcmToken.startsWith('ExponentPushToken') || fcmToken.startsWith('ExpoPushToken')) {
    return sendExpoNotification(fcmToken, title, body, data);
  }

  // Raw FCM token — use Firebase Admin SDK
  if (!firebaseApp) initFirebase();
  if (!firebaseApp) return;
  try {
    const isCall = data.type === 'call' || isCallCancel;
    const channelId = isCall ? 'incoming_calls_v7' : 'messages_v2';
    const collapseKey = data.conversationId ? `conv_${data.conversationId}` : (data.senderId ? `user_${data.senderId}` : (isCall ? `call_${data.callId || Date.now()}` : undefined));

    // Filter out reserved FCM data keys ('from', 'notification', 'message_type')
    const RESERVED_KEYS = new Set(['from', 'notification', 'message_type']);
    const safeData = {};
    for (const [k, v] of Object.entries({ ...data, title, body })) {
      const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
      if (k === 'from') {
        safeData['senderId'] = valStr;
        safeData['callerId'] = valStr;
      } else if (!RESERVED_KEYS.has(k)) {
        safeData[k] = valStr;
      }
    }

    // For Call: High-Priority DATA-ONLY push. This allows PriyoFirebaseMessagingService.kt
    // on the Android device to construct the notification with Notification.FLAG_INSISTENT (continuous looping ringtone)
    // and fullScreenIntent to wake up the screen.
    // For chat messages: include system notification payload for normal message chimes.
    const messagePayload = {
      token: fcmToken,
      data: safeData,
      android: {
        priority: 'high',
        // Call pushes: NO collapse key (collapsible messages are throttled by FCM after a burst of
        // ~20 per device — rapid repeated calls then stopped ringing and arrived minutes later),
        // and a short TTL so a call that could not be delivered in time is dropped by FCM instead
        // of ringing long after the caller has hung up (caller rings for max 45s).
        ...(isCall ? { ttl: 45 * 1000 } : { collapseKey }),
        ...(isCall ? {} : {
          notification: {
            title,
            body,
            tag: collapseKey,
            channelId,
            sound: 'default',
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        }),
      },
      ...(!isCall && { notification: { title, body } }),
      apns: {
        headers: {
          ...(collapseKey ? { 'apns-collapse-id': collapseKey } : {}),
          'apns-priority': '10',
        },
        payload: {
          aps: {
            contentAvailable: true,
            sound: isCall ? 'ringtone.wav' : 'default',
            badge: 1,
          },
        },
      },
    };

    const res = await admin.messaging().send(messagePayload);
    return res;
  } catch (err) {
    console.warn('FCM push failed:', err.message);
  }
};

// Send via Expo Push API (single notification)
const sendExpoNotification = (to, title, body, data = {}) => {
  return new Promise((resolve) => {
    const channelId = data.type === 'call' ? 'incoming_calls_v5' : 'messages_v2';
    const categoryIdentifier = data.type === 'message' || data.type === 'new_message' ? 'message_reply_category' : (data.type === 'call' ? 'incoming_call_category' : undefined);
    const collapseKey = data.conversationId ? `conv_${data.conversationId}` : (data.senderId ? `user_${data.senderId}` : undefined);
    const payload = JSON.stringify({
      to,
      title,
      body,
      data,
      sound: 'default',
      priority: 'high',
      channelId,
      categoryIdentifier,
      ...(collapseKey ? { _displayInForeground: true, collapseKey } : {}),
    });
    const req = https.request({
      hostname: 'exp.host',
      path: '/--/api/v2/push/send',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
    }, (res) => {
      let bodyData = '';
      res.on('data', (chunk) => { bodyData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(bodyData);
          resolve(parsed);
        } catch (e) {
          resolve(bodyData);
        }
      });
    });
    req.on('error', (err) => {
      console.warn('Expo push failed:', err.message);
      resolve(null);
    });
    req.write(payload);
    req.end();
  });
};

// Bulk send via Expo Push API (up to 100 tokens per batch)
const sendExpoPushBatch = async (tokens, title, body, data = {}, options = {}) => {
  const BATCH_SIZE = 100;
  let sent = 0;
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const messages = batch.map((to) => {
      const categoryIdentifier = data.type === 'message' || data.type === 'new_message' ? 'message_reply_category' : (data.type === 'call' ? 'incoming_call_category' : undefined);
      return { 
        to, 
        title, 
        body, 
        data, 
        sound: 'default', 
        priority: 'high',
        channelId: options.channelId || undefined,
        categoryIdentifier,
      };
    });
    await new Promise((resolve) => {
      const payload = JSON.stringify(messages);
      const req = https.request({
        hostname: 'exp.host',
        path: '/--/api/v2/push/send',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
      }, (res) => {
        let raw = '';
        res.on('data', (d) => raw += d);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            const successful = (parsed.data || []).filter(r => r.status === 'ok').length;
            sent += successful;
          } catch {
            sent += batch.length; // optimistic
          }
          resolve();
        });
      });
      req.on('error', () => resolve());
      req.write(payload);
      req.end();
    });
  }
  return sent;
};

module.exports = { initFirebase, sendPushNotification, sendExpoPushBatch };
