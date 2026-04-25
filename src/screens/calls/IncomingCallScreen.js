import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, Easing,
} from 'react-native';
import { Animated as RNAnimated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useCallStore from '../../store/useCallStore';
import useSocketStore from '../../store/useSocketStore';
import { getInitials } from '../../utils/helpers';

export default function IncomingCallScreen({ navigation }) {
  const { remoteUser, callType, callState, setCallAccepted, resetCall } = useCallStore();
  console.log('[IncomingCallScreen] remoteUser:', remoteUser?._id, remoteUser?.name);
  const { emit } = useSocketStore();
  const slideAnim = useRef(new RNAnimated.Value(60)).current;
  const opacityAnim = useRef(new RNAnimated.Value(0)).current;
  const hasActed = useRef(false); // prevent double-navigation

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(slideAnim, { toValue: 0, duration: 450, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      RNAnimated.timing(opacityAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []);

  // If caller hung up or call expired before we answered → auto dismiss
  useEffect(() => {
    if ((callState === 'ended') && !hasActed.current) {
      hasActed.current = true;
      navigation.goBack();
    }
  }, [callState]);

  const handleAccept = () => {
    if (hasActed.current) return;
    hasActed.current = true;
    // Don't emit call_answer here — useWebRTCCall hook in CallScreen
    // will create the real SDP answer and emit it after setting up media.
    // Mark as 'connecting' — the hook will set 'active' when WebRTC connects.
    setCallAccepted();
    navigation.replace('Call', { otherUser: remoteUser, callType });
  };

  const handleReject = () => {
    if (hasActed.current) return;
    hasActed.current = true;
    emit('call_reject', { to: remoteUser._id });
    resetCall(); // instant reset to idle
    navigation.goBack();
  };

  return (
    <LinearGradient colors={['#0A1628', '#1A2332']} style={styles.container}>
      <RNAnimated.View style={[styles.content, { opacity: opacityAnim, transform: [{ translateY: slideAnim }] }]}>
        <Text style={styles.incomingLabel}>
          {callType === 'video' ? '📹 Incoming Video Call' : '📞 Incoming Audio Call'}
        </Text>

        {remoteUser?.avatar ? (
          <Image source={{ uri: remoteUser.avatar }} style={styles.avatar} />
        ) : (
          <LinearGradient colors={['#0084FF', '#0060CC']} style={[styles.avatar, { alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={styles.initials}>{getInitials(remoteUser?.name)}</Text>
          </LinearGradient>
        )}

        <Text style={styles.name}>{remoteUser?.name}</Text>
        <Text style={styles.subtitle}>is calling you...</Text>

        <View style={styles.buttons}>
          <TouchableOpacity style={styles.rejectBtn} onPress={handleReject}>
            <View style={styles.rejectCircle}>
              <Text style={styles.btnEmoji}>📵</Text>
            </View>
            <Text style={styles.btnLabel}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept}>
            <View style={styles.acceptCircle}>
              <Text style={styles.btnEmoji}>📞</Text>
            </View>
            <Text style={styles.btnLabel}>Accept</Text>
          </TouchableOpacity>
        </View>
      </RNAnimated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center', padding: 32 },
  incomingLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 15, marginBottom: 32 },
  avatar: { width: 120, height: 120, borderRadius: 60, marginBottom: 20, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  initials: { fontSize: 44, color: '#FFF', fontWeight: '700' },
  name: { fontSize: 30, fontWeight: '800', color: '#FFF', marginBottom: 8 },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginBottom: 56 },
  buttons: { flexDirection: 'row', gap: 60 },
  rejectBtn: { alignItems: 'center' },
  acceptBtn: { alignItems: 'center' },
  rejectCircle: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: '#FF3B30',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    shadowColor: '#FF3B30', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },
  acceptCircle: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: '#34C759',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    shadowColor: '#34C759', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },
  btnEmoji: { fontSize: 30 },
  btnLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
});
