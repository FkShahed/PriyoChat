import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Image, StatusBar, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';
import { useColors } from '../../store/useThemeStore';
import { getInitials } from '../../utils/helpers';
import Avatar from '../../components/common/Avatar';
import { requestApi, conversationApi } from '../../api/services';

const ACCENT = '#0084FF';
const AVATAR_COLORS = [
  ['#0084FF', '#00C6FF'],
  ['#FF512F', '#DD2476'],
  ['#8E2DE2', '#4A00E0'],
  ['#11998e', '#38ef7d'],
  ['#FC466B', '#3F5EFB'],
  ['#F7971E', '#FFD200'],
];
const avatarGradient = (name = '') => AVATAR_COLORS[(name ? name.charCodeAt(0) : 0) % AVATAR_COLORS.length];

export default function FriendsListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const conversations = useChatStore((s) => s.conversations);
  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const baseC = useColors();
  const isDark = baseC.bg === '#121212';
  // Same palette as Settings/Profile so the whole app feels consistent
  const C = isDark
    ? { ...baseC, bg: '#0C0D10', surface: '#16181D', surfaceAlt: '#20232A', text: '#F2F2F5', textSecondary: '#8E9099', border: 'rgba(255,255,255,0.08)' }
    : baseC;
  const [search, setSearch] = useState('');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const fetchRequests = () => {
      requestApi.getPending().then(({ data }) => {
        if (Array.isArray(data)) setPendingCount(data.length);
      }).catch(() => {});
    };
    fetchRequests();
    const unsubscribe = navigation.addListener('focus', fetchRequests);
    return unsubscribe;
  }, [navigation]);

  // Extract unique friends from conversations
  const friends = useMemo(() => {
    const friendMap = {};
    const list = Array.isArray(conversations) ? conversations : [];
    list.forEach((c) => {
      if (!c || !c.participants || !Array.isArray(c.participants)) return;
      const other = c.participants?.find((p) => p?._id?.toString() !== user?._id?.toString());
      if (other && other._id && !friendMap[other._id]) {
        friendMap[other._id] = { ...other, conversation: c };
      }
    });
    return Object.values(friendMap).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [conversations, user]);

  const filteredFriends = friends.filter((f) => (f.name || '').toLowerCase().includes((search || '').toLowerCase()));

  const isFriendOnline = (f) => !!(onlineUsers?.[f._id] ?? f.isOnline);
  const onlineCount = friends.filter(isFriendOnline).length;

  // Rows with A–Z section headers (list is already sorted by name)
  const rows = useMemo(() => {
    const out = [];
    let lastLetter = null;
    filteredFriends.forEach((f) => {
      const letter = ((f.name || '#').trim()[0] || '#').toUpperCase();
      if (letter !== lastLetter) {
        out.push({ type: 'header', key: 'h_' + letter, letter });
        lastLetter = letter;
      }
      out.push({ type: 'friend', key: f._id, friend: f });
    });
    return out;
  }, [filteredFriends]);

  const handleChat = (friend) => {
    navigation.navigate('Chat', { conversation: friend.conversation, otherUser: friend });
  };

  const handleProfile = (friend) => {
    navigation.navigate('UserProfile', {
      user: friend,
      isOnline: isFriendOnline(friend),
      lastSeen: friend?.lastSeen || friend?.updatedAt,
      conversationId: friend.conversation?._id,
    });
  };

  const handleUnfriend = (friend) => {
    Alert.alert(
      'Unfriend',
      `Are you sure you want to unfriend ${friend.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfriend',
          style: 'destructive',
          onPress: async () => {
            try {
              if (friend.conversation?._id) {
                await conversationApi.deleteConversation(friend.conversation._id);
                const { data } = await conversationApi.getAll();
                useChatStore.getState().setConversations(data);
              }
            } catch (err) {
              console.error('Failed to unfriend:', err);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => {
    if (item.type === 'header') {
      return <Text style={[styles.letter, { color: C.textSecondary }]}>{item.letter}</Text>;
    }
    const f = item.friend;
    const online = isFriendOnline(f);
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
        onPress={() => handleChat(f)}
      >
        <TouchableOpacity activeOpacity={0.8} onPress={() => handleProfile(f)} style={styles.avatarWrap}>
          <Avatar uri={f.avatar} style={styles.avatar} />
          {online && <View style={[styles.onlineDot, { borderColor: C.surface }]} />}
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.7} style={styles.info} onPress={() => handleProfile(f)}>
          <Text style={[styles.name, { color: C.text }]} numberOfLines={1}>{f.name}</Text>
          <Text style={[styles.sub, { color: online ? '#34C759' : C.textSecondary }]} numberOfLines={1}>
            {online ? 'Online' : (f.status || 'View profile')}
          </Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => handleChat(f)}
            style={[styles.actionBtn, { backgroundColor: 'rgba(0,132,255,0.14)' }]}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Ionicons name="chatbubble" size={17} color={ACCENT} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleUnfriend(f)}
            style={[styles.actionBtn, { backgroundColor: 'rgba(255,59,48,0.12)' }]}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Ionicons name="person-remove" size={17} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const header = (
    <View>
      {/* Friend requests */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('FriendRequests')}>
        <LinearGradient
          colors={pendingCount > 0 ? ['#0084FF', '#0A5FD6'] : (isDark ? ['#1B1E25', '#16181D'] : ['#FFFFFF', '#F4F7FB'])}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.requests, { borderColor: pendingCount > 0 ? 'transparent' : C.border }]}
        >
          <View style={[styles.requestIcon, { backgroundColor: pendingCount > 0 ? 'rgba(255,255,255,0.22)' : 'rgba(0,132,255,0.14)' }]}>
            <Ionicons name="person-add" size={20} color={pendingCount > 0 ? '#FFF' : ACCENT} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.requestsTitle, { color: pendingCount > 0 ? '#FFF' : C.text }]}>Friend Requests</Text>
            <Text style={[styles.requestsSub, { color: pendingCount > 0 ? 'rgba(255,255,255,0.8)' : C.textSecondary }]}>
              {pendingCount > 0 ? `${pendingCount} pending request${pendingCount > 1 ? 's' : ''}` : 'No new requests'}
            </Text>
          </View>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={20} color={pendingCount > 0 ? '#FFF' : C.textSecondary} />
        </LinearGradient>
      </TouchableOpacity>

      {friends.length > 0 && (
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
          All friends · {friends.length}
        </Text>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header (same look as the Calls page) */}
      <LinearGradient
        colors={isDark ? ['#1D2129', '#14161B'] : ['#006EE6', '#0084FF']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.orb} />
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Friends</Text>
            <Text style={styles.subtitle}>
              {friends.length > 0 ? `${friends.length} friends · ${onlineCount} online` : 'Find people to chat with'}
            </Text>
          </View>
          <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('SearchUsers')} style={styles.addBtn}>
            <Ionicons name="person-add" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Search */}
      <View style={[styles.search, { backgroundColor: C.surface, borderColor: C.border }]}>
        <Ionicons name="search" size={19} color={C.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: C.text }]}
          placeholder="Search friends"
          placeholderTextColor={C.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={C.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: 'rgba(0,132,255,0.12)' }]}>
              <Ionicons name="people" size={40} color={ACCENT} />
            </View>
            <Text style={[styles.emptyText, { color: C.text }]}>
              {search ? 'No matches' : 'No friends yet'}
            </Text>
            <Text style={[styles.emptySub, { color: C.textSecondary }]}>
              {search ? `Nobody named "${search}" in your friends` : 'Add some friends to start chatting!'}
            </Text>
            {!search && (
              <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('SearchUsers')}>
                <LinearGradient colors={['#0084FF', '#00C6FF']} style={styles.emptyBtn}>
                  <Ionicons name="person-add" size={16} color="#FFF" />
                  <Text style={styles.emptyBtnText}>Find friends</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        }
      />
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
  title: { fontSize: 28, fontWeight: '800', color: '#FFF', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  addBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 16, marginBottom: 14, paddingHorizontal: 14, height: 46,
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  // Requests card
  requests: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
  },
  requestIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  requestsTitle: { fontSize: 15, fontWeight: '700' },
  requestsSub: { fontSize: 12, marginTop: 2 },
  badge: {
    backgroundColor: '#FF3B30', borderRadius: 12, minWidth: 24, height: 24,
    paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
    marginTop: 22, marginBottom: 6, paddingHorizontal: 4,
  },
  letter: { fontSize: 13, fontWeight: '800', marginTop: 12, marginBottom: 6, paddingHorizontal: 6 },
  // Friend card
  card: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0, width: 15, height: 15, borderRadius: 8,
    backgroundColor: '#34C759', borderWidth: 2.5,
  },
  info: { flex: 1, marginLeft: 12, marginRight: 8 },
  name: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 11, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  // Empty
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: 50, paddingHorizontal: 30 },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: { fontSize: 14, textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14,
  },
  emptyBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
