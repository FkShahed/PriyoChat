import React from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image, StatusBar, Alert, ScrollView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, Feather } from '@expo/vector-icons';
import useCallStore from '../../store/useCallStore';
import useAuthStore from '../../store/useAuthStore';
import useChatStore from '../../store/useChatStore';
import { useColors } from '../../store/useThemeStore';
import { formatTime, getInitials } from '../../utils/helpers';
import Avatar from '../../components/common/Avatar';

const ACCENT = '#0084FF';

const AVATAR_COLORS = [
  ['#FF6B6B', '#FF8E53'],
  ['#4ECDC4', '#44A08D'],
  ['#A855F7', '#EC4899'],
  ['#F093FB', '#F5576C'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#a18cd1', '#fbc2eb'],
];

function avatarGradient(name = '') {
  const code = name.charCodeAt(0) || 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

const FILTERS = [
  { key: 'all', label: 'All', icon: 'call' },
  { key: 'incoming', label: 'Incoming', icon: 'arrow-down' },
  { key: 'outgoing', label: 'Outgoing', icon: 'arrow-up' },
  { key: 'missed', label: 'Missed', icon: 'close' },
];

// "Today" / "Yesterday" / "12 Nov 2026" label for grouping the history by day
function dayLabel(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return 'Earlier';
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CallsListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const { callHistory: allHistory, fetchHistory, startCall } = useCallStore();
  const [refreshing, setRefreshing] = React.useState(false);
  const [filter, setFilter] = React.useState('all');

  const ownHistory = React.useMemo(() => {
    return (allHistory || []).filter(h => !(h.ownerId && h.ownerId !== user?._id?.toString()));
  }, [allHistory, user]);

  const callHistory = React.useMemo(() => {
    return ownHistory.filter(h => {
      if (filter === 'incoming') return h.direction === 'incoming';
      if (filter === 'outgoing') return h.direction === 'outgoing';
      if (filter === 'missed') return h.status === 'missed';
      return true;
    });
  }, [ownHistory, filter]);

  const missedCount = React.useMemo(() => ownHistory.filter(h => h.status === 'missed').length, [ownHistory]);

  // History with "Today / Yesterday / date" headers between days
  const rows = React.useMemo(() => {
    const out = [];
    let last = null;
    callHistory.forEach((item) => {
      const label = dayLabel(item.timestamp);
      if (label !== last) {
        out.push({ type: 'header', key: 'h_' + label + '_' + out.length, label });
        last = label;
      }
      out.push({ type: 'call', key: String(item.id), item });
    });
    return out;
  }, [callHistory]);

  const baseC = useColors();
  const isDark = baseC.bg === '#121212';
  // Same palette as Settings/Profile so the whole app feels consistent
  const C = isDark
    ? { ...baseC, bg: '#0C0D10', surface: '#16181D', surfaceAlt: '#20232A', text: '#F2F2F5', textSecondary: '#8E9099', border: 'rgba(255,255,255,0.08)' }
    : baseC;

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  }, [fetchHistory]);

  React.useEffect(() => {
    fetchHistory();
  }, []);

  const handleCall = (remoteUser, type) => {
    const { callState } = useCallStore.getState();
    if (callState !== 'idle' && callState !== 'ended') {
      Alert.alert('Already in a Call', 'Please end your current call before starting a new one.');
      return;
    }
    startCall(remoteUser, type);
    navigation.navigate('Call', { otherUser: remoteUser, callType: type });
  };

  // Name / photo -> that person's profile (calls start ONLY from the call icon)
  const handleProfile = (remoteUser) => {
    if (!remoteUser) return;
    const { conversations, onlineUsers } = useChatStore.getState();
    const rid = String(remoteUser._id || remoteUser.id || '');
    const convo = (Array.isArray(conversations) ? conversations : []).find((c) =>
      c?.participants?.some((p) => String(p?._id) === rid)
    );
    const full = convo?.participants?.find((p) => String(p?._id) === rid) || remoteUser;
    navigation.navigate('UserProfile', {
      user: full,
      isOnline: !!(onlineUsers?.[rid] ?? full?.isOnline),
      lastSeen: full?.lastSeen || full?.updatedAt,
      conversationId: convo?._id,
    });
  };

  const renderItem = ({ item: row }) => {
    if (row.type === 'header') {
      return <Text style={[styles.dayLabel, { color: C.textSecondary }]}>{row.label}</Text>;
    }
    const { remoteUser, type, direction, status, timestamp } = row.item;
    const gradColors = avatarGradient(remoteUser?.name || '');

    const missed = status === 'missed';
    const declined = status === 'rejected';
    const incoming = direction === 'incoming';

    // Direction badge on the avatar + the status text under the name
    const dirColor = missed || declined ? '#FF3B30' : incoming ? '#34C759' : ACCENT;
    const dirIcon = incoming ? 'arrow-down-left' : 'arrow-up-right';
    const statusText = missed ? 'Missed' : declined ? 'Declined' : incoming ? 'Incoming' : 'Outgoing';

    return (
      <View style={[styles.item, { backgroundColor: C.surface, borderColor: C.border }]}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => handleProfile(remoteUser)} style={styles.avatarWrapper}>
          <Avatar uri={remoteUser?.avatar} style={styles.avatar} />
          <View style={[styles.dirBadge, { backgroundColor: dirColor, borderColor: C.surface }]}>
            <Feather name={dirIcon} size={12} color="#FFF" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.7} style={styles.info} onPress={() => handleProfile(remoteUser)}>
          <Text style={[styles.name, { color: missed ? '#FF3B30' : C.text }]} numberOfLines={1}>
            {remoteUser?.name || 'Unknown'}
          </Text>
          <View style={styles.previewRow}>
            <Ionicons
              name={type === 'video' ? 'videocam' : 'call'}
              size={12}
              color={C.textSecondary}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.preview, { color: C.textSecondary }]} numberOfLines={1}>
              <Text style={{ color: missed || declined ? '#FF3B30' : C.textSecondary, fontWeight: '600' }}>{statusText}</Text>
              {'  •  '}{formatTime(timestamp)}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.callBtn, { backgroundColor: 'rgba(0,132,255,0.14)' }]}
          onPress={() => handleCall(remoteUser, type)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name={type === 'video' ? 'videocam' : 'call'} size={19} color={ACCENT} />
        </TouchableOpacity>
      </View>
    );
  };

  const headerGrad = isDark ? ['#1D2129', '#14161B'] : ['#006EE6', '#0084FF'];

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <LinearGradient colors={headerGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={styles.orb} />
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Calls</Text>
            <Text style={styles.headerSub}>Recent call history</Text>
          </View>
          <View style={styles.statWrap}>
            {missedCount > 0 && (
              <View style={[styles.statPill, { backgroundColor: 'rgba(255,59,48,0.9)' }]}>
                <Ionicons name="close" size={13} color="#FFF" />
                <Text style={styles.statText}>{missedCount} missed</Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>

      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                activeOpacity={0.8}
                style={[
                  styles.filterChip,
                  { backgroundColor: C.surface, borderColor: C.border },
                  active && styles.filterChipActive,
                ]}
                onPress={() => setFilter(f.key)}
              >
                <Ionicons name={f.icon} size={13} color={active ? '#FFF' : C.textSecondary} />
                <Text style={[styles.filterText, { color: C.textSecondary }, active && styles.filterTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {callHistory.length === 0 && !refreshing ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: isDark ? 'rgba(0,132,255,0.12)' : 'rgba(0,132,255,0.07)' }]}>
            <Ionicons name="call-outline" size={52} color={ACCENT} />
          </View>
          <Text style={[styles.emptyTitle, { color: C.text }]}>
            {filter === 'all' ? 'No Recent Calls' : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} calls`}
          </Text>
          <Text style={[styles.emptySub, { color: C.textSecondary }]}>
            Your incoming and outgoing calls will appear here.
          </Text>
          <TouchableOpacity onPress={onRefresh} style={[styles.refreshBtn, { backgroundColor: 'rgba(0,132,255,0.12)' }]}>
            <Ionicons name="refresh" size={16} color={ACCENT} />
            <Text style={{ color: ACCENT, fontWeight: '700' }}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 54, paddingHorizontal: 20, paddingBottom: 24,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden',
  },
  orb: {
    position: 'absolute', top: -80, right: -60, width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#FFF', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  statWrap: { flexDirection: 'row', gap: 8 },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6,
  },
  statText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  filterWrap: { paddingTop: 16, paddingBottom: 6 },
  filterRow: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
  },
  filterChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  filterText: { fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: '#FFF', fontWeight: '700' },
  dayLabel: {
    fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
    marginTop: 14, marginBottom: 8, paddingHorizontal: 6,
  },
  item: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8,
  },
  avatarWrapper: { position: 'relative', marginRight: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  dirBadge: {
    position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  previewRow: { flexDirection: 'row', alignItems: 'center' },
  preview: { fontSize: 12.5, flex: 1 },
  callBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center' },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14,
  },
});
