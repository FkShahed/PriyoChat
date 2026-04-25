const admin = require('firebase-admin');
const https = require('https');

let firebaseApp;

const initFirebase = () => {
  if (!firebaseApp && process.env.FIREBASE_PROJECT_ID) {
    try {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
      console.log('✅ Firebase Admin initialized');
    } catch (err) {
      console.warn('⚠️  Firebase init skipped:', err.message);
    }
  }
};

// Send to a single token — auto-detects Expo vs FCM token
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  if (!fcmToken) return;

  // Expo Push Token (ExponentPushToken[...])
  if (fcmToken.startsWith('ExponentPushToken') || fcmToken.startsWith('ExpoPushToken')) {
    return sendExpoNotification(fcmToken, title, body, data);
  }

  // Raw FCM token — use Firebase Admin SDK
  if (!firebaseApp) return;
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
  } catch (err) {
    console.warn('FCM push failed:', err.message);
  }
};

// Send via Expo Push API (single notification)
const sendExpoNotification = (to, title, body, data = {}) => {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ to, title, body, data, sound: 'default', priority: 'high' });
    const req = https.request({
      hostname: 'exp.host',
      path: '/--/api/v2/push/send',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
    }, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', (err) => {
      console.warn('Expo push failed:', err.message);
      resolve();
    });
    req.write(payload);
    req.end();
  });
};

// Bulk send via Expo Push API (up to 100 tokens per batch)
const sendExpoPushBatch = async (tokens, title, body, data = {}) => {
  const BATCH_SIZE = 100;
  let sent = 0;
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const messages = batch.map((to) => ({ to, title, body, data, sound: 'default', priority: 'high' }));
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
