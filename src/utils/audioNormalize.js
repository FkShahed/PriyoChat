import { Platform } from 'react-native';

// After a call ends, put the phone's audio routing back to normal so other apps (YouTube, Facebook...) play through the
// loudspeaker / headset as usual, not through the small earpiece at the top of the phone.
//
// Why it is needed: during a call the app asks expo-av to "play through the earpiece". expo-av remembers that choice and
// re-applies it (communication mode + speaker off) every time any app's audio focus changes, even long after the call, until
// the app process is killed. Setting the choice back to "not the earpiece" once the call is really over clears it.
//
// It only runs when no call is in progress or starting, so it can never disturb a call.
let pending = false;

export function scheduleAudioNormalize() {
  if (Platform.OS !== 'android' || pending) return;
  pending = true;
  // twice: once after the call teardown has finished, and once more after the audio manager has fully released
  [700, 2600].forEach((delay, i) => {
    setTimeout(() => {
      if (i === 1) pending = false;
      try {
        const store = require('../store/useCallStore').default;
        const st = store.getState().callState;
        if (st !== 'idle' && st !== 'ended') return; // a new call has started: leave the audio alone
        const { Audio } = require('expo-av');
        Audio.setAudioModeAsync({
          playsInSilentModeIOS: false,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        }).catch(() => {});
      } catch (e) { /* best effort */ }
    }, delay);
  });
}
