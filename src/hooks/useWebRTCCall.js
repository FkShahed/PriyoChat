import { useEffect, useRef, useCallback } from 'react';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import useCallStore from '../store/useCallStore';
import useSocketStore from '../store/useSocketStore';

// InCallManager — controls audio routing (earpiece vs speaker), proximity sensor
let InCallManager = null;
try {
  InCallManager = require('react-native-incall-manager').default;
} catch (e) {
  console.warn('[InCallManager] Not available:', e.message);
}

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
  } else {
    const webrtc = require('react-native-webrtc');
    RTCPeerConnection = webrtc.RTCPeerConnection;
    RTCIceCandidate = webrtc.RTCIceCandidate;
    RTCSessionDescription = webrtc.RTCSessionDescription;
    mediaDevices = webrtc.mediaDevices;
    webrtcAvailable = true;
    console.log('[WebRTC] Native module loaded successfully');
  }
} catch (err) {
  console.error('[WebRTC] Failed to load native module:', err.message);
  webrtcAvailable = false;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

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

const CONNECTION_TIMEOUT_MS = 30000; // 30s timeout for WebRTC to connect

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
      if (candidate) {
        console.log('[WebRTC] Sending ICE candidate');
        emit('call_ice', { to: remoteUserId, candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] ontrack event, streams:', event.streams?.length);
      if (event.streams?.[0]) {
        onRemoteStream?.(event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[WebRTC] connectionState:', state);

      if (state === 'connected') {
        useCallStore.getState().setCallConnected();
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else if (state === 'failed') {
        console.warn('[WebRTC] Connection failed');
        emit('call_end', { to: remoteUserId });
        useCallStore.getState().endCall('ended');
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      console.log('[WebRTC] iceConnectionState:', iceState);

      if (iceState === 'connected' || iceState === 'completed') {
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
    if (!pc || !remoteDescReady.current) return;

    const buffered = pendingCandidates.current;
    pendingCandidates.current = [];
    console.log('[WebRTC] Flushing', buffered.length, 'buffered ICE candidates');
    buffered.forEach((candidate) => {
      pc.addIceCandidate(new RTCIceCandidate(candidate))
        .catch((e) => console.warn('[WebRTC] addIceCandidate error (buffered):', e));
    });

    const storeCandidates = useCallStore.getState().iceCandidates;
    const newCandidates = storeCandidates.slice(iceCandidatesProcessed.current);
    if (newCandidates.length > 0) {
      console.log('[WebRTC] Flushing', newCandidates.length, 'store ICE candidates');
    }
    newCandidates.forEach((candidate) => {
      pc.addIceCandidate(new RTCIceCandidate(candidate))
        .catch((e) => console.warn('[WebRTC] addIceCandidate error (store):', e));
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

    // Start InCallManager — routes audio to earpiece by default
    if (InCallManager) {
      InCallManager.start({ media: callType === 'video' ? 'video' : 'audio', auto: true, ringback: '' });
      InCallManager.setSpeakerphoneOn(false);
      console.log('[InCallManager] Started, earpiece mode');
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
      stream.getTracks().forEach((track) => {
        console.log('[WebRTC] Adding track to PC:', track.kind);
        pc.addTrack(track, stream);
      });

      const sessionOffer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video',
      });
      await pc.setLocalDescription(sessionOffer);
      console.log('[WebRTC] Offer created and set as local description');

      emit('call_offer', {
        to: remoteUserId,
        offer: pc.localDescription,
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
      Alert.alert('Call Error', err.message || 'Failed to start call');
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
      stream.getTracks().forEach((track) => {
        console.log('[WebRTC] Adding track to PC:', track.kind);
        pc.addTrack(track, stream);
      });

      console.log('[WebRTC] Setting remote description (offer)...');
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      remoteDescReady.current = true;
      console.log('[WebRTC] Remote description set successfully');

      // Flush any ICE candidates that arrived before remote desc was set
      flushCandidates(pc);

      const sessionAnswer = await pc.createAnswer();
      await pc.setLocalDescription(sessionAnswer);
      console.log('[WebRTC] Answer created and set as local description');

      emit('call_answer', {
        to: remoteUserId,
        answer: pc.localDescription,
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
      Alert.alert('Call Error', err.message || 'Failed to answer call');
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
      pcRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Caller: apply answer when received ──────────────────────────
  useEffect(() => {
    if (!answer || isReceiver || !pcRef.current) return;
    const pc = pcRef.current;
    if (pc.remoteDescription) return; // already set

    (async () => {
      try {
        console.log('[WebRTC] Applying remote answer...');
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('[WebRTC] Remote answer applied successfully');
        remoteDescReady.current = true;
        flushCandidates(pc);
      } catch (e) {
        console.error('[WebRTC] setRemoteDescription error:', e);
      }
    })();
  }, [answer, isReceiver, flushCandidates]);

  // ─── Both sides: add incoming ICE candidates ─────────────────────
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc) return;

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
      pc.addIceCandidate(new RTCIceCandidate(candidate))
        .catch((e) => console.warn('[WebRTC] addIceCandidate error:', e));
    });
    iceCandidatesProcessed.current = iceCandidates.length;
  }, [iceCandidates]);

  // ─── Expose cleanup ──────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    remoteDescReady.current = false;
    pendingCandidates.current = [];
    if (InCallManager) {
      InCallManager.stop();
      console.log('[InCallManager] Stopped');
    }
  }, []);

  const setSpeaker = useCallback((on) => {
    if (InCallManager) {
      InCallManager.setSpeakerphoneOn(on);
      console.log('[InCallManager] Speaker:', on);
    }
  }, []);

  return { cleanup, setSpeaker };
}
