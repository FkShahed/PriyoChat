import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const useCallStore = create(
  persist(
    (set, get) => ({
      callHistory: [],

      // 'idle' | 'calling' | 'incoming' | 'connecting' | 'active' | 'ended'
      callState: 'idle',
      callType: null, // 'audio' | 'video'
      remoteUser: null,
      callId: null, // ID from the backend database
      offer: null,
      answer: null,
      iceCandidates: [],
      endReason: null, // 'rejected' | 'ended' | 'missed'
      isReceiver: false, // true if this user is receiving the call (not the initiator)

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
        set({ callState: 'calling', remoteUser, callType, iceCandidates: [], endReason: null, isReceiver: false, offer: null, answer: null });
      },

      setCallRinging: () => {
        set((state) => (state.callState === 'calling' ? { callState: 'ringing' } : {}));
      },

      // Incoming call from socket or push — this user is the receiver
      setIncomingCall: (data) => {
        const { callState, callId: existingCallId } = get();
        if (callState === 'active' || callState === 'connecting') {
          // If it's the exact same call (duplicate notification/socket event), treat as accepted so we don't auto-reject
          if (existingCallId && String(existingCallId) === String(data.callId)) {
            console.log('[useCallStore] Duplicate incoming call event received for active callId:', data.callId);
            return true;
          }
          console.warn('[useCallStore] Device busy (state:', callState, '), ignoring incoming call');
          return false;
        }
        console.log('[useCallStore] setIncomingCall, callId:', data.callId, 'from:', data.from);

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

        const callerId = callerObj._id || callerObj.id || data.from;
        const callerName = callerObj.name || data.callerName || data.name || 'PriyoChat User';
        const callerAvatar = callerObj.avatar || data.avatar || null;

        const resolvedRemoteUser = {
          _id: callerId,
          avatar: callerAvatar,
          ...callerObj,
          name: callerName,
        };

        console.log('[useCallStore] setIncomingCall resolved remoteUser name:', resolvedRemoteUser.name, 'id:', callerId);

        set({
          callState: 'incoming',
          callType: data.callType || 'audio',
          callId: data.callId,
          remoteUser: resolvedRemoteUser,
          offer: offerObj || data.offer,
          remoteUserId: callerId,
          iceCandidates: [],
          endReason: null,
          isReceiver: true,
          answer: null,
        });
        return true;
      },

      // Receiver accepted — transitional state while WebRTC connects
      setCallAccepted: () => {
        set({ callState: 'connecting' });
      },

      // Caller received SDP answer from receiver
      setCallAnswered: (answer) => {
        set({ answer, callState: 'connecting' });
      },

      // Both sides: WebRTC peer connection is actually connected
      setCallConnected: () => {
        const { callState } = get();
        // Only transition if we're in a valid pre-active state
        if (callState === 'connecting' || callState === 'calling' || callState === 'incoming') {
          set({ callState: 'active' });
        }
      },

      // Legacy — kept for backward compat but prefer setCallConnected
      setCallActive: () => {
        set({ callState: 'active' });
      },

      addIceCandidate: (candidate) => {
        set((state) => ({ iceCandidates: [...state.iceCandidates, candidate] }));
      },

      endCall: (reason = 'ended') => {
        const state = get();
        console.log('[useCallStore] endCall, state:', state.callState, 'remoteUser:', state.remoteUser?.name, 'isReceiver:', state.isReceiver);

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
          callState: 'idle',
          endReason: reason,
          offer: null,
          answer: null,
          remoteUser: null,
          callType: null,
          iceCandidates: [],
          isReceiver: false,
        });
      },

      resetCall: () => {
        set({
          callState: 'idle',
          callType: null,
          remoteUser: null,
          offer: null,
          answer: null,
          iceCandidates: [],
          endReason: null,
          isReceiver: false,
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
