/**
 * @format
 */

import { Platform } from 'react-native';

// react-native-webrtc: Register globals on native platforms only (web uses browser WebRTC APIs)
if (Platform.OS !== 'web') {
  try {
    const { registerGlobals } = require('react-native-webrtc');
    registerGlobals();
    console.log('[WebRTC] Globals registered successfully');
  } catch (e) {
    console.warn('[WebRTC] Native module not available (expected in Expo Go):', e.message);
  }
}

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
