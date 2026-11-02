import { useEffect, useRef, useCallback, useState } from 'react';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import useCallStore from '../store/useCallStore';
import useSocketStore from '../store/useSocketStore';
import { InCallManager, webrtc } from '../utils/nativeModules';

// Conditionally load WebRTC based on platform
let RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices;
let webrtcAvailable = false;

// Module-level persistent active call session across screen remounts
let activeCallSession = null;

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
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:138.2.92.182:3478' },
    {
      urls: 'turn:138.2.92.182:3478?transport=udp',
      username: 'shahed',
      credential: '123456'
    },
    {
      urls: 'turn:138.2.92.182:3478?transport=tcp',
      username: 'shahed',
      credential: '123456'
    },
    {
      urls: 'turn:138.2.92.182:3478',
      username: 'shahed',
      credential: '123456'
    },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];
}

/**
 * Turn a raw technical call error into a short message a normal user understands.
 * Returns null when no alert should be shown (an alert was already shown elsewhere).
 */
function friendlyCallError(err, role) {
  const raw = String(err?.message || err || '');
  const msg = raw.toLowerCase();

  if (msg.includes('no offer received') || msg.includes('offer not found') || msg.includes('expired')) {
    return {
      title: 'Call ended',
      message: 'The caller hung up before the call could connect.',
    };
  }
  if (msg.includes('permissions denied')) {
    return null; // the permission prompt/alert was already shown
  }
  if (msg.includes('notallowed') || msg.includes('permission') || msg.includes('microphone') || msg.includes('camera')) {
    return {
      title: 'Microphone or camera unavailable',
      message: 'Please allow microphone (and camera for video calls) access in Settings and try again.',
    };
  }
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('timed out') || msg.includes('socket')) {
    return {
      title: 'Connection problem',
      message: 'We could not reach the other person. Please check your internet connection and try again.',
    };
  }
  if (msg.includes('invalid or missing sdp')) {
    return {
      title: 'Call could not start',
      message: 'The call data was incomplete. Please ask the caller to try again.',
    };
  }
  return {
    title: role === 'caller' ? 'Could not start the call' : 'Could not connect the call',
    message: 'Something went wrong while connecting. Please try again in a moment.',
  };
}

// Answer arriving later than this after dialling = caller's network paths may be stale → if not
// connected LATE_ANSWER_CHECK_DELAY_MS after applying the answer, the caller restarts ICE.
const LATE_ANSWER_MS = 15000;
const LATE_ANSWER_CHECK_DELAY_MS = 4000;

const CONNECTION_TIMEOUT_MS =45000; // 45 seconds ring timeout

// High-quality audio constraints with echo cancellation & noise suppression
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  ...(Platform.OS !== 'web' ? {
    googEchoCancellation: true,
    googAutoGainControl: true,
    googNoiseSuppression: true,
    googHighpassFilter: true,
  } : {}),
};

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

  if (typeof obj?.toJSON === 'function') {
    try {
      const json = obj.toJSON();
      if (json && typeof json === 'object') {
        obj = { ...obj, ...json };
      }
    } catch (e) {}
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
 * Prioritize a specific video codec (e.g. VP8) in the SDP so that
 * Android devices (libwebrtc) receive standard VP8 streams they can always hardware-decode.
 */
function preferCodec(sdp, codec = 'VP8') {
  if (!sdp || typeof sdp !== 'string') return sdp;
  const lines = sdp.split('\r\n');
  const mVideoIndex = lines.findIndex((l) => l.startsWith('m=video'));
  if (mVideoIndex === -1) return sdp;

  const codecRegex = new RegExp(`^a=rtpmap:(\\d+)\\s+${codec}/`, 'i');
  let targetPayload = null;
  for (const line of lines) {
    const match = line.match(codecRegex);
    if (match && match[1]) {
      targetPayload = match[1];
      break;
    }
  }

  if (!targetPayload) return sdp;

  const mVideoLine = lines[mVideoIndex];
  const parts = mVideoLine.split(' ');
  const header = parts.slice(0, 3);
  const payloads = parts.slice(3);

  const filteredPayloads = payloads.filter((p) => p !== targetPayload);
  const newPayloads = [targetPayload, ...filteredPayloads];
  lines[mVideoIndex] = `${header.join(' ')} ${newPayloads.join(' ')}`;

  return lines.join('\r\n');
}

/**
 * Retrieve the active LAN IP of the host machine (e.g. 192.168.1.102)
 * from Metro bundler on Android or location.hostname on Web.
 */
function getLanHost() {
  if (Platform.OS === 'android') {
    try {
      const { NativeModules } = require('react-native');
      const scriptURL = NativeModules?.SourceCode?.scriptURL;
      if (scriptURL) {
        const match = scriptURL.match(/^https?:\/\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
        if (match && match[1]) {
          return match[1];
        }
      }
    } catch (e) {}
  } else if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.location) {
        const host = window.location.hostname;
        if (host && /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(host)) {
          return host;
        }
      }
    } catch (e) {}
  }
  // Default fallback to host computer IP running Metro/Backend
  return '192.168.1.102';
}

/**
 * Safely parse and normalize raw ICE candidate objects across React Native and Web.
 * Handles _candidate, _sdpMid, _sdpMLineIndex internal fields, unmasks mDNS .local hostnames,
 * and eliminates explicit nulls.
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

  if (typeof obj.toJSON === 'function') {
    try {
      const json = obj.toJSON();
      if (json && typeof json === 'object') {
        obj = { ...obj, ...json };
      }
    } catch (e) {}
  }

  let candStr = (
    (typeof obj.candidate === 'string' ? obj.candidate : '') ||
    (typeof obj._candidate === 'string' ? obj._candidate : '') ||
    (typeof obj.sdp === 'string' ? obj.sdp : '')
  ).trim();

  if (!candStr) return null;

  const rawMLine = obj.sdpMLineIndex != null ? obj.sdpMLineIndex : obj._sdpMLineIndex;
  const rawMid = obj.sdpMid != null ? obj.sdpMid : obj._sdpMid;

  const res = {
    candidate: candStr,
  };

  if (rawMLine !== null && rawMLine !== undefined) {
    res.sdpMLineIndex = Number(rawMLine);
  }
  if (rawMid !== null && rawMid !== undefined) {
    res.sdpMid = String(rawMid);
  }

  // Cross-fill missing fields so both sdpMLineIndex and sdpMid are guaranteed for Android & Web
  if (res.sdpMLineIndex === undefined || res.sdpMLineIndex === null || isNaN(res.sdpMLineIndex)) {
    res.sdpMLineIndex = res.sdpMid === '1' ? 1 : 0;
  }
  if (res.sdpMid === undefined || res.sdpMid === null || res.sdpMid === '') {
    res.sdpMid = String(res.sdpMLineIndex ?? 0);
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
  initialSpeakerOn,
  onRemoteStream,
  onLocalStream,
}) {
  const { emit } = useSocketStore();
  const { iceCandidates, answer, renegotiateOffer, renegotiateAnswer } = useCallStore();

  const [connectionState, setConnectionState] = useState('new');
  const [iceConnectionState, setIceConnectionState] = useState('new');
  const [errorMessage, setErrorMessage] = useState('');

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteMediaStreamRef = useRef(null);
  const iceCandidatesProcessed = useRef(0);
  const initialized = useRef(false);
  const remoteDescReady = useRef(false);
  const answerAppliedRef = useRef(false);
  const pendingCandidates = useRef([]);
  const addedCandidates = useRef(new Set());
  const timeoutRef = useRef(null);
  // ── ICE restart (caller side) ──
  // Used only when the first connection attempt cannot work: answer arrived late (caller's network
  // paths went stale while ringing) or ICE failed. The normal fast path never touches this.
  const offerSentAtRef = useRef(0);
  const iceRestartAttemptsRef = useRef(0);
  const iceRestartPendingRef = useRef(false);
  const iceRestartTimerRef = useRef(null);
  const lateAnswerCheckTimerRef = useRef(null);
  const handledRenegotiateOfferRef = useRef(0);
  const handledRenegotiateAnswerRef = useRef(0);
  const performIceRestartRef = useRef(null);

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
  const initialSpeakerOnRef = useRef(initialSpeakerOn);
  useEffect(() => { initialSpeakerOnRef.current = initialSpeakerOn; }, [initialSpeakerOn]);

  // Helper: safely emit signaling messages, ensuring socket is connected even after cold/background start
  const safeEmit = useCallback(async (event, payload) => {
    try {
      const socketStore = require('../store/useSocketStore').default;
      let socket = socketStore.getState().socket;
      if (!socket || !socket.connected) {
        socket = await socketStore.getState().connect();
      }
      if (socket && socket.connected) {
        socket.emit(event, payload);
        return;
      }
    } catch (e) {}
    emitRef.current?.(event, payload);
  }, []);

  // ─── Build peer connection ────────────────────────────────────────
  const buildPC = useCallback(() => {
    if (!webrtcAvailable) {
      console.error('[WebRTC] Cannot build peer connection — native module not available');
      return null;
    }

    // Clean up any lingering previous peer connection
    if (pcRef.current) {
      console.log('[WebRTC] Closing lingering peer connection before creating new one...');
      try {
        const oldPc = pcRef.current;
        pcRef.current = null;
        try {
          oldPc.getSenders?.().forEach((s) => {
            try { s.track?.stop(); } catch (e) {}
            try { oldPc.removeTrack?.(s); } catch (e) {}
          });
          oldPc.getReceivers?.().forEach((r) => {
            try { r.track?.stop(); } catch (e) {}
          });
          oldPc.getTransceivers?.().forEach((t) => {
            try { t.stop?.(); } catch (e) {}
          });
        } catch (e) {}
        oldPc.onicecandidate = null;
        oldPc.ontrack = null;
        oldPc.onconnectionstatechange = null;
        oldPc.oniceconnectionstatechange = null;
        oldPc.onsignalingstatechange = null;
        if (oldPc.signalingState !== 'closed') {
          oldPc.close();
        }
      } catch (e) {
        console.warn('[WebRTC] Error closing lingering PC:', e);
      }
    }

    console.log('[WebRTC] Building peer connection with max-bundle and unified-plan...');
    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceTransportPolicy: 'all', // 'all' = try direct first, fall back to TURN. Never force 'relay' or WiFi breaks.
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      sdpSemantics: 'unified-plan',
    });

    pc.onicecandidate = (event) => {
      const cand = event?.candidate;
      const storeState = useCallStore.getState();
      const rawTarget = remoteUserIdRef.current || remoteUserId || storeState.remoteUserId || storeState.remoteUser?._id || storeState.remoteUser?.id;
      const targetId = typeof rawTarget === 'object' && rawTarget !== null ? (rawTarget._id || rawTarget.id) : String(rawTarget || '').trim();
      if (!cand || !targetId) return;
      const parsed = extractIceCandidate(cand);
      if (parsed && parsed.candidate) {
        console.log('[WebRTC] Sending clean ICE candidate to:', targetId, parsed.candidate.substring(0, 45));
        safeEmit('call_ice', { to: targetId, candidate: parsed, callId: storeState.callId });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] ontrack event, track kind:', event.track?.kind, 'id:', event.track?.id, 'streams:', event.streams?.length);

      if (event.track) {
        try { event.track.enabled = true; } catch (e) {}
      }

      let stream = event.streams?.[0];
      if (!stream) {
        if (!remoteMediaStreamRef.current) {
          const MediaStreamConstructor = webrtc?.MediaStream || (typeof MediaStream !== 'undefined' ? MediaStream : null);
          if (MediaStreamConstructor) {
            remoteMediaStreamRef.current = new MediaStreamConstructor();
          }
        }
        if (remoteMediaStreamRef.current && event.track) {
          try { remoteMediaStreamRef.current.addTrack(event.track); } catch (e) {}
        }
        stream = remoteMediaStreamRef.current;
      } else {
        remoteMediaStreamRef.current = stream;
      }

      if (stream) {
        try {
          stream.getTracks().forEach((t) => { t.enabled = true; });
        } catch (e) {}

        let url = '';
        try { url = typeof stream.toURL === 'function' ? stream.toURL() : (stream.streamURL || ''); } catch(e) {}
        console.log('[WebRTC] Remote stream URL:', url, 'tracks:', stream.getTracks?.().map(t => `${t.kind}:${t.enabled}:${t.readyState}`));

        const hasVideo = stream.getVideoTracks?.()?.some(t => t.enabled !== false && t.readyState !== 'ended');
        console.log('[WebRTC] Emitting remote stream to UI, hasVideo:', hasVideo);

        // Defer stream emit to avoid setState-during-render React error.
        // NOTE: setCallConnected() is strictly driven by onconnectionstatechange/oniceconnectionstatechange.
        setTimeout(() => {
          setErrorMessage('');
          onRemoteStreamRef.current?.(stream, Date.now(), hasVideo);
        }, 0);
      } else {
        setTimeout(() => {
          setErrorMessage('');
        }, 0);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[WebRTC] connectionState:', state);
      // Defer to avoid setState-during-render React error
      setTimeout(() => setConnectionState(state), 0);

      if (state === 'connected') {
        useCallStore.getState().setCallConnected();
        setTimeout(() => setErrorMessage(''), 0);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        try {
          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = true; });
          }
        } catch (e) {}
        if (InCallManager) {
          try {
            const isVideo = callTypeRef.current === 'video';
            InCallManager.start({ media: isVideo ? 'video' : 'audio', auto: false, ringback: '' });
          } catch (e) {}
        }
      } else if (state === 'failed') {
        console.warn('[WebRTC] Connection failed, checking for recovery...');
        setTimeout(() => setErrorMessage('Direct connection failed • Checking relay...'), 0);
        if (pc.restartIce) {
          try { pc.restartIce(); } catch (e) {}
        }
        // Caller: real ICE restart with fresh network paths (no-op on the receiver)
        try { performIceRestartRef.current?.('connection_failed'); } catch (e) {}
        setTimeout(() => {
          if (pcRef.current && pcRef.current.connectionState === 'failed' && pcRef.current.iceConnectionState === 'failed') {
            console.warn('[WebRTC] Connection failed after grace period, ending call');
            if (remoteUserIdRef.current) emitRef.current('call_end', { to: remoteUserIdRef.current });
            useCallStore.getState().endCall('ended');
          }
        }, 30000);
      } else if (state === 'disconnected') {
        console.warn('[WebRTC] Connection disconnected, waiting for reconnect...');
        setTimeout(() => setErrorMessage('Connection temporarily lost • Reconnecting...'), 0);
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
      // Defer to avoid setState-during-render React error
      setTimeout(() => setIceConnectionState(iceState), 0);

      if (iceState === 'connected' || iceState === 'completed') {
        useCallStore.getState().setCallConnected();
        setTimeout(() => setErrorMessage(''), 0);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else if (iceState === 'failed') {
        console.warn('[WebRTC] ICE state failed, attempting ICE restart...');
        setTimeout(() => setErrorMessage('Network path blocked • Retrying relay...'), 0);
        if (pc.restartIce) {
          try { pc.restartIce(); } catch (e) {}
        }
        // Caller: real ICE restart with fresh network paths (no-op on the receiver)
        try { performIceRestartRef.current?.('ice_failed'); } catch (e) {}
      }
    };

    pc.onsignalingstatechange = () => {
      console.log('[WebRTC] signalingState:', pc.signalingState);
    };

    if (activeCallSession) { activeCallSession.pc = pc; } else { activeCallSession = { pc, localStream: null, remoteStream: null, hasVideo: false }; }
    return pc;
  }, []);

  // ─── Flush buffered ICE candidates ────────────────────────────────
  const flushCandidates = useCallback((pc) => {
    if (!pc || pc.signalingState === 'closed') return;
    if (!remoteDescReady.current) return;
    if (isReceiverRef.current && !answerAppliedRef.current) return;

    const buffered = pendingCandidates.current;
    pendingCandidates.current = [];
    if (buffered.length > 0) {
      console.log('[WebRTC] Flushing', buffered.length, 'buffered ICE candidates');
    }
    buffered.forEach((candidate) => {
      const validCandidate = extractIceCandidate(candidate);
      if (validCandidate && pc.signalingState !== 'closed') {
        const key = `${validCandidate.sdpMid ?? ''}_${validCandidate.sdpMLineIndex ?? ''}_${validCandidate.candidate}`;
        if (key && addedCandidates.current.has(key)) return;
        if (key) addedCandidates.current.add(key);

        console.log('[WebRTC] Adding candidate to PC (buffered):', validCandidate.candidate.substring(0, 45));
        try {
          const iceObj = (RTCIceCandidate && typeof RTCIceCandidate === 'function')
            ? new RTCIceCandidate(validCandidate)
            : validCandidate;
          pc.addIceCandidate(iceObj).catch((e) => {
            console.warn('[WebRTC] addIceCandidate error (buffered):', e.message);
          });
        } catch (e) {
          try { pc.addIceCandidate(validCandidate).catch(() => {}); } catch(err) {}
        }
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
        const key = `${validCandidate.sdpMid ?? ''}_${validCandidate.sdpMLineIndex ?? ''}_${validCandidate.candidate}`;
        if (key && addedCandidates.current.has(key)) return;
        if (key) addedCandidates.current.add(key);

        console.log('[WebRTC] Adding candidate to PC (store):', validCandidate.candidate.substring(0, 45));
        try {
          const iceObj = (RTCIceCandidate && typeof RTCIceCandidate === 'function')
            ? new RTCIceCandidate(validCandidate)
            : validCandidate;
          pc.addIceCandidate(iceObj).catch((e) => {
            console.warn('[WebRTC] addIceCandidate error (store):', e.message);
          });
        } catch (e) {
          try { pc.addIceCandidate(validCandidate).catch(() => {}); } catch(err) {}
        }
      }
    });
    iceCandidatesProcessed.current = storeCandidates.length;
  }, []);

  // ─── Get local media ─────────────────────────────────────────────
  const getLocalMedia = useCallback(async () => {
    if (!webrtcAvailable || !mediaDevices) {
      throw new Error('WebRTC native module not available. You need a dev build, not Expo Go.');
    }

    // Proactively stop previous local stream if still active
    if (localStreamRef.current) {
      console.log('[WebRTC] Releasing previous local media before acquiring new stream...');
      try {
        localStreamRef.current.getTracks().forEach((track) => {
          try { track.enabled = false; } catch (e) {}
          try { track.stop(); } catch (e) {}
        });
      } catch (e) {}
      localStreamRef.current = null;
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
      console.warn('[WebRTC] getUserMedia initial error (retrying after delay):', err.message);
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        stream = await mediaDevices.getUserMedia(constraints);
      } catch (err2) {
        console.warn('[WebRTC] getUserMedia second attempt error, falling back to basic constraints:', err2.message);
        await new Promise((resolve) => setTimeout(resolve, 400));
        stream = await mediaDevices.getUserMedia({
          audio: true,
          video: currentCallType === 'video' ? true : false,
        });
      }
    }
    console.log('[WebRTC] Got local stream, tracks:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
    localStreamRef.current = stream;
    if (activeCallSession) activeCallSession.localStream = stream;
    onLocalStreamRef.current?.(stream);

    // Start InCallManager
    if (InCallManager) {
      try {
        const isVideo = currentCallType === 'video';
        // For audio calls, ALWAYS force speaker off (earpiece mode) initially for both caller and receiver!
        // Only video calls start on speakerphone.
        const speaker = isVideo ? true : false;
        InCallManager.start({ media: isVideo ? 'video' : 'audio', auto: false, ringback: '' });
        InCallManager.setSpeakerphoneOn(speaker);
        InCallManager.setForceSpeakerphoneOn(speaker);
        if (typeof InCallManager.chooseAudioRoute === 'function') {
          InCallManager.chooseAudioRoute(speaker ? 'SPEAKER_PHONE' : 'EARPIECE').catch(() => {});
        }
        
        // Multi-stage re-assertion for Android audio routing to guarantee earpiece for audio calls
        // This overcomes OEM race conditions with ringtone cleanup / restoreOriginalAudioSetup
        [100, 300, 600, 1200].forEach((delay) => {
          setTimeout(() => {
            if (InCallManager) {
              try {
                InCallManager.setSpeakerphoneOn(speaker);
                InCallManager.setForceSpeakerphoneOn(speaker);
                if (typeof InCallManager.chooseAudioRoute === 'function') {
                  InCallManager.chooseAudioRoute(speaker ? 'SPEAKER_PHONE' : 'EARPIECE').catch(() => {});
                }
              } catch (err) {}
            }
          }, delay);
        });
        console.log('[InCallManager] Started, enforced speakerphone:', speaker);
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

      // Apply standard VP8 preference for maximum cross-platform compatibility (Web <-> Android)
      try {
        if (typeof RTCRtpSender !== 'undefined' && RTCRtpSender.getCapabilities) {
          const capabilities = RTCRtpSender.getCapabilities('video');
          if (capabilities && capabilities.codecs) {
            const vp8 = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/vp8');
            const others = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() !== 'video/vp8');
            const sorted = [...vp8, ...others];
            pc.getTransceivers().forEach((t) => {
              if (t.sender?.track?.kind === 'video' && typeof t.setCodecPreferences === 'function') {
                t.setCodecPreferences(sorted);
                console.log('[WebRTC] Applied VP8 codec preference to video transceiver');
              }
            });
          }
        }
      } catch (e) {}

      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed before createOffer, aborting');
        return;
      }

      let sessionOffer = await pc.createOffer();

      if (sessionOffer?.sdp) {
        const preferredSdp = preferCodec(sessionOffer.sdp, 'VP8');
        sessionOffer = { type: sessionOffer.type, sdp: preferredSdp };
      }

      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed before setLocalDescription, aborting');
        return;
      }

      await pc.setLocalDescription(sessionOffer);
      console.log('[WebRTC] Offer created and set as local description (VP8 preferred)');

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

      const storeState = useCallStore.getState();
      const rawTarget = remoteUserIdRef.current || remoteUserId || storeState.remoteUserId || storeState.remoteUser?._id || storeState.remoteUser?.id;
      const targetId = typeof rawTarget === 'object' && rawTarget !== null ? (rawTarget._id || rawTarget.id) : String(rawTarget || '').trim();
      emitRef.current('call_offer', {
        to: targetId,
        offer: offerPayload,
        callType: callTypeRef.current,
      });
      console.log('[WebRTC] Offer sent to:', targetId);
      offerSentAtRef.current = Date.now();

      // Connection timeout
      timeoutRef.current = setTimeout(() => {
        console.warn('[WebRTC] Connection timeout — ending call');
        if (targetId) emitRef.current('call_end', { to: targetId });
        useCallStore.getState().endCall('ended');
      }, CONNECTION_TIMEOUT_MS);
    } catch (err) {
      console.error('[WebRTC] Caller init error:', err);
      if (err.message && (err.message.includes('closed') || err.message.includes('wrong state'))) {
        console.warn('[WebRTC] Caller init aborted due to closed connection');
      } else {
        const friendly = friendlyCallError(err, 'caller');
        if (friendly) Alert.alert(friendly.title, friendly.message);
      }
      useCallStore.getState().endCall('ended');
    }
  }, [buildPC, getLocalMedia, flushCandidates]);

  // ─── RECEIVER: accept offer and create answer ─────────────────────
  const startAsReceiverAsync = useCallback(async () => {
    try {
      console.log('[WebRTC] Starting as RECEIVER...');
      let currentOffer = useCallStore.getState().offer || offer;

      // If offer is missing (e.g. app opened from background push notification), request it from backend socket!
      if (!currentOffer) {
        console.log('[WebRTC] Offer not found in memory, requesting from socket server...');
        const callId = useCallStore.getState().callId;
        const offerResponse = await new Promise((resolve) => {
          let timer = null;
          let done = false;
          const finish = (val) => {
            if (!done) {
              done = true;
              if (timer) clearTimeout(timer);
              resolve(val);
            }
          };

          // Give up to 15 seconds for cellular cold-start handshake
          timer = setTimeout(() => {
            console.warn('[WebRTC] Timeout waiting for call offer from socket');
            finish(null);
          }, 15000);

          try {
            const socketStore = require('../store/useSocketStore').default;
            const tryFetch = (socket) => {
              if (socket && socket.connected) {
                socket.emit('get_call_offer', { callId }, (res) => {
                  finish(res);
                });
                return true;
              }
              return false;
            };

            let socket = socketStore.getState().socket;
            if (tryFetch(socket)) return;

            socketStore.getState().connect().then((s) => {
              const connectedSocket = s || socketStore.getState().socket;
              if (!tryFetch(connectedSocket) && connectedSocket) {
                connectedSocket.once('connect', () => {
                  tryFetch(connectedSocket);
                });
              }
            }).catch(() => {});
          } catch (e) {
            finish(null);
          }
        });

        if (offerResponse?.offer) {
          console.log('[WebRTC] Obtained offer from socket server successfully!');
          currentOffer = offerResponse.offer;
          useCallStore.setState({ offer: currentOffer });
          if (Array.isArray(offerResponse.iceCandidates) && offerResponse.iceCandidates.length > 0) {
            console.log('[WebRTC] Applying', offerResponse.iceCandidates.length, 'buffered early ICE candidates from server');
            offerResponse.iceCandidates.forEach((item) => {
              const cand = item.candidate || item;
              useCallStore.getState().addIceCandidate(cand);
            });
          }
        }
      }

      // The offer may have reached the store (socket replay) while we were waiting
      if (!currentOffer) {
        currentOffer = useCallStore.getState().offer;
      }

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

      // 1. Get local media FIRST so hardware is ready and tracks can be attached to the answer
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

      // 2. Set remote description (offer)
      console.log('[WebRTC] Setting remote description (offer)...');
      const { type: offerType, sdp: offerSdp } = extractSdpAndType(currentOffer, 'offer');
      if (!offerSdp) {
        throw new Error('Invalid or missing SDP offer session description');
      }
      const desc = (RTCSessionDescription && typeof RTCSessionDescription === 'function')
        ? new RTCSessionDescription({ type: offerType, sdp: offerSdp })
        : { type: offerType, sdp: offerSdp };
      await pc.setRemoteDescription(desc);
      remoteDescReady.current = true;
      console.log('[WebRTC] Remote description set successfully');

      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed after setting remote description');
        return;
      }

      // 3. Create and set local answer
      try {
        if (typeof RTCRtpSender !== 'undefined' && RTCRtpSender.getCapabilities) {
          const capabilities = RTCRtpSender.getCapabilities('video');
          if (capabilities && capabilities.codecs) {
            const vp8 = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/vp8');
            const others = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() !== 'video/vp8');
            const sorted = [...vp8, ...others];
            pc.getTransceivers().forEach((t) => {
              if (t.sender?.track?.kind === 'video' && typeof t.setCodecPreferences === 'function') {
                t.setCodecPreferences(sorted);
              }
            });
          }
        }
      } catch (e) {}

      let sessionAnswer = await pc.createAnswer();
      if (sessionAnswer?.sdp) {
        const preferredSdp = preferCodec(sessionAnswer.sdp, 'VP8');
        sessionAnswer = { type: sessionAnswer.type, sdp: preferredSdp };
      }

      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed before setting local answer');
        return;
      }

      await pc.setLocalDescription(sessionAnswer);
      console.log('[WebRTC] Answer created and set as local description (VP8 preferred)');
      answerAppliedRef.current = true;

      // 4. Flush all ICE candidates NOW that BOTH remote and local descriptions are established!
      flushCandidates(pc);

      const localAns = pc.localDescription || sessionAnswer;
      const answerPayload = {
        type: localAns?.type || localAns?._type || 'answer',
        sdp: localAns?.sdp || localAns?._sdp || sessionAnswer.sdp,
      };

      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed before sending answer');
        return;
      }

      const storeState = useCallStore.getState();
      const rawTarget = remoteUserIdRef.current || remoteUserId || storeState.remoteUserId || storeState.remoteUser?._id || storeState.remoteUser?.id;
      const targetId = typeof rawTarget === 'object' && rawTarget !== null ? (rawTarget._id || rawTarget.id) : String(rawTarget || '').trim();
      await safeEmit('call_answer', {
        to: targetId,
        answer: answerPayload,
        callId: storeState.callId,
      });
      console.log('[WebRTC] Answer sent to:', targetId);

      // Connection timeout
      timeoutRef.current = setTimeout(() => {
        console.warn('[WebRTC] Connection timeout — ending call');
        if (remoteUserIdRef.current) emitRef.current('call_end', { to: remoteUserIdRef.current });
        useCallStore.getState().endCall('ended');
      }, CONNECTION_TIMEOUT_MS);
    } catch (err) {
      console.error('[WebRTC] Receiver init error:', err);
      const stateNow = useCallStore.getState().callState;
      const alreadyEnded = stateNow === 'ended' || stateNow === 'idle';
      // A duplicate/stale receiver instance failed while the real one already connected the call:
      // never tear down or alert on a live call.
      if (stateNow === 'active') {
        console.warn('[WebRTC] Stale receiver init failed but call is already active — ignoring');
        return;
      }
      if (err.message && (err.message.includes('closed') || err.message.includes('wrong state'))) {
        console.warn('[WebRTC] Receiver init aborted due to closed connection');
      } else if (alreadyEnded) {
        // The caller already hung up (call_ended arrived first): nothing to tell the user.
        console.log('[WebRTC] Receiver init failed but call already ended — no alert');
      } else {
        const friendly = friendlyCallError(err, 'receiver');
        if (friendly) Alert.alert(friendly.title, friendly.message);
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
      } catch (e) {
        console.warn('[WebRTC] localStream cleanup error:', e);
      }
    }

    if (remoteMediaStreamRef.current) {
      const rStream = remoteMediaStreamRef.current;
      remoteMediaStreamRef.current = null;
      try {
        rStream.getTracks().forEach((track) => {
          try { track.enabled = false; } catch (e) {}
          try { track.stop(); } catch (e) {}
        });
      } catch (e) {
        console.warn('[WebRTC] remoteMediaStream cleanup error:', e);
      }
    }

    if (pcRef.current) {
      const pc = pcRef.current;
      pcRef.current = null;
      try {
        pc.getSenders?.().forEach((sender) => {
          try { sender.track?.stop(); } catch (e) {}
          try { pc.removeTrack?.(sender); } catch (e) {}
        });
        pc.getReceivers?.().forEach((receiver) => {
          try { receiver.track?.stop(); } catch (e) {}
        });
        pc.getTransceivers?.().forEach((transceiver) => {
          try { transceiver.stop?.(); } catch (e) {}
        });
      } catch (e) {}
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

    remoteMediaStreamRef.current = null;
    initialized.current = false;
    remoteDescReady.current = false;
    answerAppliedRef.current = false;
    iceCandidatesProcessed.current = 0;
    pendingCandidates.current = [];
    addedCandidates.current.clear();
    if (iceRestartTimerRef.current) { clearTimeout(iceRestartTimerRef.current); iceRestartTimerRef.current = null; }
    if (lateAnswerCheckTimerRef.current) { clearTimeout(lateAnswerCheckTimerRef.current); lateAnswerCheckTimerRef.current = null; }
    iceRestartPendingRef.current = false;
    iceRestartAttemptsRef.current = 0;
    offerSentAtRef.current = 0;
    activeCallSession = null;

    if (InCallManager) {
      try {
        // Explicitly clear speaker state so the next call never inherits a lingering speaker state
        InCallManager.setSpeakerphoneOn(false);
        InCallManager.setForceSpeakerphoneOn(false);
        if (typeof InCallManager.chooseAudioRoute === 'function') {
          InCallManager.chooseAudioRoute('EARPIECE').catch(() => {});
        }
        InCallManager.stop();
        console.log('[InCallManager] Stopped and audio route reset to earpiece');
      } catch (e) {
        console.warn('[InCallManager] stop error:', e);
      }
    }
  }, []);

  // ─── Initialize (once per mount) ──────────────────────────────────
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

    const cState = useCallStore.getState().callState;
    const isOngoing = (cState === 'active' || cState === 'connecting' || cState === 'ringing') && activeCallSession && activeCallSession.pc;
    if (isOngoing) {
      console.log('[WebRTC] Active call session detected on remount — reusing existing peer connection!');
      pcRef.current = activeCallSession.pc;
      localStreamRef.current = activeCallSession.localStream;
      remoteMediaStreamRef.current = activeCallSession.remoteStream;
      // Defer state updates to avoid "setState during render" React error
      setTimeout(() => {
        setConnectionState(activeCallSession?.pc?.connectionState || 'connected');
        setIceConnectionState(activeCallSession?.pc?.iceConnectionState || 'connected');
        if (activeCallSession?.localStream) onLocalStreamRef.current?.(activeCallSession.localStream);
        if (activeCallSession?.remoteStream) onRemoteStreamRef.current?.(activeCallSession.remoteStream, Date.now(), activeCallSession.hasVideo);
      }, 0);
    } else {
      if (isReceiverRef.current) {
        startAsReceiverAsync();
      } else {
        startAsCallerAsync();
      }
    }

    return () => {
      const minimized = useCallStore.getState().isMinimized;
      const cState = useCallStore.getState().callState;
      const isStillInCall = cState === 'active' || cState === 'calling' || cState === 'connecting' || cState === 'ringing';
      if (minimized && isStillInCall) {
        console.log('[WebRTC] Component unmounting due to minimization — KEEPING WebRTC peer connection & media streams alive!');
        return;
      }
      cleanup();
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
        const desc = (RTCSessionDescription && typeof RTCSessionDescription === 'function')
          ? new RTCSessionDescription({ type: answerType, sdp: answerSdp })
          : { type: answerType, sdp: answerSdp };
        await pc.setRemoteDescription(desc);
        console.log('[WebRTC] Remote answer applied successfully');
        remoteDescReady.current = true;
        flushCandidates(pc);

        // The ring timeout started when we dialled. Now that the other side has answered, give
        // the connection its own full window instead of whatever was left of the ring time
        // (a late answer used to leave only a few seconds to connect).
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            console.warn('[WebRTC] Connection timeout after answer — ending call');
            if (remoteUserIdRef.current) emitRef.current('call_end', { to: remoteUserIdRef.current });
            useCallStore.getState().endCall('ended');
          }, CONNECTION_TIMEOUT_MS);
        }

        // Answered late: our network paths (gathered when we dialled) may have gone stale while
        // ringing. If we are not connected shortly, restart ICE with fresh paths.
        const ringMs = offerSentAtRef.current ? Date.now() - offerSentAtRef.current : 0;
        if (ringMs > LATE_ANSWER_MS) {
          console.log('[WebRTC] Late answer after', Math.round(ringMs / 1000), 's — will restart ICE if not connected soon');
          if (lateAnswerCheckTimerRef.current) clearTimeout(lateAnswerCheckTimerRef.current);
          lateAnswerCheckTimerRef.current = setTimeout(() => {
            lateAnswerCheckTimerRef.current = null;
            try { performIceRestartRef.current?.('late_answer'); } catch (err) {}
          }, LATE_ANSWER_CHECK_DELAY_MS);
        }
      } catch (e) {
        answerAppliedRef.current = false;
        console.warn('[WebRTC] setRemoteDescription answer error:', e.message);
      }
    })();
  }, [answer, isReceiver, flushCandidates]);

  // ─── Caller: ICE restart (fresh network paths) ──────────────────────
  // Only ever runs when the connection is NOT up (late answer / ICE failed). Max 2 attempts.
  // If the other side never answers the restart, it rolls back after 10s → same as before.
  const performIceRestart = useCallback(async (reason) => {
    const pc = pcRef.current;
    if (!pc || isReceiverRef.current) return;
    if (pc.signalingState !== 'stable') return;
    const st = pc.iceConnectionState;
    if (st === 'connected' || st === 'completed') return;
    if (iceRestartPendingRef.current || iceRestartAttemptsRef.current >= 2) return;

    iceRestartAttemptsRef.current += 1;
    iceRestartPendingRef.current = true;
    console.log('[WebRTC] ICE restart #' + iceRestartAttemptsRef.current, 'reason:', reason);
    try {
      let restartOffer = await pc.createOffer({ iceRestart: true });
      if (restartOffer?.sdp) {
        restartOffer = { type: restartOffer.type, sdp: preferCodec(restartOffer.sdp, 'VP8') };
      }
      if (pcRef.current !== pc || pc.signalingState !== 'stable') {
        iceRestartPendingRef.current = false;
        return;
      }
      // Candidates of the new ICE generation must wait until the restart answer is applied
      remoteDescReady.current = false;
      await pc.setLocalDescription(restartOffer);
      const ld = pc.localDescription || restartOffer;
      const storeState = useCallStore.getState();
      const rawTarget = remoteUserIdRef.current || storeState.remoteUserId || storeState.remoteUser?._id || storeState.remoteUser?.id;
      const targetId = typeof rawTarget === 'object' && rawTarget !== null ? (rawTarget._id || rawTarget.id) : String(rawTarget || '').trim();
      await safeEmit('call_renegotiate', {
        to: targetId,
        offer: { type: ld?.type || ld?._type || 'offer', sdp: ld?.sdp || ld?._sdp || restartOffer.sdp },
        callId: storeState.callId,
      });

      // Safety net: other side did not answer the restart → roll back to the previous state
      if (iceRestartTimerRef.current) clearTimeout(iceRestartTimerRef.current);
      iceRestartTimerRef.current = setTimeout(async () => {
        iceRestartTimerRef.current = null;
        if (pcRef.current === pc && iceRestartPendingRef.current && pc.signalingState === 'have-local-offer') {
          console.warn('[WebRTC] ICE restart not answered — rolling back');
          try { await pc.setLocalDescription({ type: 'rollback' }); } catch (e) {}
          iceRestartPendingRef.current = false;
          remoteDescReady.current = true;
          flushCandidates(pc);
        }
      }, 10000);
    } catch (e) {
      console.warn('[WebRTC] ICE restart error:', e?.message);
      iceRestartPendingRef.current = false;
      if (pcRef.current === pc && pc.signalingState === 'stable') {
        remoteDescReady.current = true;
        flushCandidates(pc);
      }
    }
  }, [safeEmit, flushCandidates]);

  useEffect(() => { performIceRestartRef.current = performIceRestart; }, [performIceRestart]);

  // ─── Caller: apply the ICE-restart answer ────────────────────────────
  useEffect(() => {
    if (!renegotiateAnswer || isReceiver) return;
    if (handledRenegotiateAnswerRef.current === renegotiateAnswer.at) return;
    handledRenegotiateAnswerRef.current = renegotiateAnswer.at;
    const pc = pcRef.current;
    if (!pc || pc.signalingState !== 'have-local-offer' || !iceRestartPendingRef.current) return;

    (async () => {
      try {
        const { type, sdp } = extractSdpAndType(renegotiateAnswer.sdp, 'answer');
        if (!sdp) return;
        const desc = (RTCSessionDescription && typeof RTCSessionDescription === 'function')
          ? new RTCSessionDescription({ type, sdp })
          : { type, sdp };
        await pc.setRemoteDescription(desc);
        console.log('[WebRTC] ICE restart answer applied');
        if (iceRestartTimerRef.current) { clearTimeout(iceRestartTimerRef.current); iceRestartTimerRef.current = null; }
        iceRestartPendingRef.current = false;
        remoteDescReady.current = true;
        flushCandidates(pc);
      } catch (e) {
        console.warn('[WebRTC] ICE restart answer error:', e?.message);
      }
    })();
  }, [renegotiateAnswer, isReceiver, flushCandidates]);

  // ─── Receiver: answer an ICE-restart offer from the caller ───────────
  // (declared BEFORE the ICE-candidate effect so new-generation candidates get buffered first)
  useEffect(() => {
    if (!renegotiateOffer || !isReceiver) return;
    if (handledRenegotiateOfferRef.current === renegotiateOffer.at) return;
    handledRenegotiateOfferRef.current = renegotiateOffer.at;
    const pc = pcRef.current;
    if (!pc || pc.signalingState !== 'stable' || !answerAppliedRef.current) return;

    remoteDescReady.current = false; // buffer candidates until the new offer is applied
    (async () => {
      try {
        const { type, sdp } = extractSdpAndType(renegotiateOffer.sdp, 'offer');
        if (!sdp) { remoteDescReady.current = true; return; }
        const desc = (RTCSessionDescription && typeof RTCSessionDescription === 'function')
          ? new RTCSessionDescription({ type, sdp })
          : { type, sdp };
        await pc.setRemoteDescription(desc);
        remoteDescReady.current = true;
        let restartAnswer = await pc.createAnswer();
        if (restartAnswer?.sdp) {
          restartAnswer = { type: restartAnswer.type, sdp: preferCodec(restartAnswer.sdp, 'VP8') };
        }
        await pc.setLocalDescription(restartAnswer);
        flushCandidates(pc);
        const la = pc.localDescription || restartAnswer;
        const storeState = useCallStore.getState();
        const rawTarget = remoteUserIdRef.current || storeState.remoteUserId || storeState.remoteUser?._id || storeState.remoteUser?.id;
        const targetId = typeof rawTarget === 'object' && rawTarget !== null ? (rawTarget._id || rawTarget.id) : String(rawTarget || '').trim();
        await safeEmit('call_renegotiate_answer', {
          to: targetId,
          answer: { type: la?.type || la?._type || 'answer', sdp: la?.sdp || la?._sdp || restartAnswer.sdp },
          callId: storeState.callId,
        });
        console.log('[WebRTC] ICE restart answer sent');
      } catch (e) {
        console.warn('[WebRTC] ICE restart (receiver) error:', e?.message);
        remoteDescReady.current = true;
        try { flushCandidates(pc); } catch (err) {}
      }
    })();
  }, [renegotiateOffer, isReceiver, flushCandidates, safeEmit]);

  // ─── Both sides: add incoming ICE candidates ─────────────────────
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || pc.signalingState === 'closed') return;

    const newCandidates = iceCandidates.slice(iceCandidatesProcessed.current);
    if (newCandidates.length === 0) return;

    // Must have remote description AND if receiver, must have local description (answer) set!
    if (!remoteDescReady.current || (isReceiver && !answerAppliedRef.current)) {
      console.log('[WebRTC] Buffering', newCandidates.length, 'ICE candidates (descriptions not ready)');
      pendingCandidates.current = [...pendingCandidates.current, ...newCandidates];
      iceCandidatesProcessed.current = iceCandidates.length;
      return;
    }

    // Both descriptions ready — add directly
    console.log('[WebRTC] Adding', newCandidates.length, 'ICE candidates directly');
    newCandidates.forEach((candidate) => {
      const validCandidate = extractIceCandidate(candidate);
      if (validCandidate && pc.signalingState !== 'closed') {
        const key = `${validCandidate.sdpMid ?? ''}_${validCandidate.sdpMLineIndex ?? ''}_${validCandidate.candidate}`;
        if (key && addedCandidates.current.has(key)) return;
        if (key) addedCandidates.current.add(key);

        console.log('[WebRTC] Adding candidate directly:', validCandidate.candidate.substring(0, 45));
        try {
          const iceObj = (RTCIceCandidate && typeof RTCIceCandidate === 'function')
            ? new RTCIceCandidate(validCandidate)
            : validCandidate;
          pc.addIceCandidate(iceObj).catch((e) => {
            console.warn('[WebRTC] addIceCandidate error (direct):', e.message);
          });
        } catch (e) {
          try { pc.addIceCandidate(validCandidate).catch(() => {}); } catch(err) {}
        }
      }
    });
    iceCandidatesProcessed.current = iceCandidates.length;
  }, [iceCandidates, isReceiver]);

  const setSpeaker = useCallback((on) => {
    if (InCallManager) {
      try {
        const isSpeaker = Boolean(on);
        InCallManager.setSpeakerphoneOn(isSpeaker);
        InCallManager.setForceSpeakerphoneOn(isSpeaker);
        if (typeof InCallManager.chooseAudioRoute === 'function') {
          InCallManager.chooseAudioRoute(isSpeaker ? 'SPEAKER_PHONE' : 'EARPIECE').catch(() => {});
        }
        console.log('[InCallManager] Speaker changed to:', isSpeaker);
      } catch (e) {
        console.warn('[InCallManager] setSpeaker error:', e);
      }
    }
  }, []);

  return { cleanup, setSpeaker, connectionState, iceConnectionState, errorMessage };
}
