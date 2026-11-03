import { Platform, NativeModules, NativeEventEmitter, AppState } from 'react-native';

let InCallManager = null;
let webrtc = null;
let GoogleSignin = null;
let statusCodes = {};

// Keeps mic (and camera, for video calls) capture alive when the screen turns off during a call
// (Android only — see CallForegroundService.kt). Falls back to no-ops everywhere else (iOS/web,
// or if the native module is missing for any reason), so calling always behaves exactly as it
// did before this existed — this is a pure best-effort enhancement, never a dependency.
const CallForegroundService = {
  start(isVideo) {
    try {
      // Android 14+ only allows starting a microphone/camera foreground service while the app is
      // visible. Never attempt it from the background (it would be refused anyway).
      if (AppState.currentState === 'background') return;
      if (Platform.OS === 'android' && NativeModules.CallForegroundServiceModule) {
        NativeModules.CallForegroundServiceModule.start(Boolean(isVideo));
      }
    } catch (e) {
      console.warn('[CallForegroundService] start error:', e?.message);
    }
  },
  stop() {
    try {
      if (Platform.OS === 'android' && NativeModules.CallForegroundServiceModule) {
        NativeModules.CallForegroundServiceModule.stop();
      }
    } catch (e) {
      console.warn('[CallForegroundService] stop error:', e?.message);
    }
  },
};

// App swiped away from Recents during a call: native exits the process ~1.5s later (so the next
// call starts clean). Use that window to hang up properly so the other side ends immediately
// instead of hanging on "Reconnecting" — and the server clears the active call record.
if (Platform.OS === 'android' && NativeModules.CallForegroundServiceModule) {
  try {
    const emitter = new NativeEventEmitter(NativeModules.CallForegroundServiceModule);
    emitter.addListener('PriyoCallTaskRemoved', () => {
      try {
        const callStore = require('../store/useCallStore').default;
        const socket = require('../store/useSocketStore').default.getState().socket;
        const s = callStore.getState();
        const rawTo = s.remoteUserId || s.remoteUser?._id || s.remoteUser?.id;
        const to = rawTo && typeof rawTo === 'object' ? (rawTo._id || rawTo.id) : rawTo;
        if (to && socket?.connected) {
          const duration = s.callStartTime ? Math.round((Date.now() - s.callStartTime) / 1000) : 0;
          socket.emit('call_end', { to: String(to), callId: s.callId, duration, callType: s.callType || 'audio' });
        }
        if (s.callState !== 'idle' && s.callState !== 'ended') s.endCall('ended');
      } catch (e) {}
    });
  } catch (e) {}
}

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

export { InCallManager, webrtc, GoogleSignin, statusCodes, CallForegroundService };
