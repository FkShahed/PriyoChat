import { create } from 'zustand';

const useCallStore = create((set, get) => ({
  // 'idle' | 'calling' | 'incoming' | 'connecting' | 'active' | 'ended'
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
    set({ callState: 'calling', remoteUser, callType, iceCandidates: [], endReason: null, isReceiver: false, offer: null, answer: null });
  },

  // Incoming call from socket — this user is the receiver
  setIncomingCall: (data) => {
    set({
      callState: 'incoming',
      callType: data.callType,
      remoteUser: { _id: data.from, ...data.caller },
      offer: data.offer,          // full SDP object for WebRTC
      remoteUserId: data.from,    // shortcut for ICE routing
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
