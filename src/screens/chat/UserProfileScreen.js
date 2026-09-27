import React from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, Modal,
  ScrollView, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getInitials, formatLastSeen } from '../../utils/helpers';
import { useColors } from '../../store/useThemeStore';
import useCallStore from '../../store/useCallStore';

export default function UserProfileScreen({ route, navigation }) {
  const { user, isOnline, lastSeen } = route.params || {};
  const C = useColors();
  const isDark = C.bg === '#121212';
  const startCall = useCallStore((s) => s.startCall);

  const statusText = isOnline
    ? '🟢 Online'
    : lastSeen
    ? formatLastSeen(lastSeen)
    : '⚫ Offline';

  const handleCall = (type) => {
    startCall(user, type);
    navigation.navigate('Call', { otherUser: user, callType: type });
  };

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      {/* Header gradient */}
      <LinearGradient colors={['#0084FF', '#0060CC']} style={styles.headerGrad}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.avatarWrapper}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.initials}>{getInitials(user?.name)}</Text>
            </View>
          )}
          {isOnline && <View style={styles.onlineBadge} />}
        </View>
        <Text style={styles.name}>{user?.name || 'Unknown'}</Text>
        <Text style={styles.statusLabel}>{statusText}</Text>
      </LinearGradient>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* Quick Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.goBack()}>
            <View style={[styles.actionIconCircle, { backgroundColor: isDark ? 'rgba(0,132,255,0.15)' : 'rgba(0,132,255,0.1)' }]}>
              <Ionicons name="chatbubble" size={28} color="#0084FF" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleCall('audio')}>
            <View style={[styles.actionIconCircle, { backgroundColor: isDark ? 'rgba(0,132,255,0.15)' : 'rgba(0,132,255,0.1)' }]}>
              <Ionicons name="call" size={28} color="#0084FF" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleCall('video')}>
            <View style={[styles.actionIconCircle, { backgroundColor: isDark ? 'rgba(0,132,255,0.15)' : 'rgba(0,132,255,0.1)' }]}>
              <Ionicons name="videocam" size={28} color="#0084FF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <View style={[styles.infoCard, { backgroundColor: C.surface }]}>
            {user?.email ? (
              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={24} color={isDark ? '#A1A1AA' : '#8E8E93'} style={styles.infoIcon} />
                <View style={[styles.infoContent, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}>
                  <Text style={[styles.infoLabel, { color: C.textSecondary }]}>Email</Text>
                  <Text style={[styles.infoValue, { color: C.text }]}>{user.email}</Text>
                </View>
              </View>
            ) : null}

            {user?.status ? (
              <View style={styles.infoRow}>
                <Ionicons name="information-circle-outline" size={24} color={isDark ? '#A1A1AA' : '#8E8E93'} style={styles.infoIcon} />
                <View style={[styles.infoContent, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}>
                  <Text style={[styles.infoLabel, { color: C.textSecondary }]}>Bio</Text>
                  <Text style={[styles.infoValue, { color: C.text }]}>{user.status}</Text>
                </View>
              </View>
            ) : null}
            
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={24} color={isDark ? '#A1A1AA' : '#8E8E93'} style={styles.infoIcon} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: C.textSecondary }]}>Last Seen</Text>
                <Text style={[styles.infoValue, { color: C.text }]}>{statusText}</Text>
              </View>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerGrad: {
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 36,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backBtn: {
    position: 'absolute',
    top: 52,
    left: 16,
    padding: 8,
  },
  backText: { color: '#FFF', fontSize: 28, lineHeight: 30 },
  avatarWrapper: { position: 'relative', marginBottom: 14, elevation: 8, shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 8 },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: '#FFF',
  },
  avatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 40, color: '#FFF', fontWeight: '700' },
  onlineBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#34C759',
    borderWidth: 3,
    borderColor: '#FFF',
  },
  name: { fontSize: 26, fontWeight: '800', color: '#FFF', marginBottom: 4 },
  statusLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500' },
  body: { flex: 1, paddingTop: 20 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  actionIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoSection: {
    paddingHorizontal: 20,
  },
  infoCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
  },
  infoIcon: {
    marginRight: 16,
  },
  infoContent: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 16,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '400',
  },
});
