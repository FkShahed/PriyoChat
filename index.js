/**
 * @format
 */

// react-native-webrtc: Register globals if available (requires dev build, not Expo Go)
try {
  const { registerGlobals } = require('react-native-webrtc');
  registerGlobals();
  console.log('[WebRTC] Globals registered successfully');
} catch (e) {
  console.warn('[WebRTC] Native module not available (expected in Expo Go):', e.message);
}

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
