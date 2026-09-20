import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, Vibration, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Animated as RNAnimated } from 'react-native';
import { Audio } from 'expo-av';
import useCallStore from '../../store/useCallStore';
import useSocketStore from '../../store/useSocketStore';
import useWebRTCCall from '../../hooks/useWebRTCCall';
import { getInitials } from '../../utils/helpers';

// RTCView: use native component if available, fall back to View (Expo Go / web)
let RTCView = View;
if (Platform.OS !== 'web') {
  try {
    const webrtc = require('react-native-webrtc');
    if (webrtc && webrtc.RTCView) {
      RTCView = webrtc.RTCView;
    }
  } catch (e) {
    console.warn('[CallScreen] react-native-webrtc not available, video will not render');
  }
}

function formatDuration(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function CallScreen({ route, navigation }) {
  const { otherUser, callType } = route.params;
  const { callState, isReceiver, offer, resetCall } = useCallStore();
  console.log('[CallScreen] otherUser:', otherUser?._id, otherUser?.name, 'isReceiver:', isReceiver);
  const { emit } = useSocketStore();

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(callType === 'video');
  const [cameraFront, setCameraFront] = useState(true);

  const ringAnim = useRef(new RNAnimated.Value(0)).current;
  const loopRef = useRef(null);
  const timerRef = useRef(null);
  const hasNavigatedBack = useRef(false);

  // ── WebRTC ────────────────────────────────────────────────────────
  const { cleanup: cleanupWebRTC, setSpeaker } = useWebRTCCall({
    remoteUserId: otherUser._id,
    callType,
    isReceiver,
    offer,
    onLocalStream: useCallback((s) => {
      console.log('[CallScreen] Local stream received');
      setLocalStream(s);
    }, []),
    onRemoteStream: useCallback((s) => {
      console.log('[CallScreen] Remote stream received');
      setRemoteStream(s);
    }, []),
  });

  // ── Pulsing ring (while ringing/connecting) ───────────────────────
  useEffect(() => {
    loopRef.current = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(ringAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        RNAnimated.timing(ringAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loopRef.current.start();

    if (!isReceiver) {
      Vibration.vibrate([0, 400, 200, 400]);
    }

    return () => {
      loopRef.current?.stop();
      Vibration.cancel();
    };
  }, []);

  // ── Timer when active ─────────────────────────────────────────────
  useEffect(() => {
    if (callState === 'active') {
      loopRef.current?.stop();
      setCallDuration(0);
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  // ── Ringback tone (Outgoing call while waiting) ────────────────────
  useEffect(() => {
    if (isReceiver) return;
    const isDialing = callState === 'calling' || callState === 'ringing';
    if (!isDialing) return;
    let sound = null;
    const play = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: !speakerOn,
        });
        const { sound: s } = await Audio.Sound.createAsync(
          require('../../../assets/ringback.wav'),
          { shouldPlay: true, isLooping: true, volume: 1.0 }
        );
        sound = s;
      } catch (e) {
        console.warn('[CallScreen] ringback error:', e);
      }
    };
    play();
    return () => {
      if (sound) {
        sound.stopAsync().catch(() => {});
        sound.unloadAsync().catch(() => {});
      }
    };
  }, [callState, isReceiver, speakerOn]);

  // ── Remote party ended/rejected ──────────────────────────────────
  useEffect(() => {
    if ((callState === 'ended' || callState === 'idle') && !hasNavigatedBack.current) {
      hasNavigatedBack.current = true;
      Vibration.cancel();
      cleanupWebRTC();
      navigation.goBack();
    }
  }, [callState]);

  const handleEndCall = () => {
    if (hasNavigatedBack.current) return;
    hasNavigatedBack.current = true;
    emit('call_end', { to: otherUser._id, callType, duration: callDuration });
    cleanupWebRTC();
    resetCall();
    navigation.goBack();
  };

  const toggleMute = () => {
    localStream?.getAudioTracks().forEach((t) => { t.enabled = muted; });
    setMuted((m) => !m);
  };

  const toggleCamera = () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()?.[0];
    if (videoTrack && typeof videoTrack._switchCamera === 'function') {
      videoTrack._switchCamera();
      setCameraFront((f) => !f);
    }
  };

  const scale = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });
  const opacity = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  const getStatusLabel = () => {
    if (callState === 'active') return `🔴  ${formatDuration(callDuration)}`;
    if (callState === 'connecting') return `${callType === 'video' ? '📹' : '📞'} Connecting...`;
    if (callState === 'ringing') return `${callType === 'video' ? '📹' : '📞'} Ringing...`;
    if (isReceiver) return `${callType === 'video' ? '📹' : '📞'} Connecting...`;
    return `${callType === 'video' ? '📹' : '📞'} Calling...`;
  };
  const statusLabel = getStatusLabel();

  // ── VIDEO CALL layout ─────────────────────────────────────────────
  // Check if RTCView is the real native component (not the View fallback)
  const hasNativeRTCView = RTCView !== View;

  if (callType === 'video') {
    return (
      <View style={styles.videoContainer}>
        {/* Remote video (full screen) */}
        {remoteStream && hasNativeRTCView ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={styles.remoteVideo}
            objectFit="cover"
            mirror={false}
            zOrder={0}
          />
        ) : (
          <LinearGradient colors={['#0D1117', '#1A2332']} style={StyleSheet.absoluteFill}>
            <View style={styles.waitingOverlay}>
              {otherUser?.avatar ? (
                <Image source={{ uri: otherUser.avatar }} style={styles.waitingAvatar} />
              ) : (
                <LinearGradient colors={['#0084FF', '#0060CC']} style={styles.waitingAvatarFallback}>
                  <Text style={styles.waitingInitials}>{getInitials(otherUser.name)}</Text>
                </LinearGradient>
              )}
              <Text style={styles.waitingName}>{otherUser.name}</Text>
              <Text style={styles.waitingText}>{statusLabel}</Text>
            </View>
          </LinearGradient>
        )}

        {/* Local video (picture-in-picture) */}
        {localStream && hasNativeRTCView && (
          <View style={styles.localVideoWrapper}>
            <RTCView
              streamURL={localStream.toURL()}
              style={styles.localVideo}
              objectFit="cover"
              mirror={cameraFront}
              zOrder={1}
            />
          </View>
        )}

        {/* Top bar */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.3)', 'transparent']}
          style={styles.videoTopBar}
        >
          <Text style={styles.videoName}>{otherUser.name}</Text>
          <Text style={styles.videoStatus}>{statusLabel}</Text>
        </LinearGradient>

        {/* Bottom controls */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.7)']}
          style={styles.videoControlsBg}
        >
          <View style={styles.videoControls}>
            <TouchableOpacity style={[styles.ctrlBtn, muted && styles.ctrlBtnActive]} onPress={toggleMute}>
              <Text style={styles.ctrlEmoji}>{muted ? '🔇' : '🎙️'}</Text>
              <Text style={styles.ctrlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.endBtnVideo} onPress={handleEndCall}>
              <Text style={{ fontSize: 28 }}>📵</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ctrlBtn} onPress={toggleCamera}>
              <Text style={styles.ctrlEmoji}>🔄</Text>
              <Text style={styles.ctrlLabel}>Flip</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    );
  }

  // ── AUDIO CALL layout ─────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      {/* Full blurred background — avatar fills everything */}
      <LinearGradient
        colors={['#0B0F1E', '#121A36', '#0B0F1E']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Soft glow blobs */}
      <View style={styles.blob1} />
      <View style={styles.blob2} />

      {/* ── TOP SECTION: avatar + name + status ── */}
      <View style={styles.topSection}>
        {/* Avatar glow ring */}
        <RNAnimated.View style={[styles.glowRing, { transform: [{ scale }], opacity }]} />

        <View style={styles.avatarContainer}>
          {otherUser.avatar ? (
            <Image source={{ uri: otherUser.avatar }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={['#1D6FEB', '#00C6FF']} style={styles.avatarFallback}>
              <Text style={styles.initials}>{getInitials(otherUser.name)}</Text>
            </LinearGradient>
          )}
        </View>

        <Text style={styles.name}>{otherUser.name}</Text>

        <View style={styles.statusRow}>
          {callState === 'active' && <View style={styles.activeDot} />}
          <Text style={styles.callStatus}>{statusLabel}</Text>
        </View>
      </View>

      {/* ── BOTTOM SECTION: controls ── */}
      <View style={styles.bottomSection}>
        {/* Row 1: secondary controls */}
        <View style={styles.secondaryRow}>
          <View style={styles.ctrlItem}>
            <TouchableOpacity
              style={[styles.ctrlCircle, muted && styles.ctrlCircleOn]}
              onPress={toggleMute}
            >
              <Ionicons name={muted ? 'mic-off' : 'mic-outline'} size={26} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.ctrlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </View>

          <View style={styles.ctrlItem}>
            <TouchableOpacity
              style={[styles.ctrlCircle, speakerOn && styles.ctrlCircleOn]}
              onPress={() => { setSpeakerOn((s) => { const next = !s; setSpeaker?.(next); return next; }); }}
            >
              <Ionicons name={speakerOn ? 'volume-high' : 'volume-medium-outline'} size={26} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.ctrlLabel}>Speaker</Text>
          </View>
        </View>

        {/* Row 2: end call */}
        <View style={styles.endRow}>
          <TouchableOpacity onPress={handleEndCall} activeOpacity={0.85}>
            <LinearGradient
              colors={['#FF3B30', '#C0392B']}
              style={styles.endBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <Ionicons name="call" size={34} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Audio Call ──────────────────────────────────────────────────────
  blob1: {
    position: 'absolute', top: -80, right: -80,
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(29, 111, 235, 0.18)',
  },
  blob2: {
    position: 'absolute', bottom: -60, left: -80,
    width: 320, height: 320, borderRadius: 160,
    backgroundColor: 'rgba(0, 198, 255, 0.12)',
  },
  topSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  glowRing: {
    position: 'absolute',
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(29, 111, 235, 0.25)',
  },
  avatarContainer: {
    width: 130, height: 130,
    borderRadius: 65,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: 28,
    shadowColor: '#1D6FEB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  avatar: { width: '100%', height: '100%' },
  avatarFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  initials: { fontSize: 44, color: '#FFF', fontWeight: '800' },
  name: {
    fontSize: 28, fontWeight: '700', color: '#FFF',
    marginBottom: 10, letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  activeDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#34C759',
    shadowColor: '#34C759', shadowRadius: 4, shadowOpacity: 0.8,
  },
  callStatus: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 15, letterSpacing: 0.5, fontWeight: '400',
  },

  // ── Controls ─────────────────────────────────────────────────────────
  bottomSection: {
    paddingBottom: 60,
    alignItems: 'center',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 56,
    marginBottom: 40,
  },
  ctrlItem: { alignItems: 'center', gap: 8 },
  ctrlCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  ctrlCircleOn: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  ctrlLabel: {
    color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '500',
  },
  endRow: { alignItems: 'center' },
  endBtn: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 14,
  },

  // ── Video Call ───────────────────────────────────────────────────────
  videoContainer: { flex: 1, backgroundColor: '#000' },
  remoteVideo: { flex: 1, backgroundColor: '#000' },
  localVideoWrapper: {
    position: 'absolute', top: 60, right: 16,
    width: 110, height: 150, borderRadius: 14,
    overflow: 'hidden', borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 10, elevation: 10, backgroundColor: '#222',
  },
  localVideo: { flex: 1, backgroundColor: '#000' },
  waitingOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  waitingAvatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 16, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  waitingAvatarFallback: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  waitingInitials: { fontSize: 36, color: '#FFF', fontWeight: '700' },
  waitingName: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  waitingText: { color: 'rgba(255,255,255,0.7)', fontSize: 16 },
  videoTopBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 24, zIndex: 5 },
  videoName: { color: '#FFF', fontWeight: '700', fontSize: 22 },
  videoStatus: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 2 },
  videoControlsBg: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 24, paddingBottom: 48, zIndex: 5 },
  videoControls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 32 },
  ctrlBtn: { alignItems: 'center', padding: 12, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)' },
  ctrlBtnActive: { backgroundColor: 'rgba(255,255,255,0.35)' },
  ctrlEmoji: { fontSize: 26 },
  endBtnVideo: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', elevation: 8 },
});

