import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated as RNAnimated } from 'react-native';
import useCallStore from '../../store/useCallStore';
import useSocketStore from '../../store/useSocketStore';
import { getInitials } from '../../utils/helpers';

function formatDuration(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function CallScreen({ route, navigation }) {
  const { otherUser, callType } = route.params;
  const { callState, isReceiver, resetCall } = useCallStore();
  const { emit } = useSocketStore();

  const ringAnim = useRef(new RNAnimated.Value(0)).current;
  const loopRef = useRef(null);
  const timerRef = useRef(null);
  const [callDuration, setCallDuration] = useState(0);
  const hasNavigatedBack = useRef(false);

  // ── Pulsing animation ─────────────────────────────────────────────
  useEffect(() => {
    loopRef.current = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(ringAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        RNAnimated.timing(ringAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loopRef.current.start();
    return () => loopRef.current?.stop();
  }, []);

  // ── Caller-only: emit offer ────────────────────────────────────────
  useEffect(() => {
    if (!isReceiver) {
      // Only the caller sends the offer and vibrates
      emit('call_offer', { to: otherUser._id, offer: { sdp: 'placeholder' }, callType });
      Vibration.vibrate([0, 400, 200, 400]);
    }
    return () => Vibration.cancel();
  }, []);

  // ── Start timer when call becomes active ──────────────────────────
  useEffect(() => {
    if (callState === 'active') {
      loopRef.current?.stop(); // stop pulsing when connected
      timerRef.current = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // ── React to remote ending/rejecting ─────────────────────────────
  useEffect(() => {
    if ((callState === 'ended' || callState === 'idle') && !hasNavigatedBack.current) {
      hasNavigatedBack.current = true;
      Vibration.cancel();
      navigation.goBack();
    }
  }, [callState]);

  const handleEndCall = () => {
    if (hasNavigatedBack.current) return;
    hasNavigatedBack.current = true;
    emit('call_end', { to: otherUser._id });
    resetCall();
    navigation.goBack();
  };

  const scale = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });
  const opacity = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  const statusLine = () => {
    if (callState === 'active') return `🔴  ${formatDuration(callDuration)}`;
    if (isReceiver) return callType === 'video' ? '📹 Video Call' : '📞 Audio Call';
    return (callType === 'video' ? '📹 Video Call' : '📞 Audio Call') + ' · Calling...';
  };

  return (
    <LinearGradient colors={['#0D1117', '#1A2332', '#0D1117']} style={styles.container}>
      <View style={styles.content}>
        {/* Pulse rings */}
        <View style={styles.pulseContainer}>
          <View style={[styles.pulseRing, styles.pulse3]} />
          <RNAnimated.View style={[styles.pulseRing, styles.pulse2, { transform: [{ scale }], opacity }]} />
          <View style={[styles.pulseRing, styles.pulse1]} />
          {/* Avatar */}
          <View style={styles.avatarWrapper}>
            {otherUser.avatar ? (
              <Image source={{ uri: otherUser.avatar }} style={styles.avatar} />
            ) : (
              <LinearGradient colors={['#0084FF', '#0060CC']} style={styles.avatarFallback}>
                <Text style={styles.initials}>{getInitials(otherUser.name)}</Text>
              </LinearGradient>
            )}
          </View>
        </View>

        <Text style={styles.name}>{otherUser.name}</Text>
        <Text style={styles.callStatus}>{statusLine()}</Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.muteBtn}>
          <Text style={styles.controlEmoji}>🔇</Text>
          <Text style={styles.controlLabel}>Mute</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.endBtn} onPress={handleEndCall}>
          <Text style={{ fontSize: 28 }}>📵</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.speakerBtn}>
          <Text style={styles.controlEmoji}>🔊</Text>
          <Text style={styles.controlLabel}>Speaker</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', paddingVertical: 80 },
  content: { alignItems: 'center' },
  pulseContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 32, position: 'relative' },
  pulseRing: {
    position: 'absolute', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(0,132,255,0.3)',
  },
  pulse3: { width: 200, height: 200, borderColor: 'rgba(0,132,255,0.1)' },
  pulse2: { width: 160, height: 160, borderColor: 'rgba(0,132,255,0.2)' },
  pulse1: { width: 130, height: 130, borderColor: 'rgba(0,132,255,0.3)' },
  avatarWrapper: { zIndex: 1 },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)' },
  avatarFallback: {
    width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)',
  },
  initials: { fontSize: 36, color: '#FFF', fontWeight: '700' },
  name: { fontSize: 28, fontWeight: '700', color: '#FFF', marginBottom: 8 },
  callStatus: { color: 'rgba(255,255,255,0.6)', fontSize: 16, letterSpacing: 0.5 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 40 },
  muteBtn: { alignItems: 'center' },
  speakerBtn: { alignItems: 'center' },
  controlEmoji: { fontSize: 28 },
  controlLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
  endBtn: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#FF3B30',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF3B30', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },
});
