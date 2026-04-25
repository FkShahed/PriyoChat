import React from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image, StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useCallStore from '../../store/useCallStore';
import useAuthStore from '../../store/useAuthStore';
import { useColors } from '../../store/useThemeStore';
import { formatTime, getInitials } from '../../utils/helpers';

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

export default function CallsListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const { callHistory: allHistory, fetchHistory, startCall } = useCallStore();
  const [refreshing, setRefreshing] = React.useState(false);
  const callHistory = (allHistory || []).filter(h => !h.ownerId || h.ownerId === user?._id?.toString());
  
  const C = useColors();
  const isDark = C.bg === '#121212';

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  }, [fetchHistory]);

  React.useEffect(() => {
    fetchHistory();
  }, []);

  const handleCall = (remoteUser, type) => {
    startCall(remoteUser, type);
    navigation.navigate('Call', { otherUser: remoteUser, callType: type });
  };

  const renderItem = ({ item }) => {
    const { remoteUser, type, direction, status, timestamp } = item;
    const gradColors = avatarGradient(remoteUser?.name || '');
    
    let iconName = 'call';
    let iconColor = C.textSecondary;

    if (direction === 'incoming') {
      iconName = 'arrow-down-left';
      iconColor = status === 'missed' ? '#FF3B30' : '#34C759';
    } else {
      iconName = 'arrow-up-right';
      iconColor = status === 'rejected' ? '#FF3B30' : C.textSecondary;
    }

    return (
      <TouchableOpacity
        style={[styles.item, { backgroundColor: C.surface }]}
        onPress={() => handleCall(remoteUser, type)}
        activeOpacity={0.75}
      >
        <View style={styles.avatarWrapper}>
          {remoteUser?.avatar ? (
            <Image source={{ uri: remoteUser.avatar }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={gradColors} style={styles.avatar}>
              <Text style={styles.initials}>{getInitials(remoteUser?.name)}</Text>
            </LinearGradient>
          )}
        </View>

        <View style={styles.info}>
          <Text style={[styles.name, { color: status === 'missed' ? '#FF3B30' : C.text }]} numberOfLines={1}>
            {remoteUser?.name || 'Unknown'}
          </Text>
          <View style={styles.previewRow}>
            <Ionicons name={iconName} size={14} color={iconColor} style={{ marginRight: 6 }} />
            <Text style={[styles.preview, { color: C.textSecondary }]} numberOfLines={1}>
              {direction.charAt(0).toUpperCase() + direction.slice(1)} • {type === 'video' ? 'Video' : 'Audio'} • {formatTime(timestamp)}
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.callBtn} 
          onPress={() => handleCall(remoteUser, type)}
        >
          <Ionicons name={type === 'video' ? 'videocam-outline' : 'call-outline'} size={22} color="#0084FF" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const headerGrad = isDark ? ['#1A1A2E', '#16213E'] : ['#006EE6', '#0084FF'];

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <LinearGradient colors={headerGrad} style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Calls</Text>
            <Text style={styles.headerSub}>
              Recent call history
            </Text>
          </View>
        </View>
      </LinearGradient>

      {callHistory.length === 0 && !refreshing ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: isDark ? 'rgba(0,132,255,0.12)' : 'rgba(0,132,255,0.07)' }]}>
            <Ionicons name="call-outline" size={52} color="#0084FF" />
          </View>
          <Text style={[styles.emptyTitle, { color: C.text }]}>No Recent Calls</Text>
          <Text style={[styles.emptySub, { color: C.textSecondary }]}>
            Your incoming and outgoing calls will appear here.
          </Text>
          <TouchableOpacity onPress={onRefresh} style={{ marginTop: 20 }}>
            <Text style={{ color: '#0084FF', fontWeight: '700' }}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={callHistory}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 6 }}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: C.border }]} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 52, paddingHorizontal: 20, paddingBottom: 20 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#FFF', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  sep: { height: 0.5, marginLeft: 84 },
  avatarWrapper: { position: 'relative', marginRight: 14 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 19, fontWeight: '700', color: '#FFF' },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600', flex: 1, marginBottom: 3 },
  previewRow: { flexDirection: 'row', alignItems: 'center' },
  preview: { fontSize: 13, flex: 1 },
  callBtn: { padding: 10, paddingRight: 0 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', marginBottom: 28 },
});
