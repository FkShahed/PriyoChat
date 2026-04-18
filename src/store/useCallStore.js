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
  isReceiver: false, // true if this user is receiving the call (not the initiator)

  // Outgoing call — initiated by this user
  startCall: (remoteUser, callType) => {
    set({ callState: 'calling', remoteUser, callType, iceCandidates: [], endReason: null, isReceiver: false });
  },

  // Incoming call from socket — this user is the receiver
  setIncomingCall: (data) => {
    set({
      callState: 'incoming',
      callType: data.callType,
      remoteUser: { _id: data.from, ...data.caller },
      offer: data.offer,
      iceCandidates: [],
      endReason: null,
      isReceiver: true,
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
}));

export default useCallStore;
