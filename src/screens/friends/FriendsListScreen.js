import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Image, StatusBar, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';
import { useColors } from '../../store/useThemeStore';
import { getInitials } from '../../utils/helpers';
import { requestApi, conversationApi } from '../../api/services';

export default function FriendsListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const conversations = useChatStore((s) => s.conversations);
  const C = useColors();
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

  const handleChat = (friend) => {
    navigation.navigate('Chat', { conversation: friend.conversation, otherUser: friend });
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

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={C.bg === '#121212' ? 'light-content' : 'dark-content'} />
      
      <View style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <Text style={[styles.title, { color: C.text }]}>Friends</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('SearchUsers')}>
          <Ionicons name="person-add" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: C.surfaceAlt || (C.bg === '#121212' ? '#1A1A1A' : '#F0F0F0') }]}>
        <Ionicons name="search" size={20} color={C.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: C.text }]}
          placeholder="Search friends..."
          placeholderTextColor={C.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <TouchableOpacity
        style={[styles.requestsBtn, { borderBottomColor: C.border }]}
        onPress={() => navigation.navigate('FriendRequests')}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.requestIconWrapper}>
            <Ionicons name="person-add" size={18} color="#0084FF" />
          </View>
          <Text style={[styles.requestsText, { color: C.text }]}>Friend Requests</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={20} color={C.textSecondary} />
        </View>
      </TouchableOpacity>

      <FlatList
        data={filteredFriends}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={64} color={C.textSecondary} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyText, { color: C.text }]}>No friends found</Text>
            <Text style={[styles.emptySub, { color: C.textSecondary }]}>Add some friends to start chatting!</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.friendItem, { borderBottomColor: C.border }]} onPress={() => handleChat(item)}>
            {item.avatar ? (
              <Image source={{ uri: item.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.initials}>{getInitials(item.name)}</Text>
              </View>
            )}
            <View style={styles.friendInfo}>
              <Text style={[styles.name, { color: C.text }]}>{item.name}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity onPress={() => handleUnfriend(item)} style={[styles.actionIconWrapper, { borderColor: '#FF3B30' }]}>
                <Ionicons name="person-remove-outline" size={18} color="#FF3B30" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleChat(item)} style={[styles.actionIconWrapper, { borderColor: C.border }]}>
                <Ionicons name="chatbubble-outline" size={18} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 58, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 0.5,
  },
  title: { fontSize: 28, fontWeight: '800' },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#0084FF', alignItems: 'center', justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, paddingHorizontal: 12, borderRadius: 12, height: 44,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16 },
  requestsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 0.5, marginBottom: 8,
  },
  requestsText: { fontSize: 16, fontWeight: '600', marginLeft: 12 },
  requestIconWrapper: {
    backgroundColor: 'rgba(0, 132, 255, 0.1)',
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    backgroundColor: '#FF3B30', paddingHorizontal: 8, paddingVertical: 3, 
    borderRadius: 12, marginRight: 8, minWidth: 24, alignItems: 'center'
  },
  badgeText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  friendItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarFallback: { backgroundColor: '#0084FF', alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  friendInfo: { flex: 1, marginLeft: 14 },
  name: { fontSize: 16, fontWeight: '600' },
  actionIconWrapper: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySub: { fontSize: 14 },
});
