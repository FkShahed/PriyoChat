import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image,
  TextInput, ActivityIndicator, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { conversationApi } from '../../api/services';
import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';
import { formatTime, getInitials } from '../../utils/helpers';
import { useColors } from '../../store/useThemeStore';

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

export default function ChatListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const { conversations, setConversations, onlineUsers } = useChatStore();
  const C = useColors();
  const isDark = C.bg === '#121212';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const { data } = await conversationApi.getAll();
      setConversations(data);
    } catch (err) {
      console.error(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, []);

  const filtered = conversations.filter((c) => {
    const other = c.participants?.find((p) => p._id?.toString() !== user?._id?.toString());
    return other?.name?.toLowerCase()?.includes(search.toLowerCase());
  });

  const renderItem = ({ item }) => {
    const other = item.participants?.find((p) => p._id?.toString() !== user?._id?.toString());
    const isOnline = onlineUsers[other?._id] ?? other?.isOnline;
    const lastMsg = item.lastMessage;
    const isDeleted = lastMsg?.isDeleted;
    const preview = isDeleted
      ? 'Message deleted'
      : lastMsg?.images?.length
      ? `${lastMsg.images.length} photo${lastMsg.images.length > 1 ? 's' : ''}`
      : lastMsg?.text || 'Start a conversation';

    const gradColors = avatarGradient(other?.name || '');
    const isMine = lastMsg?.sender === user?._id;

    let statusIcon = null;
    if (isMine && lastMsg) {
      const color = lastMsg.status === 'seen' ? '#0084FF' : C.textSecondary;
      const iconName = lastMsg.status === 'sent' ? 'checkmark' : 'checkmark-done';
      statusIcon = <Ionicons name={iconName} size={13} color={color} style={{ marginRight: 3 }} />;
    }

    return (
      <TouchableOpacity
        style={[styles.item, { backgroundColor: C.surface }]}
        onPress={() => navigation.navigate('Chat', { conversation: item, otherUser: other })}
        activeOpacity={0.75}
      >
        <View style={styles.avatarWrapper}>
          {other?.avatar ? (
            <Image source={{ uri: other.avatar }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={gradColors} style={styles.avatar}>
              <Text style={styles.initials}>{getInitials(other?.name)}</Text>
            </LinearGradient>
          )}
          {isOnline && <View style={[styles.onlineDot, { borderColor: C.surface }]} />}
        </View>

        <View style={styles.info}>
          <View style={styles.row}>
            <Text style={[styles.name, { color: C.text }]} numberOfLines={1}>{other?.name || 'Unknown'}</Text>
            <Text style={[styles.time, { color: C.textSecondary }]}>{lastMsg ? formatTime(lastMsg.createdAt) : ''}</Text>
          </View>
          <View style={[styles.row, { marginTop: 3 }]}>
            <View style={styles.previewRow}>
              {statusIcon}
              <Text
                style={[styles.preview, { color: C.textSecondary }, isDeleted && { fontStyle: 'italic' }]}
                numberOfLines={1}
              >
                {isMine ? `You: ${preview}` : preview}
              </Text>
            </View>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={15} color={C.border} style={{ marginLeft: 6 }} />
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
            <Text style={styles.headerTitle}>Messages</Text>
            <Text style={styles.headerSub}>
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('SearchUsers')} activeOpacity={0.8}>
            <Ionicons name="create-outline" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={[styles.searchBox, searchFocused && styles.searchBoxFocused]}>
          <Ionicons name="search" size={17} color="rgba(255,255,255,0.6)" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search conversations…"
            placeholderTextColor="rgba(255,255,255,0.5)"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color="#0084FF" size="large" />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: isDark ? 'rgba(0,132,255,0.12)' : 'rgba(0,132,255,0.07)' }]}>
            <Ionicons name="chatbubbles-outline" size={52} color="#0084FF" />
          </View>
          <Text style={[styles.emptyTitle, { color: C.text }]}>
            {search ? 'No results found' : 'No conversations yet'}
          </Text>
          <Text style={[styles.emptySub, { color: C.textSecondary }]}>
            {search ? 'Try a different name' : 'Find friends to start chatting'}
          </Text>
          {!search && (
            <TouchableOpacity onPress={() => navigation.navigate('SearchUsers')} style={styles.emptyBtn} activeOpacity={0.85}>
              <Ionicons name="person-add-outline" size={17} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.emptyBtnText}>Find Friends</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadConversations(); }}
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
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#FFF', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  newBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  searchBoxFocused: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#FFF', paddingVertical: 0 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  sep: { height: 0.5, marginLeft: 84 },
  avatarWrapper: { position: 'relative', marginRight: 14 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 19, fontWeight: '700', color: '#FFF' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 15, height: 15, borderRadius: 7.5,
    backgroundColor: '#25D366', borderWidth: 2.5,
  },
  info: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  time: { fontSize: 12 },
  previewRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  preview: { fontSize: 13, flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', marginBottom: 28 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0084FF', borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 13,
  },
  emptyBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
