import { Platform } from 'react-native';

let InCallManager = null;
let webrtc = null;
let GoogleSignin = null;
let statusCodes = {};

if (Platform.OS !== 'web') {
  try {
  InCallManager = require('react-native-incall-manager').default;
} catch (e) {
  console.warn('[InCallManager] not available natively');
}

try {
  webrtc = require('react-native-webrtc');
} catch (e) {
  console.warn('[WebRTC] not available natively');
}

  try {
    const RNGoogleSignin = require('@react-native-google-signin/google-signin');
    GoogleSignin = RNGoogleSignin.GoogleSignin;
    statusCodes = RNGoogleSignin.statusCodes || {};
  } catch (e) {
    console.warn('[GoogleSignin] not available natively');
  }
} else {
  console.warn('Native modules bypassed on web platform.');
}

export { InCallManager, webrtc, GoogleSignin, statusCodes };
