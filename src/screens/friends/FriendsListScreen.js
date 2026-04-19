import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Image, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';
import { useColors } from '../../store/useThemeStore';
import { getInitials } from '../../utils/helpers';

export default function FriendsListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const conversations = useChatStore((s) => s.conversations);
  const C = useColors();
  const [search, setSearch] = useState('');

  // Extract unique friends from conversations
  const friends = useMemo(() => {
    const friendMap = {};
    conversations.forEach((c) => {
      const other = c.participants?.find((p) => p._id !== user?._id);
      if (other && !friendMap[other._id]) {
        friendMap[other._id] = { ...other, conversationId: c._id };
      }
    });
    return Object.values(friendMap).sort((a, b) => a.name.localeCompare(b.name));
  }, [conversations, user]);

  const filteredFriends = friends.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  const handleChat = (friend) => {
    navigation.navigate('Chat', { conversationId: friend.conversationId, otherUser: friend });
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
              <Text style={[styles.status, { color: C.textSecondary }]} numberOfLines={1}>{item.status || 'Hey there! I am using PriyoChat.'}</Text>
            </View>
            <Ionicons name="chatbubble" size={22} color="#0084FF" style={{ padding: 10 }} />
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
  friendItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarFallback: { backgroundColor: '#0084FF', alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  friendInfo: { flex: 1, marginLeft: 14 },
  name: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  status: { fontSize: 13 },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySub: { fontSize: 14 },
});
