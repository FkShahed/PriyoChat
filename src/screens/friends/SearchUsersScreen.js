import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image,
  TextInput, ActivityIndicator,
} from 'react-native';
import { requestApi, userApi } from '../../api/services';
import useAuthStore from '../../store/useAuthStore';
import { getInitials, COLORS } from '../../utils/helpers';

export default function SearchUsersScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sentIds, setSentIds] = useState({});

  useEffect(() => {
    const fetchSentRequests = async () => {
      try {
        const { data } = await requestApi.getSent();
        const sentMap = {};
        data.forEach(req => {
          if (req.to && req.to._id) sentMap[req.to._id] = true;
        });
        setSentIds(sentMap);
      } catch (e) {
        console.log('[SearchUsers] failed to fetch sent requests', e);
      }
    };
    fetchSentRequests();
  }, []);

  const search = useCallback(async (q) => {
    setLoading(true);
    try {
      const { data } = await userApi.search(q.trim());
      setResults(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const handleSendRequest = async (toId) => {
    try {
      await requestApi.send(toId);
      setSentIds((prev) => ({ ...prev, [toId]: true }));
    } catch (err) {
      // already connected or request exists - ignore
      setSentIds((prev) => ({ ...prev, [toId]: true }));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Find People</Text>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or email"
          placeholderTextColor="#AAA"
          autoFocus
        />
        {loading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 12 }} />}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ paddingTop: 8 }}
        ListHeaderComponent={
          results.length > 0 ? (
            <Text style={styles.sectionHeader}>
              {query.trim() ? 'Search Results' : 'Suggested People'}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          query.length > 0 && !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No users found for "{query}"</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.userItem}>
            {item.avatar ? (
              <Image source={{ uri: item.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.initials}>{getInitials(item.name)}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.status} numberOfLines={1}>{item.status}</Text>
            </View>
            {item._id !== user?._id && (
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
  container: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 54,
    paddingHorizontal: 16, paddingBottom: 12, gap: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#EEEEEE',
  },
  back: { fontSize: 28, color: COLORS.primary, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700', color: '#1C1C1E' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10,
    backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#1C1C1E' },
  userItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F2F2F7',
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  name: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  status: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  addBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7,
  },
  sentBtn: { backgroundColor: '#E0E0E0' },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#8E8E93', paddingHorizontal: 16, paddingBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  empty: { paddingTop: 40, alignItems: 'center' },
  emptyText: { color: '#8E8E93' },
});
