import { Platform } from 'react-native';

class CallKeepService {
  static _initialized = false;
  static _activeCallUuid = null;

  static async initialize() {
    this._initialized = true;
    console.log('[CallKeep] Service initialized (safe stub mode)');
  }

  static displayIncomingCall(uuid, callerName, handle = 'PriyoChat', callType = 'audio') {
    this._activeCallUuid = uuid;
    console.log('[CallKeep] Incoming call handled via In-App Banner & Notifications for UUID:', uuid);
  }

  static endCall(uuid) {
    this._activeCallUuid = null;
    console.log('[CallKeep] Call ended for UUID:', uuid);
  }
}

export default CallKeepService;
