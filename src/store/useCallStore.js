import { create } from 'zustand';

const useCallStore = create((set, get) => ({
  // 'idle' | 'calling' | 'incoming' | 'active' | 'ended'
  callState: 'idle',
  callType: null, // 'audio' | 'video'
  remoteUser: null,
  offer: null,
  answer: null,
  iceCandidates: [],
  endReason: null, // 'rejected' | 'ended' | 'missed'

  // Outgoing call
  startCall: (remoteUser, callType) => {
    set({ callState: 'calling', remoteUser, callType, iceCandidates: [], endReason: null });
  },

  // Incoming call from socket
  setIncomingCall: (data) => {
    set({
      callState: 'incoming',
      callType: data.callType,
      remoteUser: { _id: data.from, ...data.caller },
      offer: data.offer,
      iceCandidates: [],
      endReason: null,
    });
  },

  setCallAnswered: (answer) => {
    set({ answer, callState: 'active' });
  },

  setCallActive: () => {
    set({ callState: 'active' });
  },

  addIceCandidate: (candidate) => {
    set((state) => ({ iceCandidates: [...state.iceCandidates, candidate] }));
  },

  endCall: (reason = 'ended') => {
    set({
      callState: 'ended',
      endReason: reason,
      offer: null,
      answer: null,
    });
    // Reset to idle after delay
    setTimeout(() => {
      set({ callState: 'idle', remoteUser: null, callType: null, iceCandidates: [], endReason: null });
    }, 2000);
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
    });
  },
}));

export default useCallStore;
