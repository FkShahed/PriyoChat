import RNCallKeep from 'react-native-callkeep';
import { Platform } from 'react-native';
import { navigationRef } from '../navigation/navigationRef';

const options = {
  ios: {
    appName: 'PriyoChat',
  },
  android: {
    alertTitle: 'Permissions required',
    alertDescription: 'PriyoChat requires access to phone calls to display incoming calls',
    cancelButton: 'Cancel',
    okButton: 'OK',
    imageName: 'ic_launcher',
    additionalPermissions: [],
    selfManaged: true, // Self-managed mode for custom app UI
  },
};

class CallKeepService {
  static _initialized = false;
  static _activeCallUuid = null;

  static async initialize() {
    if (this._initialized || Platform.OS === 'web') return;
    try {
      await RNCallKeep.setup(options);
      RNCallKeep.setAvailable(true);
      this._setupListeners();
      this._initialized = true;
      console.log('[CallKeep] Initialized successfully ✅');
    } catch (err) {
      console.warn('[CallKeep] Setup error:', err.message);
    }
  }

  static displayIncomingCall(uuid, callerName, handle = 'PriyoChat', callType = 'audio') {
    if (Platform.OS === 'web') return;
    try {
      this._activeCallUuid = uuid;
      RNCallKeep.displayIncomingCall(
        uuid,
        handle,
        callerName || 'PriyoChat User',
        'generic',
        callType === 'video'
      );
      try {
        RNCallKeep.backToForeground();
      } catch (e) {}
      console.log('[CallKeep] Displaying native incoming call for UUID:', uuid);
    } catch (e) {
      console.warn('[CallKeep] displayIncomingCall error:', e.message);
    }
  }

  static endCall(uuid) {
    if (Platform.OS === 'web') return;
    try {
      const targetUuid = uuid || this._activeCallUuid;
      if (targetUuid) {
        RNCallKeep.endCall(targetUuid);
        this._activeCallUuid = null;
      }
    } catch (e) {}
  }

  static _setupListeners() {
    RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
      console.log('[CallKeep] Native answerCall triggered:', callUUID);
      RNCallKeep.backToForeground();
      try {
        const useCallStore = require('../store/useCallStore').default;
        const state = useCallStore.getState();
        if (state.callState === 'incoming') {
          state.setCallAccepted();
          if (navigationRef.isReady()) {
            navigationRef.navigate('Call', {
              otherUser: state.remoteUser,
              callType: state.callType,
            });
          }
        }
      } catch (e) {
        console.warn('[CallKeep] answerCall handler error:', e.message);
      }
    });

    RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
      console.log('[CallKeep] Native endCall triggered:', callUUID);
      try {
        const useCallStore = require('../store/useCallStore').default;
        const state = useCallStore.getState();
        // Only reject if user was in a real active or incoming call state
        if (state.callState === 'incoming') {
          state.endCall('rejected');
        } else if (state.callState === 'active' || state.callState === 'connecting') {
          state.endCall('ended');
        }
      } catch (e) {}
    });
  }
}

export default CallKeepService;
