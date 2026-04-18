const admin = require('firebase-admin');

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

const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  if (!firebaseApp || !fcmToken) return;
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
  } catch (err) {
    console.warn('Push notification failed:', err.message);
  }
};

module.exports = { initFirebase, sendPushNotification };
