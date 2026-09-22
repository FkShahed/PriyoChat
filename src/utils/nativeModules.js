let InCallManager = null;
let webrtc = null;
let GoogleSignin = null;
let statusCodes = {};

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

export { InCallManager, webrtc, GoogleSignin, statusCodes };
