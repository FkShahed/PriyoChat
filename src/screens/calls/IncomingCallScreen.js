import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import useCallStore from '../../store/useCallStore';
import useSocketStore from '../../store/useSocketStore';
import { getInitials } from '../../utils/helpers';

export default function IncomingCallScreen({ navigation }) {
  const { remoteUser, callType, setCallActive, endCall } = useCallStore();
  const { emit } = useSocketStore();

  const handleAccept = () => {
    // In full WebRTC implementation, you'd create a peer connection here
    emit('call_answer', { to: remoteUser._id, answer: { sdp: 'placeholder' } });
    setCallActive();
    navigation.replace('Call', { otherUser: remoteUser, callType });
  };

  const handleReject = () => {
    emit('call_reject', { to: remoteUser._id });
    endCall('rejected');
    navigation.goBack();
  };

  return (
    <LinearGradient colors={['#0A1628', '#1A2332']} style={styles.container}>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.content}>
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
            <Text style={styles.btnEmoji}>📵</Text>
            <Text style={styles.btnLabel}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept}>
            <Text style={styles.btnEmoji}>📞</Text>
            <Text style={styles.btnLabel}>Accept</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
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
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginBottom: 48 },
  buttons: { flexDirection: 'row', gap: 60 },
  rejectBtn: { alignItems: 'center' },
  acceptBtn: { alignItems: 'center' },
  btnEmoji: { fontSize: 40, marginBottom: 8 },
  btnLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
});
