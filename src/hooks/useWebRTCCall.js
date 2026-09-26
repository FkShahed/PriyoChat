import { useEffect, useRef, useCallback } from 'react';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import useCallStore from '../store/useCallStore';
import useSocketStore from '../store/useSocketStore';
import { InCallManager, webrtc } from '../utils/nativeModules';

// Conditionally load WebRTC based on platform
let RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices;
let webrtcAvailable = false;

try {
  if (Platform.OS === 'web') {
    RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    RTCIceCandidate = window.RTCIceCandidate;
    RTCSessionDescription = window.RTCSessionDescription;
    mediaDevices = navigator.mediaDevices;
    webrtcAvailable = !!RTCPeerConnection;
  } else if (webrtc && webrtc.RTCPeerConnection) {
    RTCPeerConnection = webrtc.RTCPeerConnection;
    RTCIceCandidate = webrtc.RTCIceCandidate;
    RTCSessionDescription = webrtc.RTCSessionDescription;
    mediaDevices = webrtc.mediaDevices;
    webrtcAvailable = true;
    console.log('[WebRTC] Native module loaded successfully');
  } else {
    webrtcAvailable = false;
    console.warn('[WebRTC] Native module is null or not loaded');
  }
} catch (err) {
  console.error('[WebRTC] Failed to load native module:', err.message);
  webrtcAvailable = false;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  }
];

const CONNECTION_TIMEOUT_MS = 45000; // 45 seconds ring timeout

// High-quality audio constraints
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  channelCount: 1,
};

// High-quality video constraints
const VIDEO_CONSTRAINTS = {
  facingMode: 'user',
  width: { ideal: 1280, min: 640 },
  height: { ideal: 720, min: 480 },
  frameRate: { ideal: 30, min: 15 },
};

/**
 * Safely parse and extract valid { type, sdp } from any offer/answer structure.
 * Handles native react-native-webrtc _sdp / _type fields and nested JSON structures.
 */
function extractSdpAndType(raw, defaultType = 'offer') {
  if (!raw) return { type: defaultType, sdp: '' };

  let obj = raw;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (e) {}
  }
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (e) {}
  }

  // Handle nested wrappers like { offer: ... }, { answer: ... }, { sessionDescription: ... }
  if (obj && typeof obj === 'object') {
    if (obj.offer) obj = obj.offer;
    else if (obj.answer) obj = obj.answer;
    else if (obj.sessionDescription) obj = obj.sessionDescription;

    if (typeof obj === 'string') {
      try { obj = JSON.parse(obj); } catch (e) {}
    }
  }

  if (typeof obj === 'string') {
    return { type: defaultType, sdp: obj };
  }

  const type = (obj?.type || obj?._type || defaultType).toLowerCase();

  let sdp = '';
  if (typeof obj?.sdp === 'string') {
    sdp = obj.sdp;
  } else if (typeof obj?._sdp === 'string') {
    sdp = obj._sdp;
  } else if (typeof obj?.sdp === 'object' && obj.sdp) {
    sdp = typeof obj.sdp.sdp === 'string' ? obj.sdp.sdp : (obj.sdp._sdp || '');
  } else if (typeof obj?._sdp === 'object' && obj._sdp) {
    sdp = typeof obj._sdp._sdp === 'string' ? obj._sdp._sdp : (obj._sdp.sdp || '');
  }

  return { type, sdp };
}

/**
 * Request camera/microphone permissions on Android at runtime.
 */
async function requestMediaPermissions(callType) {
  if (Platform.OS !== 'android') return true;

  try {
    const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (callType === 'video') {
      permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    }

    const results = await PermissionsAndroid.requestMultiple(permissions);
    const allGranted = Object.values(results).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED
    );

    if (!allGranted) {
      console.warn('[WebRTC] Permissions not granted:', results);
      Alert.alert('Permissions Required', 'Camera and microphone permissions are needed for calls.');
      return false;
    }
    console.log('[WebRTC] Permissions granted');
    return true;
  } catch (err) {
    console.error('[WebRTC] Permission request error:', err);
    return false;
  }
}

/**
 * useWebRTCCall — manages the full WebRTC peer connection lifecycle.
 */
export default function useWebRTCCall({
  remoteUserId,
  callType,
  isReceiver,
  offer,
  onRemoteStream,
  onLocalStream,
}) {
  const { emit } = useSocketStore();
  const { iceCandidates, answer } = useCallStore();

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const iceCandidatesProcessed = useRef(0);
  const initialized = useRef(false);
  const remoteDescReady = useRef(false);
  const answerAppliedRef = useRef(false);
  const pendingCandidates = useRef([]);
  const timeoutRef = useRef(null);

  // ─── Build peer connection ────────────────────────────────────────
  const buildPC = useCallback(() => {
    if (!webrtcAvailable) {
      console.error('[WebRTC] Cannot build peer connection — native module not available');
      return null;
    }

    console.log('[WebRTC] Building peer connection...');
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && remoteUserId) {
        console.log('[WebRTC] Sending ICE candidate');
        emit('call_ice', { to: remoteUserId, candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] ontrack event, streams:', event.streams?.length);
      if (event.streams?.[0]) {
        if (InCallManager) InCallManager.stopRingback();
        useCallStore.getState().setCallConnected();
        onRemoteStream?.(event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[WebRTC] connectionState:', state);

      if (state === 'connected') {
        if (InCallManager) InCallManager.stopRingback();
        useCallStore.getState().setCallConnected();
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else if (state === 'failed') {
        console.warn('[WebRTC] Connection failed');
        if (remoteUserId) emit('call_end', { to: remoteUserId });
        useCallStore.getState().endCall('ended');
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      console.log('[WebRTC] iceConnectionState:', iceState);

      if (iceState === 'connected' || iceState === 'completed') {
        if (InCallManager) InCallManager.stopRingback();
        useCallStore.getState().setCallConnected();
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    };

    pc.onsignalingstatechange = () => {
      console.log('[WebRTC] signalingState:', pc.signalingState);
    };

    return pc;
  }, [remoteUserId, emit, onRemoteStream]);

  // ─── Flush buffered ICE candidates ────────────────────────────────
  const flushCandidates = useCallback((pc) => {
    if (!pc || pc.signalingState === 'closed' || !remoteDescReady.current) return;

    const buffered = pendingCandidates.current;
    pendingCandidates.current = [];
    console.log('[WebRTC] Flushing', buffered.length, 'buffered ICE candidates');
    buffered.forEach((candidate) => {
      if (pc.signalingState !== 'closed') {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
          .catch((e) => console.warn('[WebRTC] addIceCandidate error (buffered):', e));
      }
    });

    const storeCandidates = useCallStore.getState().iceCandidates;
    const newCandidates = storeCandidates.slice(iceCandidatesProcessed.current);
    if (newCandidates.length > 0) {
      console.log('[WebRTC] Flushing', newCandidates.length, 'store ICE candidates');
    }
    newCandidates.forEach((candidate) => {
      if (pc.signalingState !== 'closed') {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
          .catch((e) => console.warn('[WebRTC] addIceCandidate error (store):', e));
      }
    });
    iceCandidatesProcessed.current = storeCandidates.length;
  }, []);

  // ─── Get local media ─────────────────────────────────────────────
  const getLocalMedia = useCallback(async () => {
    if (!webrtcAvailable || !mediaDevices) {
      throw new Error('WebRTC native module not available. You need a dev build, not Expo Go.');
    }

    // Request runtime permissions on Android
    const granted = await requestMediaPermissions(callType);
    if (!granted) {
      throw new Error('Camera/microphone permissions denied');
    }

    console.log('[WebRTC] Getting user media, callType:', callType);
    const constraints = {
      audio: AUDIO_CONSTRAINTS,
      video: callType === 'video' ? VIDEO_CONSTRAINTS : false,
    };

    const stream = await mediaDevices.getUserMedia(constraints);
    console.log('[WebRTC] Got local stream, tracks:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
    localStreamRef.current = stream;
    onLocalStream?.(stream);

    // Start InCallManager
    if (InCallManager) {
      try {
        const ringback = isReceiver ? '' : '_DEFAULT_';
        InCallManager.start({ media: callType === 'video' ? 'video' : 'audio', auto: true, ringback: '' });
        InCallManager.setForceSpeakerphoneOn(callType === 'video');
        console.log('[InCallManager] Started, speakerphone:', callType === 'video');
      } catch (e) {
        console.warn('[InCallManager] start error:', e);
      }
    }

    return stream;
  }, [callType, onLocalStream]);

  // ─── CALLER: create offer and start ──────────────────────────────
  const startAsCallerAsync = useCallback(async () => {
    try {
      console.log('[WebRTC] Starting as CALLER...');
      const pc = buildPC();
      if (!pc) {
        Alert.alert('Error', 'WebRTC is not available. Please use a development build.');
        useCallStore.getState().endCall('ended');
        return;
      }
      pcRef.current = pc;

      const stream = await getLocalMedia();
      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed while getting media, aborting caller setup');
        return;
      }

      stream.getTracks().forEach((track) => {
        if (pc.signalingState !== 'closed') {
          console.log('[WebRTC] Adding track to PC:', track.kind);
          pc.addTrack(track, stream);
        }
      });

      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed before createOffer, aborting');
        return;
      }

      const sessionOffer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video',
      });

      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed before setLocalDescription, aborting');
        return;
      }

      await pc.setLocalDescription(sessionOffer);
      console.log('[WebRTC] Offer created and set as local description');

      // Check if remote answer arrived while local offer setup was in progress
      const currentAnswer = useCallStore.getState().answer;
      if (currentAnswer && !answerAppliedRef.current && pc.signalingState === 'have-local-offer') {
        try {
          answerAppliedRef.current = true;
          console.log('[WebRTC] Applying early answer that arrived during offer creation...');
          const { type: answerType, sdp: answerSdp } = extractSdpAndType(currentAnswer, 'answer');
          if (answerSdp) {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: answerType, sdp: answerSdp }));
            console.log('[WebRTC] Remote answer applied successfully (early arrival)');
            remoteDescReady.current = true;
            flushCandidates(pc);
          } else {
            answerAppliedRef.current = false;
          }
        } catch (e) {
          answerAppliedRef.current = false;
          console.warn('[WebRTC] Early answer setRemoteDescription error:', e.message);
        }
      }

      const localDesc = pc.localDescription || sessionOffer;
      const offerPayload = {
        type: localDesc?.type || localDesc?._type || 'offer',
        sdp: localDesc?.sdp || localDesc?._sdp || sessionOffer.sdp,
      };

      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed after setLocalDescription, aborting offer emit');
        return;
      }

      emit('call_offer', {
        to: remoteUserId,
        offer: offerPayload,
        callType,
      });
      console.log('[WebRTC] Offer sent to:', remoteUserId);

      // Connection timeout
      timeoutRef.current = setTimeout(() => {
        console.warn('[WebRTC] Connection timeout — ending call');
        emit('call_end', { to: remoteUserId });
        useCallStore.getState().endCall('ended');
      }, CONNECTION_TIMEOUT_MS);
    } catch (err) {
      console.error('[WebRTC] Caller init error:', err);
      if (err.message && (err.message.includes('closed') || err.message.includes('wrong state'))) {
        console.warn('[WebRTC] Caller init aborted due to closed connection');
      } else {
        Alert.alert('Call Error', err.message || 'Failed to start call');
      }
      useCallStore.getState().endCall('ended');
    }
  }, [buildPC, getLocalMedia, remoteUserId, callType, emit]);

  // ─── RECEIVER: accept offer and create answer ─────────────────────
  const startAsReceiverAsync = useCallback(async () => {
    try {
      console.log('[WebRTC] Starting as RECEIVER...');
      if (!offer) {
        throw new Error('No offer received from caller');
      }

      const pc = buildPC();
      if (!pc) {
        Alert.alert('Error', 'WebRTC is not available. Please use a development build.');
        useCallStore.getState().endCall('ended');
        return;
      }
      pcRef.current = pc;

      const stream = await getLocalMedia();
      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed while getting media, aborting receiver setup');
        return;
      }

      stream.getTracks().forEach((track) => {
        if (pc.signalingState !== 'closed') {
          console.log('[WebRTC] Adding track to PC:', track.kind);
          pc.addTrack(track, stream);
        }
      });

      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed before setting remote description');
        return;
      }

      console.log('[WebRTC] Setting remote description (offer)...');
      const { type: offerType, sdp: offerSdp } = extractSdpAndType(offer, 'offer');
      if (!offerSdp) {
        throw new Error('Invalid or missing SDP offer session description');
      }
      await pc.setRemoteDescription(new RTCSessionDescription({ type: offerType, sdp: offerSdp }));
      remoteDescReady.current = true;
      console.log('[WebRTC] Remote description set successfully');

      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed after setting remote description');
        return;
      }

      // Flush any ICE candidates that arrived before remote desc was set
      flushCandidates(pc);

      const sessionAnswer = await pc.createAnswer();
      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed before setting local answer');
        return;
      }

      await pc.setLocalDescription(sessionAnswer);
      console.log('[WebRTC] Answer created and set as local description');

      const localAns = pc.localDescription || sessionAnswer;
      const answerPayload = {
        type: localAns?.type || localAns?._type || 'answer',
        sdp: localAns?.sdp || localAns?._sdp || sessionAnswer.sdp,
      };

      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed before sending answer');
        return;
      }

      emit('call_answer', {
        to: remoteUserId,
        answer: answerPayload,
      });
      console.log('[WebRTC] Answer sent to:', remoteUserId);

      // Connection timeout
      timeoutRef.current = setTimeout(() => {
        console.warn('[WebRTC] Connection timeout — ending call');
        emit('call_end', { to: remoteUserId });
        useCallStore.getState().endCall('ended');
      }, CONNECTION_TIMEOUT_MS);
    } catch (err) {
      console.error('[WebRTC] Receiver init error:', err);
      if (err.message && (err.message.includes('closed') || err.message.includes('wrong state'))) {
        console.warn('[WebRTC] Receiver init aborted due to closed connection');
      } else {
        Alert.alert('Call Error', err.message || 'Failed to answer call');
      }
      useCallStore.getState().endCall('ended');
    }
  }, [buildPC, getLocalMedia, offer, remoteUserId, emit, flushCandidates]);

  // ─── Initialize (once) ───────────────────────────────────────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (!webrtcAvailable) {
      console.error('[WebRTC] Native module not available — cannot make calls in Expo Go');
      Alert.alert(
        'Dev Build Required',
        'Video/audio calls require a development build. They cannot work in Expo Go.\n\nRun: eas build --platform android --profile preview',
      );
      useCallStore.getState().endCall('ended');
      return;
    }

    if (isReceiver) {
      startAsReceiverAsync();
    } else {
      startAsCallerAsync();
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (pcRef.current) {
        if (pcRef.current.signalingState !== 'closed') {
          try { pcRef.current.close(); } catch (e) {}
        }
        pcRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Caller: apply answer when received ──────────────────────────
  useEffect(() => {
    if (!answer || isReceiver || !pcRef.current || answerAppliedRef.current) return;
    const pc = pcRef.current;
    
    // An answer can ONLY be set if pc is currently in 'have-local-offer' state
    if (pc.signalingState !== 'have-local-offer') {
      console.log('[WebRTC] Skipping remote answer — signalingState is:', pc.signalingState, '(must be have-local-offer)');
      return;
    }

    (async () => {
      try {
        answerAppliedRef.current = true;
        console.log('[WebRTC] Applying remote answer...');
        const { type: answerType, sdp: answerSdp } = extractSdpAndType(answer, 'answer');
        if (!answerSdp) {
          console.warn('[WebRTC] Skipping invalid or empty remote answer SDP');
          answerAppliedRef.current = false;
          return;
        }
        if (pc.signalingState !== 'have-local-offer') {
          console.warn('[WebRTC] Signaling state changed before setRemoteDescription:', pc.signalingState);
          answerAppliedRef.current = false;
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription({ type: answerType, sdp: answerSdp }));
        console.log('[WebRTC] Remote answer applied successfully');
        remoteDescReady.current = true;
        flushCandidates(pc);
      } catch (e) {
        answerAppliedRef.current = false;
        console.warn('[WebRTC] setRemoteDescription answer error:', e.message);
      }
    })();
  }, [answer, isReceiver, flushCandidates]);

  // ─── Both sides: add incoming ICE candidates ─────────────────────
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || pc.signalingState === 'closed') return;

    const newCandidates = iceCandidates.slice(iceCandidatesProcessed.current);
    if (newCandidates.length === 0) return;

    if (!remoteDescReady.current) {
      // Buffer them — they'll be flushed after setRemoteDescription
      console.log('[WebRTC] Buffering', newCandidates.length, 'ICE candidates (remote desc not ready)');
      pendingCandidates.current = [...pendingCandidates.current, ...newCandidates];
      iceCandidatesProcessed.current = iceCandidates.length;
      return;
    }

    // Remote desc is ready — add directly
    console.log('[WebRTC] Adding', newCandidates.length, 'ICE candidates directly');
    newCandidates.forEach((candidate) => {
      if (pc.signalingState !== 'closed') {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
          .catch((e) => console.warn('[WebRTC] addIceCandidate error:', e));
      }
    });
    iceCandidatesProcessed.current = iceCandidates.length;
  }, [iceCandidates]);

  // ─── Expose cleanup ──────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (pcRef.current) {
      if (pcRef.current.signalingState !== 'closed') {
        try { pcRef.current.close(); } catch (e) {}
      }
      pcRef.current = null;
    }
    remoteDescReady.current = false;
    answerAppliedRef.current = false;
    pendingCandidates.current = [];
    if (InCallManager) {
      try {
        InCallManager.stop();
        console.log('[InCallManager] Stopped');
      } catch (e) {
        console.warn('[InCallManager] stop error:', e);
      }
    }
  }, []);

  const setSpeaker = useCallback((on) => {
    if (InCallManager) {
      try {
        InCallManager.setForceSpeakerphoneOn(on);
        console.log('[InCallManager] Speaker:', on);
        
        const state = useCallStore.getState().callState;
        const isDialing = state === 'calling' || state === 'ringing' || state === 'connecting';
        if (!isReceiver && isDialing) {
          InCallManager.stopRingback();
          setTimeout(() => {
            InCallManager.startRingback('_DEFAULT_');
          }, 100);
        }
      } catch (e) {
        console.warn('[InCallManager] setSpeaker error:', e);
      }
    }
  }, [isReceiver]);

  return { cleanup, setSpeaker };
}
