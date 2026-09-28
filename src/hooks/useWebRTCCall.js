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
    { urls: 'stun:stun.services.mozilla.com' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: '4b74ef2aa4a495db0843cb49',
      credential: '2AnGhj58qOqAlS1N'
    },
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: '4b74ef2aa4a495db0843cb49',
      credential: '2AnGhj58qOqAlS1N'
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: '4b74ef2aa4a495db0843cb49',
      credential: '2AnGhj58qOqAlS1N'
    },
    {
      urls: 'turns:global.relay.metered.ca:443?transport=tcp',
      username: '4b74ef2aa4a495db0843cb49',
      credential: '2AnGhj58qOqAlS1N'
    }
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

  // Unmask mDNS .local hostnames so Android libwebrtc can reach Web directly over LAN
  const lanHost = getLanHost();
  if (lanHost && candStr.includes('.local')) {
    candStr = candStr.replace(/[a-zA-Z0-9-]+\.local/g, lanHost);
  }

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
  const remoteMediaStreamRef = useRef(null);
  const iceCandidatesProcessed = useRef(0);
  const initialized = useRef(false);
  const remoteDescReady = useRef(false);
  const answerAppliedRef = useRef(false);
  const pendingCandidates = useRef([]);
  const addedCandidates = useRef(new Set());
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
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      sdpSemantics: 'unified-plan',
    });

    pc.onicecandidate = (event) => {
      const cand = event?.candidate;
      const targetId = remoteUserIdRef.current || remoteUserId || useCallStore.getState().remoteUserId || useCallStore.getState().remoteUser?._id;
      if (!cand || !targetId) return;
      const parsed = extractIceCandidate(cand);
      if (parsed && parsed.candidate) {
        console.log('[WebRTC] Sending clean ICE candidate to:', targetId, parsed.candidate.substring(0, 45));
        emitRef.current('call_ice', { to: targetId, candidate: parsed });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] ontrack event, track kind:', event.track?.kind, 'id:', event.track?.id, 'streams:', event.streams?.length);

      useCallStore.getState().setCallConnected();
      setErrorMessage('');

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
        onRemoteStreamRef.current?.(stream, Date.now(), hasVideo);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[WebRTC] connectionState:', state);
      setConnectionState(state);

      if (state === 'connected') {
        useCallStore.getState().setCallConnected();
        setErrorMessage('');
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

      const targetId = remoteUserIdRef.current || remoteUserId || useCallStore.getState().remoteUserId || useCallStore.getState().remoteUser?._id;
      emitRef.current('call_offer', {
        to: targetId,
        offer: offerPayload,
        callType: callTypeRef.current,
      });
      console.log('[WebRTC] Offer sent to:', targetId);

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
        Alert.alert('Call Error', err.message || 'Failed to start call');
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
          try {
            const socketStore = require('../store/useSocketStore').default;
            let socket = socketStore.getState().socket;
            if (!socket || !socket.connected) {
              socketStore.getState().connect().then((s) => {
                socket = s || socketStore.getState().socket;
                if (socket) {
                  socket.emit('get_call_offer', { callId }, (res) => resolve(res));
                } else {
                  resolve(null);
                }
              }).catch(() => resolve(null));
            } else {
              socket.emit('get_call_offer', { callId }, (res) => resolve(res));
            }
          } catch (e) {
            resolve(null);
          }
          setTimeout(() => resolve(null), 3500);
        });

        if (offerResponse?.offer) {
          console.log('[WebRTC] Obtained offer from socket server successfully!');
          currentOffer = offerResponse.offer;
          useCallStore.setState({ offer: currentOffer });
        }
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
      const sessionAnswer = await pc.createAnswer();
      if (!pcRef.current || pc.signalingState === 'closed') {
        console.warn('[WebRTC] PC closed before setting local answer');
        return;
      }

      await pc.setLocalDescription(sessionAnswer);
      console.log('[WebRTC] Answer created and set as local description');
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

      const targetId = remoteUserIdRef.current || useCallStore.getState().remoteUserId;
      emitRef.current('call_answer', {
        to: targetId,
        answer: answerPayload,
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

    if (InCallManager) {
      try {
        InCallManager.stop();
        console.log('[InCallManager] Stopped');
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

    if (isReceiverRef.current) {
      startAsReceiverAsync();
    } else {
      startAsCallerAsync();
    }

    return () => {
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
        InCallManager.setForceSpeakerphoneOn(on);
        console.log('[InCallManager] Speaker:', on);
      } catch (e) {
        console.warn('[InCallManager] setSpeaker error:', e);
      }
    }
  }, []);

  return { cleanup, setSpeaker, connectionState, iceConnectionState, errorMessage };
}
