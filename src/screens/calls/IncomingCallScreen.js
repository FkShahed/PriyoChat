import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, Easing,
} from 'react-native';
import { Animated as RNAnimated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useCallStore from '../../store/useCallStore';
import useSocketStore from '../../store/useSocketStore';
import { getInitials } from '../../utils/helpers';

export default function IncomingCallScreen({ navigation }) {
  const { remoteUser, callType, callState, setCallAccepted, resetCall } = useCallStore();
  console.log('[IncomingCallScreen] remoteUser:', remoteUser?._id, remoteUser?.name);
  const { emit } = useSocketStore();
  const slideAnim = useRef(new RNAnimated.Value(60)).current;
  const opacityAnim = useRef(new RNAnimated.Value(0)).current;
  const soundRef = useRef(null);
  const hasActed = useRef(false); // prevent double-navigation

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(slideAnim, { toValue: 0, duration: 450, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      RNAnimated.timing(opacityAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]).start();

    // Play ringtone using expo-av
    const playRingtone = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });

        const customUri = await AsyncStorage.getItem('custom_ringtone_uri');
        const globalUri = await AsyncStorage.getItem('global_ringtone_uri');
        
        let soundSource;
        if (customUri) {
          soundSource = { uri: customUri };
        } else if (globalUri) {
          soundSource = { uri: globalUri };
        } else {
          soundSource = require('../../../assets/ringtone.wav');
        }

        const { sound } = await Audio.Sound.createAsync(
          soundSource,
          { shouldPlay: true, isLooping: true }
        );
        soundRef.current = sound;
        console.log('[Ringtone] Started looping');
      } catch (e) {
        console.warn('[Ringtone] Play error:', e);
      }
    };
    
    playRingtone();

    return () => {
      // Stop ringing if screen is unmounted
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
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
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => {});
    }
    // Don't emit call_answer here — useWebRTCCall hook in CallScreen
    // will create the real SDP answer and emit it after setting up media.
    // Mark as 'connecting' — the hook will set 'active' when WebRTC connects.
    setCallAccepted();
    navigation.replace('Call', { otherUser: remoteUser, callType });
  };

  const handleReject = () => {
    if (hasActed.current) return;
    hasActed.current = true;
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => {});
    }
    emit('call_reject', { to: remoteUser._id });
    resetCall(); // instant reset to idle
    navigation.goBack();
  };

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

      <RNAnimated.View style={[styles.content, { opacity: opacityAnim, transform: [{ translateY: slideAnim }] }]}>
        <Text style={styles.incomingLabel}>
          {callType === 'video' ? 'INCOMING VIDEO CALL' : 'INCOMING AUDIO CALL'}
        </Text>

        <View style={styles.avatarWrapper}>
          <View style={styles.avatarRipple} />
          {remoteUser?.avatar ? (
            <Image source={{ uri: remoteUser.avatar }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={['#0084FF', '#00C6FF']} style={[styles.avatar, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={styles.initials}>{getInitials(remoteUser?.name)}</Text>
            </LinearGradient>
          )}
        </View>

        <Text style={styles.name}>{remoteUser?.name || 'Unknown'}</Text>
        <Text style={styles.subtitle}>is calling you...</Text>

        <View style={styles.buttons}>
          <TouchableOpacity style={styles.rejectBtn} onPress={handleReject} activeOpacity={0.8}>
            <LinearGradient colors={['#FF453A', '#FF3B30']} style={styles.rejectCircle}>
              <Ionicons name="call" size={32} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
            </LinearGradient>
            <Text style={styles.btnLabel}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept} activeOpacity={0.8}>
            <LinearGradient colors={['#34C759', '#30D158']} style={styles.acceptCircle}>
              <Ionicons name={callType === 'video' ? 'videocam' : 'call'} size={32} color="#FFF" />
            </LinearGradient>
            <Text style={styles.btnLabel}>Accept</Text>
          </TouchableOpacity>
        </View>
      </RNAnimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#070B19' },
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
  content: { alignItems: 'center', padding: 32, width: '100%' },
  incomingLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '700', letterSpacing: 2, marginBottom: 40 },
  avatarWrapper: {
    width: 130, height: 130,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  avatarRipple: {
    position: 'absolute',
    width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(0, 198, 255, 0.15)',
  },
  avatar: { 
    width: 120, height: 120, borderRadius: 60, 
    borderWidth: 3, borderColor: '#00C6FF', 
  },
  initials: { fontSize: 44, color: '#FFF', fontWeight: '800' },
  name: { fontSize: 32, fontWeight: '800', color: '#FFF', marginBottom: 8 },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginBottom: 60 },
  buttons: { flexDirection: 'row', gap: 70 },
  rejectBtn: { alignItems: 'center' },
  acceptBtn: { alignItems: 'center' },
  rejectCircle: {
    width: 72, height: 72, borderRadius: 36, 
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: '#FF3B30', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 12, elevation: 8,
  },
  acceptCircle: {
    width: 72, height: 72, borderRadius: 36, 
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: '#34C759', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 12, elevation: 8,
  },
  btnLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600' },
});
