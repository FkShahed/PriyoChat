import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image,
  TextInput, ActivityIndicator, StatusBar,
} from 'react-native';
import { requestApi, userApi } from '../../api/services';
import useAuthStore from '../../store/useAuthStore';
import useChatStore from '../../store/useChatStore';
import { getInitials } from '../../utils/helpers';
import { useColors } from '../../store/useThemeStore';

export default function SearchUsersScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const conversations = useChatStore((s) => s.conversations);
  const C = useColors();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sentIds, setSentIds] = useState({});

  useEffect(() => {
    const fetchSentRequests = async () => {
      try {
        const { data } = await requestApi.getSent();
        const sentMap = {};
        data.forEach(req => { if (req.to?._id) sentMap[req.to._id] = true; });
        setSentIds(sentMap);
      } catch (e) {}
    };
    fetchSentRequests();
  }, []);

  const search = useCallback(async (q) => {
    setLoading(true);
    try {
      const { data } = await userApi.search(q.trim());
      
      // Filter out users who are already our friends
      const friendIds = new Set();
      conversations.forEach(c => {
        c.participants?.forEach(p => {
          if (p._id?.toString() !== user?._id?.toString()) friendIds.add(p._id?.toString());
        });
      });
      
      const filtered = data.filter(u => !friendIds.has(u._id));
      setResults(filtered);
    } finally {
      setLoading(false);
    }
  }, [conversations, user]);

  useEffect(() => {
    const t = setTimeout(() => search(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const handleSendRequest = async (toId) => {
    try {
      await requestApi.send(toId);
    } catch (err) {}
    setSentIds((prev) => ({ ...prev, [toId]: true }));
  };

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={C.bg === '#121212' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: C.text }]}>Find People</Text>
      </View>

      {/* Search box */}
      <View style={[styles.searchBox, { backgroundColor: C.surfaceAlt }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.input, { color: C.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or email"
          placeholderTextColor={C.textSecondary}
          autoFocus
        />
        {loading && <ActivityIndicator size="small" color="#0084FF" style={{ marginRight: 12 }} />}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ paddingTop: 8 }}
        ListHeaderComponent={
          results.length > 0 ? (
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>
              {query.trim() ? 'Search Results' : 'Suggested People'}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          query.length > 0 && !loading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: C.textSecondary }]}>No users found for "{query}"</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.userItem, { borderBottomColor: C.border }]}>
            {item.avatar ? (
              <Image source={{ uri: item.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.initials}>{getInitials(item.name)}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.name, { color: C.text }]}>{item.name}</Text>
              <Text style={[styles.status, { color: C.textSecondary }]} numberOfLines={1}>{item.status}</Text>
            </View>
            {item._id?.toString() !== user?._id?.toString() && (
              <TouchableOpacity
                style={[styles.addBtn, sentIds[item._id] && styles.sentBtn]}
                onPress={() => handleSendRequest(item._id)}
                disabled={!!sentIds[item._id]}
              >
                <Text style={styles.addBtnText}>{sentIds[item._id] ? '✓ Sent' : 'Add'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 54,
    paddingHorizontal: 16, paddingBottom: 12, gap: 12,
    borderBottomWidth: 0.5,
  },
  back: { fontSize: 28, color: '#0084FF', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10,
    borderRadius: 12, paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15 },
  userItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: 0.5,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { backgroundColor: '#0084FF', alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  name: { fontSize: 15, fontWeight: '600' },
  status: { fontSize: 12, marginTop: 2 },
  addBtn: { backgroundColor: '#0084FF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  sentBtn: { backgroundColor: '#8E8E93' },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  sectionHeader: { fontSize: 13, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  empty: { paddingTop: 40, alignItems: 'center' },
  emptyText: { fontSize: 14 },
});
