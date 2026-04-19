import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, StatusBar,
} from 'react-native';
import { requestApi } from '../../api/services';
import { getInitials } from '../../utils/helpers';
import useChatStore from '../../store/useChatStore';
import { useColors } from '../../store/useThemeStore';

export default function FriendRequestsScreen({ navigation }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addOrUpdateConversation } = useChatStore();
  const C = useColors();

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
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={C.bg === '#121212' ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <Text style={[styles.title, { color: C.text }]}>Friend Requests</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#0084FF" size="large" />
      ) : requests.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🤝</Text>
          <Text style={[styles.emptyTitle, { color: C.textSecondary }]}>No pending requests</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View style={[styles.item, { borderBottomColor: C.border }]}>
              {item.from?.avatar ? (
                <Image source={{ uri: item.from.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#0084FF', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>{getInitials(item.from?.name)}</Text>
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.name, { color: C.text }]}>{item.from?.name}</Text>
                <Text style={[styles.status, { color: C.textSecondary }]}>{item.from?.status}</Text>
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
  container: { flex: 1 },
  header: {
    paddingTop: 58, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 0.5,
  },
  title: { fontSize: 28, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyEmoji: { fontSize: 64, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  item: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 14, borderBottomWidth: 0.5,
  },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  name: { fontSize: 15, fontWeight: '600' },
  status: { fontSize: 12, marginTop: 2 },
  acceptBtn: {
    backgroundColor: '#0084FF', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7, marginRight: 8,
  },
  acceptText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  rejectBtn: {
    borderWidth: 1.5, borderColor: '#FF3B30', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  rejectText: { color: '#FF3B30', fontWeight: '700', fontSize: 13 },
});
