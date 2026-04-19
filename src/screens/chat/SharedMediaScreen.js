import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, TouchableWithoutFeedback, Dimensions, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { conversationApi } from '../../api/services';
import useChatStore from '../../store/useChatStore';
import { useColors } from '../../store/useThemeStore';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const COLS = 3;
const THUMB = (SCREEN_W - 4) / COLS;

function ImageViewer({ uri, visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.viewerBg}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Image source={{ uri }} style={styles.fullImg} resizeMode="contain" />
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export default function SharedMediaScreen({ route, navigation }) {
  const { conversationId } = route.params;
  const messages = useChatStore((s) => s.messages[conversationId] || []);
  const C = useColors();

  const [loading, setLoading] = useState(false);
  const [allMessages, setAllMessages] = useState(messages);
  const [viewerUri, setViewerUri] = useState(null);

  // Collect all images from loaded messages
  const mediaItems = allMessages
    .filter(m => !m.isDeleted && m.images?.length > 0)
    .flatMap(m => m.images.map(img => ({ url: img.url, createdAt: m.createdAt })))
    .reverse(); // newest first

  // Load all message pages from API to collect every shared image
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      try {
        let page = 1;
        let totalPages = 1;
        const collected = [];
        while (page <= totalPages && page <= 20) {
          const { data } = await conversationApi.getMessages(conversationId, page);
          totalPages = data.totalPages;
          collected.push(...data.messages);
          page++;
          if (cancelled) return;
        }
        // Deduplicate by _id in case of overlap between pages
        const seen = new Set();
        const unique = collected.filter(m => {
          if (seen.has(m._id)) return false;
          seen.add(m._id);
          return true;
        });
        if (!cancelled) setAllMessages(unique);
      } catch (e) {
        console.error('[SharedMedia] fetch error:', e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [conversationId]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      onPress={() => setViewerUri(item.url)}
      style={styles.thumb}
      activeOpacity={0.85}
    >
      <Image source={{ uri: item.url }} style={styles.thumbImg} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient colors={['#0084FF', '#0060CC']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Media</Text>
          {!loading && (
            <Text style={styles.headerSub}>{mediaItems.length} photo{mediaItems.length !== 1 ? 's' : ''}</Text>
          )}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={[styles.centered, { backgroundColor: C.bg }]}>
          <ActivityIndicator color="#0084FF" size="large" />
          <Text style={styles.loadingText}>Loading media...</Text>
        </View>
      ) : mediaItems.length === 0 ? (
        <View style={[styles.centered, { backgroundColor: C.bg }]}>
          <Text style={styles.emptyEmoji}>🖼️</Text>
          <Text style={[styles.emptyTitle, { color: C.text }]}>No photos shared yet</Text>
          <Text style={[styles.emptySub, { color: C.textSecondary }]}>Photos you send and receive will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={mediaItems}
          keyExtractor={(item, i) => item.url + i}
          renderItem={renderItem}
          numColumns={COLS}
          contentContainerStyle={styles.grid}
        />
      )}

      <ImageViewer
        uri={viewerUri}
        visible={!!viewerUri}
        onClose={() => setViewerUri(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingBottom: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  backBtn: { padding: 6 },
  backText: { color: '#FFF', fontSize: 28, fontWeight: '300', lineHeight: 30 },
  headerTitle: { color: '#FFF', fontWeight: '700', fontSize: 17 },
  headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1 },
  grid: { gap: 2 },
  thumb: { width: THUMB, height: THUMB, margin: 1 },
  thumbImg: { width: '100%', height: '100%' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: '#8E8E93', marginTop: 12 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#8E8E93', textAlign: 'center' },
  // Full-screen viewer
  viewerBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeText: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  fullImg: { width: SCREEN_W, height: SCREEN_H * 0.8 },
});
