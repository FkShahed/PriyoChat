import React from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, Modal,
  ScrollView, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getInitials, formatLastSeen } from '../../utils/helpers';
import { useColors } from '../../store/useThemeStore';

export default function UserProfileScreen({ route, navigation }) {
  const { user, isOnline, lastSeen } = route.params || {};
  const C = useColors();

  const statusText = isOnline
    ? '🟢 Online'
    : lastSeen
    ? formatLastSeen(lastSeen)
    : '⚫ Offline';

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

      {/* Info cards */}
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        {user?.status ? (
          <View style={[styles.card, { backgroundColor: C.surface }]}>
            <Text style={[styles.cardLabel, { color: C.textSecondary }]}>STATUS</Text>
            <Text style={[styles.cardValue, { color: C.text }]}>{user.status}</Text>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: C.surface }]}>
          <Text style={[styles.cardLabel, { color: C.textSecondary }]}>LAST SEEN</Text>
          <Text style={[styles.cardValue, { color: C.text }]}>{statusText}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  headerGrad: {
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 36,
  },
  backBtn: {
    position: 'absolute',
    top: 52,
    left: 16,
    padding: 8,
  },
  backText: { color: '#FFF', fontSize: 28, lineHeight: 30 },
  avatarWrapper: { position: 'relative', marginBottom: 14 },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
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
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#25D366',
    borderWidth: 3,
    borderColor: '#0084FF',
  },
  name: { fontSize: 26, fontWeight: '800', color: '#FFF', marginBottom: 6 },
  statusLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500' },
  body: { flex: 1, paddingTop: 20 },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cardValue: { fontSize: 16, color: '#1C1C1E', fontWeight: '500', marginTop: 2 },
});
