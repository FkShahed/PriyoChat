import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, Easing, Platform,
} from 'react-native';
import { Animated as RNAnimated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InCallManager } from '../../utils/nativeModules';
import useCallStore from '../../store/useCallStore';
import useSocketStore from '../../store/useSocketStore';
import { getInitials } from '../../utils/helpers';
import { hasPendingAutoAccept, consumePendingAutoAccept } from '../../utils/callActionFlag';

export default function IncomingCallScreen({ navigation, route }) {
  // Set when the user pressed "Answer" on the native notification: accept straight away.
  const autoAccept = !!route?.params?.autoAccept || hasPendingAutoAccept();
  const { remoteUser, callType, callState, setCallAccepted, resetCall } = useCallStore();
  console.log('[IncomingCallScreen] remoteUser:', remoteUser?._id, remoteUser?.name);
  const { emit } = useSocketStore();
  const slideAnim = useRef(new RNAnimated.Value(60)).current;
  const opacityAnim = useRef(new RNAnimated.Value(0)).current;
  const soundRef = useRef(null);
  const hasActed = useRef(false); // prevent double-navigation
  const isAccepted = useRef(false);
  // If this screen is opened for a call that is ALREADY answered (connecting/active), it must not
  // ring or ask again: it just hands control back to the call screen.
  const alreadyAnsweredOnOpen = useRef(
    useCallStore.getState().callState === 'connecting' || useCallStore.getState().callState === 'active'
  );

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(slideAnim, { toValue: 0, duration: 450, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      RNAnimated.timing(opacityAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]).start();

    let isCancelled = false;

    // Play ringtone using native InCallManager (respects silent/vibrate mode on Android)
    const playRingtone = async () => {
      try {
        if (isCancelled) return;
        if (autoAccept) return; // already answered from the notification: no in-app ringtone
        if (alreadyAnsweredOnOpen.current) return; // call already answered: never ring again
        if (InCallManager) {
          InCallManager.startRingtone('_DEFAULT_', [500, 1000]);
          console.log('[Ringtone] InCallManager ringtone started (respects silent mode)');
          return;
        }

        // Web or fallback fallback:
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: false,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });
        if (isCancelled) return;

        const customUri = await AsyncStorage.getItem('custom_ringtone_uri');
        const globalUri = await AsyncStorage.getItem('global_ringtone_uri');
        if (isCancelled) return;
        
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
        if (isCancelled) {
          sound.stopAsync().catch(() => {});
          sound.unloadAsync().catch(() => {});
          return;
        }
        soundRef.current = sound;
        console.log('[Ringtone] Started looping fallback');
      } catch (e) {
        console.warn('[Ringtone] Play error:', e);
      }
    };
    
    playRingtone();

    return () => {
      isCancelled = true;
      // Only stop ringtone & reset audio if call was NOT accepted (e.g. dismissed/rejected)
      // When accepted, CallScreen takes over the audio session so we must NOT clobber it!
      if (!isAccepted.current && InCallManager) {
        try {
          InCallManager.stopRingtone();
        } catch (e) {}
      }
      if (soundRef.current) {
        const s = soundRef.current;
        soundRef.current = null;
        s.stopAsync().catch(() => {});
        s.unloadAsync().catch(() => {});
      }
      if (!isAccepted.current && Platform.OS !== 'web') {
        try {
          Audio.setAudioModeAsync({
            playsInSilentModeIOS: false,
            staysActiveInBackground: false,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false,
          }).catch(() => {});
        } catch (e) {}
      }
    };
  }, []);

  const dismissScreen = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    }
  };

  // The call got answered (e.g. from the notification) while/before this screen showed up:
  // do not ring or ask again, return to the existing call screen (or open it if missing).
  useEffect(() => {
    if (hasActed.current) return;
    if (callState !== 'connecting' && callState !== 'active') return;
    hasActed.current = true;
    isAccepted.current = true; // keep the audio session for the call screen
    if (InCallManager) {
      try { InCallManager.stopRingtone(); } catch (e) {}
    }
    try {
      const routes = navigation.getState?.()?.routes || [];
      const hasCallRoute = routes.some((r) => r.name === 'Call');
      if (hasCallRoute && navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.replace('Call', { otherUser: remoteUser, callType });
      }
    } catch (e) {
      console.warn('[IncomingCallScreen] redirect to call screen failed:', e.message);
    }
  }, [callState]); // eslint-disable-line react-hooks/exhaustive-deps

  // If caller hung up or call expired before we answered → auto dismiss
  useEffect(() => {
    if ((callState === 'ended' || callState === 'idle') && !hasActed.current) {
      hasActed.current = true;
    isAccepted.current = true;
      dismissScreen();
    }
  }, [callState]);

  const handleAccept = () => {
    if (hasActed.current) return;
    hasActed.current = true;
    isAccepted.current = true;
    if (InCallManager) {
      try {
        InCallManager.stopRingtone();
        // Immediately ensure speakerphone is OFF when receiver accepts an audio call
        if (callType !== 'video') {
          InCallManager.setSpeakerphoneOn(false);
          InCallManager.setForceSpeakerphoneOn(false);
          if (typeof InCallManager.chooseAudioRoute === 'function') {
            InCallManager.chooseAudioRoute('EARPIECE').catch(() => {});
          }
          // Multi-stage check to override any lingering ringtone restore
          [100, 250].forEach((delay) => {
            setTimeout(() => {
              try {
                InCallManager.setSpeakerphoneOn(false);
                InCallManager.setForceSpeakerphoneOn(false);
                if (typeof InCallManager.chooseAudioRoute === 'function') {
                  InCallManager.chooseAudioRoute('EARPIECE').catch(() => {});
                }
              } catch (e) {}
            }, delay);
          });
        }
      } catch (e) {}
    }
    if (soundRef.current) {
      const s = soundRef.current;
      soundRef.current = null;
      s.stopAsync().catch(() => {});
      s.unloadAsync().catch(() => {});
    }
    // Audio session will be managed exclusively by CallScreen / InCallManager
    // Don't emit call_answer here — useWebRTCCall hook in CallScreen
    // will create the real SDP answer and emit it after setting up media.
    // Mark as 'connecting' — the hook will set 'active' when WebRTC connects.
    setCallAccepted();
    navigation.replace('Call', { otherUser: remoteUser, callType });
  };

  // "Answer" tapped on the notification: run the normal accept flow once the call data is in the store
  // Re-checks when the call data (remoteUser/callState) arrives, so it works whichever happens first.
  useEffect(() => {
    if (hasActed.current) return;
    const wanted = !!route?.params?.autoAccept || hasPendingAutoAccept();
    if (!wanted || !remoteUser || callState !== 'incoming') return;
    consumePendingAutoAccept();
    const t = setTimeout(() => handleAccept(), 0);
    return () => clearTimeout(t);
  }, [remoteUser, callState, route?.params?.autoAccept]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReject = () => {
    if (hasActed.current) return;
    hasActed.current = true;
    isAccepted.current = true;
    if (InCallManager) {
      try { InCallManager.stopRingtone(); } catch (e) {}
    }
    if (soundRef.current) {
      const s = soundRef.current;
      soundRef.current = null;
      s.stopAsync().catch(() => {});
      s.unloadAsync().catch(() => {});
    }
    if (Platform.OS !== 'web') {
      try {
      Audio.setAudioModeAsync({
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});
    } catch (e) {}
    }
    const targetId = remoteUser?._id || remoteUser?.id;
    if (targetId) {
      emit('call_reject', { to: targetId });
    }
    resetCall(); // instant reset to idle
    dismissScreen();
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
