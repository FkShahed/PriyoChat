import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator,
} from 'react-native';
import { requestApi } from '../../api/services';
import { getInitials, COLORS } from '../../utils/helpers';
import useChatStore from '../../store/useChatStore';

export default function FriendRequestsScreen({ navigation }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addOrUpdateConversation } = useChatStore();

  const load = async () => {
    try {
      const { data } = await requestApi.getPending();
      setRequests(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const accept = async (reqId) => {
    try {
      const { data } = await requestApi.accept(reqId);
      if (data.conversation) addOrUpdateConversation(data.conversation);
      setRequests((prev) => prev.filter((r) => r._id !== reqId));
    } catch (err) {}
  };

  const reject = async (reqId) => {
    try {
      await requestApi.reject(reqId);
      setRequests((prev) => prev.filter((r) => r._id !== reqId));
    } catch (err) {}
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Friend Requests</Text>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} size="large" />
      ) : requests.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🤝</Text>
          <Text style={styles.emptyTitle}>No pending requests</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View style={styles.item}>
              {item.from?.avatar ? (
                <Image source={{ uri: item.from.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>{getInitials(item.from?.name)}</Text>
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name}>{item.from?.name}</Text>
                <Text style={styles.status}>{item.from?.status}</Text>
              </View>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => accept(item._id)}>
                <Text style={styles.acceptText}>✓ Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rejectBtn} onPress={() => reject(item._id)}>
                <Text style={styles.rejectText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyEmoji: { fontSize: 64, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#8E8E93' },
  item: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#F2F2F7',
  },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  name: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  status: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  acceptBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7, marginRight: 8,
  },
  acceptText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  rejectBtn: {
    borderWidth: 1.5, borderColor: '#FF3B30', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  rejectText: { color: '#FF3B30', fontWeight: '700', fontSize: 13 },
});
