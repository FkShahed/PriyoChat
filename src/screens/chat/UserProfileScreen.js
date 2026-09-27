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
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.surface }]} onPress={() => navigation.goBack()}>
            <Ionicons name="chatbubble" size={22} color="#0084FF" />
            <Text style={[styles.actionText, { color: C.text }]}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.surface }]} onPress={() => handleCall('audio')}>
            <Ionicons name="call" size={22} color="#0084FF" />
            <Text style={[styles.actionText, { color: C.text }]}>Audio</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.surface }]} onPress={() => handleCall('video')}>
            <Ionicons name="videocam" size={22} color="#0084FF" />
            <Text style={[styles.actionText, { color: C.text }]}>Video</Text>
          </TouchableOpacity>
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>USER INFORMATION</Text>
          
          <View style={[styles.infoCard, { backgroundColor: C.surface }]}>
            {user?.email ? (
              <View style={styles.infoRow}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(0,132,255,0.1)' }]}>
                  <Ionicons name="mail" size={18} color="#0084FF" />
                </View>
                <View style={styles.infoText}>
                  <Text style={[styles.cardLabel, { color: C.textSecondary }]}>Email</Text>
                  <Text style={[styles.cardValue, { color: C.text }]}>{user.email}</Text>
                </View>
              </View>
            ) : null}

            {user?.status ? (
              <>
                {user?.email && <View style={[styles.divider, { backgroundColor: C.border }]} />}
                <View style={styles.infoRow}>
                  <View style={[styles.iconBox, { backgroundColor: 'rgba(52,199,89,0.1)' }]}>
                    <Ionicons name="information-circle" size={18} color="#34C759" />
                  </View>
                  <View style={styles.infoText}>
                    <Text style={[styles.cardLabel, { color: C.textSecondary }]}>Status / Bio</Text>
                    <Text style={[styles.cardValue, { color: C.text }]}>{user.status}</Text>
                  </View>
                </View>
              </>
            ) : null}

            {(user?.email || user?.status) && <View style={[styles.divider, { backgroundColor: C.border }]} />}
            
            <View style={styles.infoRow}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(255,149,0,0.1)' }]}>
                <Ionicons name="time" size={18} color="#FF9500" />
              </View>
              <View style={styles.infoText}>
                <Text style={[styles.cardLabel, { color: C.textSecondary }]}>Last Seen</Text>
                <Text style={[styles.cardValue, { color: C.text }]}>{statusText}</Text>
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
    width: 100,
    height: 80,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.1, shadowRadius: 3,
  },
  actionText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  infoSection: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    marginLeft: 12,
    letterSpacing: 0.8,
  },
  infoCard: {
    borderRadius: 20,
    paddingVertical: 8,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  infoText: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  cardValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginLeft: 72,
  },
});
