import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Calls (by callId) that were already answered / ended on this device. A late or repeated
// `incoming_call` for the same callId (socket reconnect replay, duplicate push, ...) must never
// make the phone ring again for a call the user already handled.
const HANDLED_CALL_TTL_MS = 2 * 60 * 1000;
const handledCalls = new Map();
const markCallHandled = (callId) => {
  if (!callId) return;
  const now = Date.now();
  handledCalls.set(String(callId), now);
  for (const [id, t] of handledCalls.entries()) {
    if (now - t > HANDLED_CALL_TTL_MS) handledCalls.delete(id);
  }
};
const wasCallHandled = (callId) => {
  if (!callId) return false;
  const t = handledCalls.get(String(callId));
  return !!t && Date.now() - t <= HANDLED_CALL_TTL_MS;
};

// Stop the Android "call keep-alive" foreground service (mic stays on with screen off).
// Called on every way a call can end — including ending a MINIMIZED call from the floating
// banner, where the call screen's cleanup() never runs. Safe no-op if it is not running.
const stopCallKeepAlive = () => {
  try {
    require('../utils/nativeModules').CallForegroundService.stop();
  } catch (e) {}
};

const useCallStore = create(
  persist(
    (set, get) => ({
      callHistory: [],

      // 'idle' | 'calling' | 'incoming' | 'connecting' | 'active' | 'ended'
      callState: 'idle',
      callType: null, // 'audio' | 'video'
      remoteUser: null,
      callId: null, // ID from the backend database
      callSessionId: null, // unique epoch token per call to invalidate stale ICE candidates
      offer: null,
      answer: null,
      iceCandidates: [],
          renegotiateOffer: null, // ICE-restart offer from the caller (receiver side)
          renegotiateAnswer: null, // ICE-restart answer from the receiver (caller side)
      endReason: null, // 'rejected' | 'ended' | 'missed'
      isReceiver: false, // true if this user is receiving the call (not the initiator)
      isMinimized: false,
      callDuration: 0,
      callStartTime: null, // epoch ms when WebRTC first connected — single source of truth for timer
      // The loudspeaker choice for the CURRENT call (true/false), or null until the call screen sets it. It lives here
      // (not only inside CallScreen) so that going back and returning to the call screen does not reset it to the default.
      speakerOn: null,
      setCallSpeaker: (val) => set({ speakerOn: typeof val === 'boolean' ? val : null }),
      setIsMinimized: (val) => set({ isMinimized: Boolean(val) }),
      setCallDuration: (fnOrVal) => set((prev) => ({ callDuration: typeof fnOrVal === 'function' ? fnOrVal(prev.callDuration) : fnOrVal })),

      addCallToHistory: (record) => {
        set((state) => ({
          callHistory: [record, ...state.callHistory].slice(0, 100), // keep latest 100
        }));
      },

      clearCallHistory: () => set({ callHistory: [] }),
      
      fetchHistory: async () => {
        try {
          const { callApi } = require('../api/services');
          const { data } = await callApi.getAll();
          console.log('[useCallStore] fetchHistory raw data:', JSON.stringify(data));
          
          if (!data || !data.data) {
            console.warn('[useCallStore] fetchHistory: No data returned');
            return;
          }

          // Map backend Call model to frontend history format
          const formatted = data.data.map(c => {
            const { user } = require('./useAuthStore').default.getState();
            const isReceiver = c.receiver?._id?.toString() === user?._id?.toString();
            const remoteUser = isReceiver ? c.caller : c.receiver;
            
            return {
              id: c._id,
              ownerId: user?._id?.toString(),
              type: c.type,
              direction: isReceiver ? 'incoming' : 'outgoing',
              status: c.status,
              remoteUser,
              timestamp: c.startedAt
            };
          });
          
          console.log('[useCallStore] fetchHistory success, count:', formatted.length);
          set({ callHistory: formatted });
        } catch (e) {
          console.error('[useCallStore] fetchHistory error:', e.message);
        }
      },

      // Outgoing call — initiated by this user
      startCall: (remoteUser, callType) => {
        let resolvedUser = remoteUser;
        let remoteUserId = null;
        if (typeof remoteUser === 'string') {
          remoteUserId = remoteUser;
          resolvedUser = { _id: remoteUser, id: remoteUser, name: 'PriyoChat User' };
        } else if (remoteUser && typeof remoteUser === 'object') {
          remoteUserId = remoteUser._id || remoteUser.id || null;
        }
        const callSessionId = Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
        console.log('[useCallStore] startCall session:', callSessionId, 'to:', remoteUserId);
        set({
          callState: 'calling',
          remoteUser: resolvedUser,
          remoteUserId,
          callType,
          callSessionId,
          iceCandidates: [],
          renegotiateOffer: null, // ICE-restart offer from the caller (receiver side)
          renegotiateAnswer: null, // ICE-restart answer from the receiver (caller side)
          endReason: null,
          isReceiver: false,
          offer: null,
          answer: null,
          callId: null,
          callStartTime: null,
          callDuration: 0,
          speakerOn: null,
        });
      },

      setCallRinging: () => {
        set((state) => (state.callState === 'calling' ? { callState: 'ringing' } : {}));
      },

      // Incoming call from socket or push — this user is the receiver
      setIncomingCall: (data) => {
        const state = get();
        const { callState, callId: existingCallId } = state;

        let callerObj = data.caller;
        if (typeof callerObj === 'string') {
          try { callerObj = JSON.parse(callerObj); } catch (e) {}
        }
        if (!callerObj || typeof callerObj !== 'object') {
          callerObj = {};
        }

        let offerObj = data.offer;
        if (typeof offerObj === 'string') {
          try { offerObj = JSON.parse(offerObj); } catch (e) {}
        }

        const callerId = callerObj._id || callerObj.id || data.from || data.callerId || state.remoteUserId;
        const callerName = callerObj.name || data.callerName || data.name || state.remoteUser?.name || 'PriyoChat User';
        const callerAvatar = callerObj.avatar || data.avatar || state.remoteUser?.avatar || null;

        const resolvedRemoteUser = {
          ...callerObj,
          _id: callerId,
          id: callerId,
          name: callerName,
          avatar: callerAvatar,
        };

        // If already connecting or active in a call:
        if (callState === 'active' || callState === 'connecting') {
          const isSameCall =
            (existingCallId && data.callId && String(existingCallId) === String(data.callId)) ||
            (callerId && String(state.remoteUserId) === String(callerId)) ||
            (!existingCallId && data.callId);

          if (isSameCall) {
            console.log('[useCallStore] Preserving connecting/active call, attaching offer/metadata:', data.callId);
            set((s) => ({
              callId: s.callId || data.callId,
              offer: s.offer || offerObj || data.offer,
              remoteUserId: s.remoteUserId || callerId,
              remoteUser: s.remoteUser || resolvedRemoteUser,
            }));
            return true;
          }
          console.warn('[useCallStore] Device busy (state:', callState, '), ignoring different incoming call');
          return false;
        }

        // This exact call was already answered/ended here: ignore the stale repeat (no re-ring).
        if (data.callId && wasCallHandled(data.callId) && (callState === 'idle' || callState === 'ended')) {
          console.log('[useCallStore] Ignoring stale incoming call already handled:', data.callId);
          return false;
        }

        console.log('[useCallStore] setIncomingCall, callId:', data.callId, 'from:', callerId);

        const callSessionId = data.callSessionId || (Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6));

        // If an incoming call from the same session/caller is updated or candidates arrived early,
        // PRESERVE the existing iceCandidates array instead of resetting it to []!
        const preservedCandidates = Array.isArray(state.iceCandidates) ? state.iceCandidates : [];

        set({
          callState: 'incoming',
          callType: data.callType || state.callType || 'audio',
          callId: data.callId || state.callId,
          callSessionId: state.callSessionId || callSessionId,
          remoteUser: resolvedRemoteUser,
          offer: offerObj || data.offer || state.offer,
          remoteUserId: callerId,
          iceCandidates: preservedCandidates,
          endReason: null,
          isReceiver: true,
          answer: null,
          callStartTime: null,
          callDuration: 0,
          speakerOn: null,
        });
        return true;
      },

      // Receiver accepted — transitional state while WebRTC connects
      setCallAccepted: () => {
        markCallHandled(get().callId);
        set({ callState: 'connecting' });
      },

      // True if this callId was already answered/ended on this device (used to ignore replays)
      isCallHandled: (callId) => wasCallHandled(callId),

      // Caller received SDP answer from receiver
      setCallAnswered: (answer) => {
        set({ answer, callState: 'connecting' });
      },

      // Both sides: WebRTC peer connection is actually connected
      setCallConnected: () => {
        const { callState, callStartTime } = get();
        // Only transition if we're in a valid pre-active state
        // NOTE: 'ringing' is included because the caller goes calling→ringing
        // and ICE can connect while the receiver's phone is still ringing
        if (
          callState === 'connecting' ||
          callState === 'calling' ||
          callState === 'ringing' ||
          callState === 'incoming'
        ) {
          set({
            callState: 'active',
            // Only set callStartTime once — preserve it if already set (re-attach scenario)
            callStartTime: callStartTime || Date.now(),
            callDuration: 0,
          });
        }
      },

      // Legacy — kept for backward compat but prefer setCallConnected
      setCallActive: () => {
        set({ callState: 'active' });
      },

      // ICE restart (fresh network paths) during an ongoing call setup. Stored with a timestamp so
      // every new offer/answer is a new object and triggers the hook's effect exactly once.
      setRenegotiateOffer: (offer) => {
        const { callState } = get();
        if (!offer || callState === 'idle' || callState === 'ended') return;
        set({ renegotiateOffer: { sdp: offer, at: Date.now() } });
      },
      setRenegotiateAnswer: (answer) => {
        const { callState } = get();
        if (!answer || callState === 'idle' || callState === 'ended') return;
        set({ renegotiateAnswer: { sdp: answer, at: Date.now() } });
      },

      addIceCandidate: (candidate) => {
        if (!candidate) return;
        const { callState } = get();
        // Do not drop early candidates when idle (they arrive before setIncomingCall)
        if (callState === 'ended') return;
        set((state) => ({ iceCandidates: [...state.iceCandidates, candidate] }));
      },

      endCall: (reason = 'ended') => {
        const state = get();
        markCallHandled(state.callId);
        stopCallKeepAlive();
        console.log('[useCallStore] endCall, state:', state.callState, 'remoteUser:', state.remoteUser?.name, 'isReceiver:', state.isReceiver);
        try { require('../utils/audioNormalize').scheduleAudioNormalize(); } catch (e) { /* never block ending a call */ }

        // Immediately dismiss all system notifications & stop native CallKeep ringing
        try {
          const NotificationService = require('../services/NotificationService').default;
          NotificationService.dismissCallNotification();
        } catch (e) {}
        try {
          const CallKeepService = require('../services/CallKeepService').default;
          CallKeepService.endCall();
        } catch (e) {}

        if (state.remoteUser && state.callState !== 'idle' && state.callState !== 'ended') {
          const isMissed = (state.callState === 'calling' || state.callState === 'incoming' || state.callState === 'connecting') && reason !== 'rejected';
          const status = reason === 'rejected' ? 'rejected' : (isMissed ? 'missed' : 'completed');
          let ownerId = null;
          try {
            const authStore = require('./useAuthStore').default;
            ownerId = authStore.getState().user?._id?.toString();
          } catch (e) {
            console.warn('[useCallStore] Could not get ownerId:', e.message);
          }
          state.addCallToHistory({
            id: Date.now().toString() + Math.random().toString(),
            ownerId,
            type: state.callType || 'audio',
            direction: state.isReceiver ? 'incoming' : 'outgoing',
            status,
            remoteUser: state.remoteUser,
            timestamp: new Date().toISOString(),
          });
        }

        set({
          callState: 'ended',
          endReason: reason,
          offer: null,
          answer: null,
          remoteUser: null,
          remoteUserId: null,
          callSessionId: null,
          callType: null,
          iceCandidates: [],
          renegotiateOffer: null, // ICE-restart offer from the caller (receiver side)
          renegotiateAnswer: null, // ICE-restart answer from the receiver (caller side)
          isReceiver: false,
          callId: null,
          isMinimized: false,
          callDuration: 0,
          callStartTime: null,
          speakerOn: null,
        });
      },

      resetCall: () => {
        markCallHandled(get().callId);
        stopCallKeepAlive();
        try { require('../utils/audioNormalize').scheduleAudioNormalize(); } catch (e) { /* never block ending a call */ }
        set({
          callState: 'idle',
          callType: null,
          remoteUser: null,
          remoteUserId: null,
          callSessionId: null,
          offer: null,
          answer: null,
          iceCandidates: [],
          renegotiateOffer: null, // ICE-restart offer from the caller (receiver side)
          renegotiateAnswer: null, // ICE-restart answer from the receiver (caller side)
          endReason: null,
          isReceiver: false,
          callId: null,
          isMinimized: false,
          callDuration: 0,
          callStartTime: null,
          speakerOn: null,
        });
      },
    }),
    {
      name: 'priyochat-call-history',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ callHistory: state.callHistory }), // only persist history
    }
  )
);

export default useCallStore;
