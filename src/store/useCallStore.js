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

      // Incoming call from socket — this user is the receiver
      setIncomingCall: (data) => {
        console.log('[useCallStore] setIncomingCall, callId:', data.callId, 'from:', data.from);
        set({
          callState: 'incoming',
          callType: data.callType,
          callId: data.callId,
          remoteUser: { _id: data.from, ...data.caller },
          offer: data.offer,
          remoteUserId: data.from,
          iceCandidates: [],
          endReason: null,
          isReceiver: true,
          answer: null,
        });
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
        });
        // Reset to idle after short delay
        setTimeout(() => {
          set({ callState: 'idle', remoteUser: null, callType: null, iceCandidates: [], endReason: null, isReceiver: false });
        }, 1500);
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
