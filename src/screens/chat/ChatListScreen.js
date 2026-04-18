import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image,
  TextInput, StatusBar, RefreshControl, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { conversationApi } from '../../api/services';
import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';
import { formatTime, getInitials, COLORS } from '../../utils/helpers';

export default function ChatListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const { conversations, setConversations, onlineUsers } = useChatStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

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
    const other = c.participants?.find((p) => p._id !== user?._id);
    return other?.name?.toLowerCase().includes(search.toLowerCase());
  });

  const renderItem = ({ item, index }) => {
    const other = item.participants?.find((p) => p._id !== user?._id);
    const isOnline = onlineUsers[other?._id] ?? other?.isOnline;
    const lastMsg = item.lastMessage;
    const isDeleted = lastMsg?.isDeleted;
    const preview = isDeleted
      ? '🚫 Message deleted'
      : lastMsg?.images?.length
      ? `📷 ${lastMsg.images.length} photo${lastMsg.images.length > 1 ? 's' : ''}`
      : lastMsg?.isVoiceNote
      ? '🎤 Voice note'
      : lastMsg?.text || 'Start a conversation';

    return (
      <Animated.View entering={FadeInRight.delay(index * 50).duration(300)}>
        <TouchableOpacity
          style={styles.item}
          onPress={() => navigation.navigate('Chat', { conversation: item, otherUser: other })}
          activeOpacity={0.7}
        >
          <View style={styles.avatarWrapper}>
            {other?.avatar ? (
              <Image source={{ uri: other.avatar }} style={styles.avatar} />
            ) : (
              <LinearGradient colors={['#0084FF', '#0060CC']} style={styles.avatarFallback}>
                <Text style={styles.initials}>{getInitials(other?.name)}</Text>
              </LinearGradient>
            )}
            {isOnline && <View style={styles.onlineDot} />}
          </View>

          <View style={styles.info}>
            <View style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>{other?.name || 'Unknown'}</Text>
              <Text style={styles.time}>{lastMsg ? formatTime(lastMsg.createdAt) : ''}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.preview, isDeleted && { fontStyle: 'italic', color: '#AAAAAA' }]} numberOfLines={1}>
                {lastMsg?.sender === user?._id ? `You: ${preview}` : preview}
              </Text>
              {lastMsg?.status === 'sent' && lastMsg?.sender === user?._id && (
                <Text style={styles.statusIcon}>✓</Text>
              )}
              {lastMsg?.status === 'delivered' && lastMsg?.sender === user?._id && (
                <Text style={styles.statusIcon}>✓✓</Text>
              )}
              {lastMsg?.status === 'seen' && lastMsg?.sender === user?._id && (
                <Text style={[styles.statusIcon, { color: '#0084FF' }]}>✓✓</Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity onPress={() => navigation.navigate('SearchUsers')} style={styles.addBtn}>
          <Text style={styles.addBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search conversations"
          placeholderTextColor="#AAAAAA"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} size="large" />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySubtitle}>Search for friends to start chatting</Text>
          <TouchableOpacity onPress={() => navigation.navigate('SearchUsers')} style={styles.emptyBtn}>
            <Text style={styles.emptyBtnText}>Find Friends</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadConversations(); }} colors={[COLORS.primary]} />
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
    backgroundColor: '#FFF', borderBottomWidth: 0.5, borderBottomColor: '#EEEEEE',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#1C1C1E' },
  addBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F2F2F7',
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { fontSize: 22, color: '#0084FF', lineHeight: 28 },
  searchWrapper: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10,
    backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: '#1C1C1E' },
  item: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F2F2F7',
  },
  avatarWrapper: { position: 'relative', marginRight: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
  },
  initials: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 14, height: 14, borderRadius: 7, backgroundColor: '#25D366',
    borderWidth: 2, borderColor: '#FFF',
  },
  info: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', color: '#1C1C1E', flex: 1, marginRight: 8 },
  time: { fontSize: 12, color: '#8E8E93' },
  preview: { fontSize: 13, color: '#8E8E93', flex: 1, marginRight: 4 },
  statusIcon: { fontSize: 12, color: '#8E8E93' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#8E8E93', textAlign: 'center', marginBottom: 24 },
  emptyBtn: { backgroundColor: '#0084FF', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
