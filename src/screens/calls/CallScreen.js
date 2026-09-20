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

  // ── Dial tone (Outgoing Call) ─────────────────────────────────────
  useEffect(() => {
    let soundObject = null;
    
    const playDialTone = async () => {
      try {
        if (!isReceiver && callState === 'connecting') {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: true,
          });
          const { sound } = await Audio.Sound.createAsync(
            require('../../../assets/ringtone.wav'),
            { shouldPlay: true, isLooping: true }
          );
          soundObject = sound;
        }
      } catch (e) {
        console.warn('[CallScreen] Dial tone error:', e);
      }
    };

    if (!isReceiver && callState === 'connecting') {
      playDialTone();
    }

    return () => {
      if (soundObject) {
        soundObject.stopAsync().catch(() => {});
        soundObject.unloadAsync().catch(() => {});
      }
    };
  }, [callState, isReceiver]);

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
    emit('call_end', { to: otherUser._id });
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
    <View style={styles.container}>
      {/* ── Background & Orbs ── */}
      <LinearGradient
        colors={['#070B19', '#0D1A3A', '#060A17']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.orbTopRight} />
      <View style={styles.orbBottomLeft} />

      <View style={styles.content}>
        <View style={styles.pulseContainer}>
          <View style={[styles.pulseRing, styles.pulse3]} />
          <RNAnimated.View style={[styles.pulseRing, styles.pulse2, { transform: [{ scale }], opacity }]} />
          <View style={[styles.pulseRing, styles.pulse1]} />
          <View style={styles.avatarWrapper}>
            {otherUser.avatar ? (
              <Image source={{ uri: otherUser.avatar }} style={styles.avatar} />
            ) : (
              <LinearGradient colors={['#0084FF', '#00C6FF']} style={styles.avatarFallback}>
                <Text style={styles.initials}>{getInitials(otherUser.name)}</Text>
              </LinearGradient>
            )}
          </View>
        </View>
        <Text style={styles.name}>{otherUser.name}</Text>
        <Text style={styles.callStatus}>{statusLabel}</Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.muteBtn} onPress={toggleMute}>
          <View style={[styles.controlCircle, muted && styles.controlCircleActive]}>
            <Ionicons name={muted ? 'mic-off' : 'mic'} size={28} color="#FFF" />
          </View>
          <Text style={styles.controlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endBtn} onPress={handleEndCall}>
          <LinearGradient colors={['#FF453A', '#FF3B30']} style={styles.endCircle}>
            <Ionicons name="call" size={36} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={styles.speakerBtn} onPress={() => { setSpeakerOn((s) => { const next = !s; setSpeaker?.(next); return next; }); }}>
          <View style={[styles.controlCircle, speakerOn && styles.controlCircleActive]}>
            <Ionicons name={speakerOn ? 'volume-high' : 'volume-medium'} size={28} color="#FFF" />
          </View>
          <Text style={styles.controlLabel}>Speaker</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Audio ──
  container: { flex: 1, justifyContent: 'space-between', paddingTop: 140, paddingBottom: 80, backgroundColor: '#070B19' },
  orbTopRight: {
    position: 'absolute', top: -100, right: -100,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(0, 198, 255, 0.15)',
    transform: [{ scale: 1.5 }],
  },
  orbBottomLeft: {
    position: 'absolute', bottom: -100, left: -100,
    width: 350, height: 350, borderRadius: 175,
    backgroundColor: 'rgba(0, 132, 255, 0.15)',
    transform: [{ scale: 1.5 }],
  },
  content: { alignItems: 'center' },
  pulseContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 44, position: 'relative' },
  pulseRing: { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  pulse3: { width: 190, height: 190, borderColor: 'rgba(0, 198, 255, 0.15)', backgroundColor: 'rgba(0, 198, 255, 0.05)' },
  pulse2: { width: 160, height: 160, borderColor: 'rgba(0, 198, 255, 0.25)', backgroundColor: 'rgba(0, 198, 255, 0.1)' },
  pulse1: { width: 130, height: 130, borderColor: 'rgba(0, 198, 255, 0.4)' },
  avatarWrapper: { zIndex: 1 },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: '#00C6FF' },
  avatarFallback: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#00C6FF' },
  initials: { fontSize: 40, color: '#FFF', fontWeight: '800' },
  name: { fontSize: 32, fontWeight: '800', color: '#FFF', marginBottom: 8 },
  callStatus: { color: 'rgba(255,255,255,0.7)', fontSize: 16, letterSpacing: 1 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 40, marginBottom: 20 },
  muteBtn: { alignItems: 'center' },
  speakerBtn: { alignItems: 'center' },
  controlCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  controlCircleActive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  controlLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' },
  endBtn: { alignItems: 'center', justifyContent: 'center' },
  endCircle: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF3B30', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 12, elevation: 8,
  },
  // ── Video ──
  videoContainer: { flex: 1, backgroundColor: '#000' },
  remoteVideo: {
    flex: 1,
    backgroundColor: '#000',
  },
  localVideoWrapper: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 110,
    height: 150,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 10,
    elevation: 10,
    backgroundColor: '#222',
  },
  localVideo: {
    flex: 1,
    backgroundColor: '#000',
  },
  waitingOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  waitingAvatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 16, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  waitingAvatarFallback: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  waitingInitials: { fontSize: 36, color: '#FFF', fontWeight: '700' },
  waitingName: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  waitingText: { color: 'rgba(255,255,255,0.7)', fontSize: 16 },
  videoTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 24,
    zIndex: 5,
  },
  videoName: { color: '#FFF', fontWeight: '700', fontSize: 22 },
  videoStatus: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 2 },
  videoControlsBg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 24,
    paddingBottom: 48,
    zIndex: 5,
  },
  videoControls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 32 },
  ctrlBtn: { alignItems: 'center', padding: 12, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)' },
  ctrlBtnActive: { backgroundColor: 'rgba(255,255,255,0.35)' },
  ctrlEmoji: { fontSize: 26 },
  ctrlLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 4 },
  endBtnVideo: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', elevation: 8 },
});
