import { useEffect, useRef, useCallback, useState } from 'react';
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

function getIceServers() {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' },
    {
      urls: [
        'turn:a.relay.metered.ca:80',
        'turn:a.relay.metered.ca:443',
        'turn:a.relay.metered.ca:443?transport=tcp',
        'turn:a.relay.metered.ca:80?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: [
        'turns:a.relay.metered.ca:443?transport=tcp',
        'turns:a.relay.metered.ca:5349',
        'turns:a.relay.metered.ca:5349?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: [
        'turn:b.relay.metered.ca:80',
        'turn:b.relay.metered.ca:443',
        'turn:b.relay.metered.ca:443?transport=tcp',
        'turn:b.relay.metered.ca:80?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: [
        'turns:b.relay.metered.ca:443?transport=tcp',
        'turns:b.relay.metered.ca:5349',
        'turns:b.relay.metered.ca:5349?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];
}

const CONNECTION_TIMEOUT_MS = 45000; // 45 seconds ring timeout

// High-quality audio constraints
const AUDIO_CONSTRAINTS = Platform.OS === 'web'
  ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  : true;

// High-quality video constraints
const VIDEO_CONSTRAINTS = Platform.OS === 'web'
  ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
  : { facingMode: 'user' };

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
 * Safely parse and normalize raw ICE candidate objects.
 * Eliminates explicit null fields so Android native JNI binding won't crash or fail type checks.
 */
function extractIceCandidate(raw) {
  if (!raw) return null;
  let obj = raw;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (e) {}
  }
  if (obj && typeof obj === 'object') {
    if (obj.candidate && typeof obj.candidate === 'object') {
      obj = obj.candidate;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const candStr = typeof obj.candidate === 'string' ? obj.candidate.trim() : '';
  if (!candStr) return null;

  const res = {
    candidate: candStr,
  };

  if (obj.sdpMLineIndex !== null && obj.sdpMLineIndex !== undefined) {
    res.sdpMLineIndex = Number(obj.sdpMLineIndex);
  }
  if (obj.sdpMid !== null && obj.sdpMid !== undefined) {
    res.sdpMid = String(obj.sdpMid);
  }

  if (res.sdpMLineIndex === undefined && res.sdpMid === undefined) {
    res.sdpMLineIndex = 0;
  }

  return res;
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

  const [connectionState, setConnectionState] = useState('new');
  const [iceConnectionState, setIceConnectionState] = useState('new');
  const [errorMessage, setErrorMessage] = useState('');

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const iceCandidatesProcessed = useRef(0);
  const initialized = useRef(false);
  const remoteDescReady = useRef(false);
  const answerAppliedRef = useRef(false);
  const pendingCandidates = useRef([]);
  const timeoutRef = useRef(null);

  const onRemoteStreamRef = useRef(onRemoteStream);
  const onLocalStreamRef = useRef(onLocalStream);
  const remoteUserIdRef = useRef(remoteUserId);
  const callTypeRef = useRef(callType);
  const isReceiverRef = useRef(isReceiver);
  const emitRef = useRef(emit);

  useEffect(() => { onRemoteStreamRef.current = onRemoteStream; }, [onRemoteStream]);
  useEffect(() => { onLocalStreamRef.current = onLocalStream; }, [onLocalStream]);
  useEffect(() => { remoteUserIdRef.current = remoteUserId; }, [remoteUserId]);
  useEffect(() => { callTypeRef.current = callType; }, [callType]);
  useEffect(() => { isReceiverRef.current = isReceiver; }, [isReceiver]);
  useEffect(() => { emitRef.current = emit; }, [emit]);

  // ─── Build peer connection ────────────────────────────────────────
  const buildPC = useCallback(() => {
    if (!webrtcAvailable) {
      console.error('[WebRTC] Cannot build peer connection — native module not available');
      return null;
    }

    console.log('[WebRTC] Building peer connection...');
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && candidate.candidate && remoteUserIdRef.current) {
        console.log('[WebRTC] Sending ICE candidate to:', remoteUserIdRef.current);
        emitRef.current('call_ice', { to: remoteUserIdRef.current, candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] ontrack event, track kind:', event.track?.kind, 'id:', event.track?.id, 'streams:', event.streams?.length);

      useCallStore.getState().setCallConnected();

      if (event.track) {
        try { event.track.enabled = true; } catch (e) {}
      }

      let stream = event.streams?.[0];
      if (stream) {
        try {
          stream.getTracks().forEach((t) => { t.enabled = true; });
        } catch (e) {}

        let url = '';
        try { url = typeof stream.toURL === 'function' ? stream.toURL() : (stream.streamURL || ''); } catch(e) {}
        console.log('[WebRTC] Remote stream URL:', url, 'tracks:', stream.getTracks?.().map(t => `${t.kind}:${t.enabled}:${t.readyState}`));

        console.log('[WebRTC] Emitting remote stream to UI');
        onRemoteStreamRef.current?.(stream, Date.now());
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[WebRTC] connectionState:', state);
      setConnectionState(state);

      if (state === 'connected') {
        useCallStore.getState().setCallConnected();
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else if (state === 'failed') {
        console.warn('[WebRTC] Connection failed, checking for recovery...');
        setErrorMessage('Direct connection failed • Checking relay...');
        if (pc.restartIce) {
          try { pc.restartIce(); } catch (e) {}
        }
        setTimeout(() => {
          if (pcRef.current && pcRef.current.connectionState === 'failed' && pcRef.current.iceConnectionState === 'failed') {
            console.warn('[WebRTC] Connection failed after grace period, ending call');
            if (remoteUserIdRef.current) emitRef.current('call_end', { to: remoteUserIdRef.current });
            useCallStore.getState().endCall('ended');
          }
        }, 15000);
      } else if (state === 'disconnected') {
        console.warn('[WebRTC] Connection disconnected, waiting for reconnect...');
        setErrorMessage('Connection temporarily lost • Reconnecting...');
        setTimeout(() => {
          if (pcRef.current && pcRef.current.connectionState === 'disconnected' && pcRef.current.iceConnectionState === 'disconnected') {
            console.warn('[WebRTC] Disconnected timeout — ending call');
            if (remoteUserIdRef.current) emitRef.current('call_end', { to: remoteUserIdRef.current });
            useCallStore.getState().endCall('ended');
          }
        }, 15000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      console.log('[WebRTC] iceConnectionState:', iceState);
      setIceConnectionState(iceState);

      if (iceState === 'connected' || iceState === 'completed') {
        useCallStore.getState().setCallConnected();
        setErrorMessage('');
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else if (iceState === 'failed') {
        console.warn('[WebRTC] ICE state failed, attempting ICE restart...');
        setErrorMessage('Network path blocked • Retrying relay...');
        if (pc.restartIce) {
          try { pc.restartIce(); } catch (e) {}
        }
      }
    };

    pc.onsignalingstatechange = () => {
      console.log('[WebRTC] signalingState:', pc.signalingState);
    };

    return pc;
  }, []);

  // ─── Flush buffered ICE candidates ────────────────────────────────
  const flushCandidates = useCallback((pc) => {
    if (!pc || pc.signalingState === 'closed' || !remoteDescReady.current) return;

    const buffered = pendingCandidates.current;
    pendingCandidates.current = [];
    console.log('[WebRTC] Flushing', buffered.length, 'buffered ICE candidates');
    buffered.forEach((candidate) => {
      const validCandidate = extractIceCandidate(candidate);
      if (validCandidate && pc.signalingState !== 'closed') {
        pc.addIceCandidate(new RTCIceCandidate(validCandidate))
          .catch((e) => console.warn('[WebRTC] addIceCandidate error (buffered):', e));
      }
    });

    const storeCandidates = useCallStore.getState().iceCandidates;
    const newCandidates = storeCandidates.slice(iceCandidatesProcessed.current);
    if (newCandidates.length > 0) {
      console.log('[WebRTC] Flushing', newCandidates.length, 'store ICE candidates');
    }
    newCandidates.forEach((candidate) => {
      const validCandidate = extractIceCandidate(candidate);
      if (validCandidate && pc.signalingState !== 'closed') {
        pc.addIceCandidate(new RTCIceCandidate(validCandidate))
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

    const currentCallType = callTypeRef.current;

    // Request runtime permissions on Android
    const granted = await requestMediaPermissions(currentCallType);
    if (!granted) {
      throw new Error('Camera/microphone permissions denied');
    }

    console.log('[WebRTC] Getting user media, callType:', currentCallType);
    const constraints = {
      audio: AUDIO_CONSTRAINTS,
      video: currentCallType === 'video' ? VIDEO_CONSTRAINTS : false,
    };

    let stream;
    try {
      stream = await mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.warn('[WebRTC] getUserMedia initial error (hardware release pending?), retrying in 400ms:', err.message);
      await new Promise((resolve) => setTimeout(resolve, 400));
      stream = await mediaDevices.getUserMedia(constraints);
    }
    console.log('[WebRTC] Got local stream, tracks:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
    localStreamRef.current = stream;
    onLocalStreamRef.current?.(stream);

    // Start InCallManager
    if (InCallManager) {
      try {
        InCallManager.start({ media: currentCallType === 'video' ? 'video' : 'audio', auto: true, ringback: '' });
        InCallManager.setForceSpeakerphoneOn(currentCallType === 'video');
        console.log('[InCallManager] Started, speakerphone:', currentCallType === 'video');
      } catch (e) {
        console.warn('[InCallManager] start error:', e);
      }
    }

    return stream;
  }, []);

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
        offerToReceiveVideo: callTypeRef.current === 'video',
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

      emitRef.current('call_offer', {
        to: remoteUserIdRef.current,
        offer: offerPayload,
        callType: callTypeRef.current,
      });
      console.log('[WebRTC] Offer sent to:', remoteUserIdRef.current);

      // Connection timeout
      timeoutRef.current = setTimeout(() => {
        console.warn('[WebRTC] Connection timeout — ending call');
        if (remoteUserIdRef.current) emitRef.current('call_end', { to: remoteUserIdRef.current });
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
  }, [buildPC, getLocalMedia, flushCandidates]);

  // ─── RECEIVER: accept offer and create answer ─────────────────────
  const startAsReceiverAsync = useCallback(async () => {
    try {
      console.log('[WebRTC] Starting as RECEIVER...');
      const currentOffer = useCallStore.getState().offer || offer;
      if (!currentOffer) {
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
      const { type: offerType, sdp: offerSdp } = extractSdpAndType(currentOffer, 'offer');
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

      emitRef.current('call_answer', {
        to: remoteUserIdRef.current,
        answer: answerPayload,
      });
      console.log('[WebRTC] Answer sent to:', remoteUserIdRef.current);

      // Connection timeout
      timeoutRef.current = setTimeout(() => {
        console.warn('[WebRTC] Connection timeout — ending call');
        if (remoteUserIdRef.current) emitRef.current('call_end', { to: remoteUserIdRef.current });
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
  }, [buildPC, getLocalMedia, offer, flushCandidates]);

  // ─── Expose cleanup ──────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (localStreamRef.current) {
      const stream = localStreamRef.current;
      localStreamRef.current = null;
      try {
        stream.getTracks().forEach((track) => {
          try { track.enabled = false; } catch (e) {}
          try { track.stop(); } catch (e) {}
        });
        if (typeof stream.release === 'function') {
          stream.release();
        }
      } catch (e) {
        console.warn('[WebRTC] localStream cleanup error:', e);
      }
    }

    if (pcRef.current) {
      const pc = pcRef.current;
      pcRef.current = null;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      if (pc.signalingState !== 'closed') {
        try {
          pc.close();
        } catch (e) {
          console.warn('[WebRTC] pc.close error:', e);
        }
      }
    }

    initialized.current = false;
    remoteDescReady.current = false;
    answerAppliedRef.current = false;
    iceCandidatesProcessed.current = 0;
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

    if (isReceiverRef.current) {
      startAsReceiverAsync();
    } else {
      startAsCallerAsync();
    }

    return () => {
      cleanup();
    };
  }, [startAsCallerAsync, startAsReceiverAsync, cleanup]);

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
      const validCandidate = extractIceCandidate(candidate);
      if (validCandidate && pc.signalingState !== 'closed') {
        pc.addIceCandidate(new RTCIceCandidate(validCandidate))
          .catch((e) => console.warn('[WebRTC] addIceCandidate error:', e));
      }
    });
    iceCandidatesProcessed.current = iceCandidates.length;
  }, [iceCandidates]);

  const setSpeaker = useCallback((on) => {
    if (InCallManager) {
      try {
        InCallManager.setForceSpeakerphoneOn(on);
        console.log('[InCallManager] Speaker:', on);
      } catch (e) {
        console.warn('[InCallManager] setSpeaker error:', e);
      }
    }
  }, []);

  return { cleanup, setSpeaker, connectionState, iceConnectionState, errorMessage };
}
