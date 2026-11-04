import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, TouchableWithoutFeedback, Dimensions, StatusBar, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { conversationApi } from '../../api/services';
import useChatStore from '../../store/useChatStore';
import { useColors } from '../../store/useThemeStore';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ZoomableImage from '../../components/common/ZoomableImage';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const COLS = 3;
const THUMB = (SCREEN_W - 4) / COLS;

function ImageViewer({ uri, visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Modals need their own gesture root on Android for pinch/pan to work */}
      <GestureHandlerRootView style={styles.viewerBg}>
        {uri ? <ZoomableImage uri={uri} width={SCREEN_W} height={SCREEN_H * 0.8} onTap={onClose} /> : null}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>Pinch or double-tap to zoom</Text>
      </GestureHandlerRootView>
    </Modal>
  );
}

// Media cache: kept in memory (instant) AND saved on the phone (survives closing the app), so the
// Media screen opens instantly with the photos already there. Only tiny records are stored
// (message id + image URLs + date), never the images themselves.
// On open we only ask the server for the NEWEST page (new photos live at the front), and do a full
// refresh just once a day.
const mediaCache = {}; // conversationId -> { byId, fetchedAt }
const FULL_REFRESH_MS = 24 * 60 * 60 * 1000;
const PARALLEL_PAGES = 4;
const storageKey = (id) => `shared_media_v1_${id}`;

const onlyImageMessages = (list) => list.filter((m) => !m.isDeleted && m.images?.length > 0);
const slim = (m) => ({ _id: m._id, createdAt: m.createdAt, images: m.images.map((i) => ({ url: i.url })) });

// Shimmering placeholder grid shown while photos load (instead of an empty "no photos" state)
function SkeletonGrid({ dark }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={styles.skelWrap}>
      {Array.from({ length: 21 }).map((_, i) => (
        <Animated.View
          key={i}
          style={[styles.skelBox, { opacity: pulse, backgroundColor: dark ? '#2A2D34' : '#D9DCE1' }]}
        />
      ))}
    </View>
  );
}

export default function SharedMediaScreen({ route, navigation }) {
  const { conversationId } = route.params;
  const storeMessages = useChatStore((s) => s.messages[conversationId]);
  const baseC = useColors();
  const isDark = baseC.bg === '#121212';
  // Same palette as Settings/Profile so the screen follows the chosen light/dark theme
  const C = isDark ? { ...baseC, bg: '#0C0D10', text: '#F2F2F5', textSecondary: '#8E9099' } : baseC;

  const memCached = mediaCache[conversationId];
  const [loading, setLoading] = useState(!memCached);   // nothing to show yet
  const [syncing, setSyncing] = useState(true);          // checking the server in background
  const [fetched, setFetched] = useState(memCached ? memCached.byId : {});
  const [viewerUri, setViewerUri] = useState(null);

  // Photos = cached/fetched + live messages already in the chat store, newest first
  const mediaItems = useMemo(() => {
    const byId = { ...fetched };
    onlyImageMessages(storeMessages || []).forEach((m) => { byId[m._id] = m; });
    return Object.values(byId)
      .filter((m) => !m.isDeleted && m.images?.length > 0)
      .sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))
      .flatMap((m) => m.images.map((img, i) => ({ url: img.url, createdAt: m.createdAt, key: m._id + '_' + i })));
  }, [fetched, storeMessages]);

  useEffect(() => {
    let cancelled = false;

    const persist = (byId, fetchedAt) => {
      mediaCache[conversationId] = { byId, fetchedAt };
      AsyncStorage.setItem(
        storageKey(conversationId),
        JSON.stringify({ fetchedAt, items: Object.values(byId) })
      ).catch(() => {});
    };

    const run = async () => {
      // 1) Show whatever we already have, instantly
      let cache = mediaCache[conversationId];
      if (!cache) {
        try {
          const raw = await AsyncStorage.getItem(storageKey(conversationId));
          if (raw) {
            const parsed = JSON.parse(raw);
            const saved = {};
            (parsed.items || []).forEach((m) => { saved[m._id] = m; });
            cache = { byId: saved, fetchedAt: parsed.fetchedAt || 0 };
            mediaCache[conversationId] = cache;
          }
        } catch (e) {}
        if (cancelled) return;
        if (cache) setFetched(cache.byId);
      }
      if (cache) setLoading(false);

      // 2) Sync with the server in the background
      try {
        const byId = cache ? { ...cache.byId } : {};
        const fullRefresh = !cache || Date.now() - cache.fetchedAt > FULL_REFRESH_MS;
        const addPage = (messages) => {
          (messages || []).forEach((m) => {
            if (m.isDeleted || !(m.images && m.images.length > 0)) delete byId[m._id];
            else byId[m._id] = slim(m);
          });
        };

        const first = await conversationApi.getMessages(conversationId, 1);
        if (cancelled) return;
        addPage(first.data.messages);
        setFetched({ ...byId });
        setLoading(false);

        if (fullRefresh) {
          const totalPages = Math.min(first.data.totalPages || 1, 20);
          for (let start = 2; start <= totalPages; start += PARALLEL_PAGES) {
            const batch = [];
            for (let pg = start; pg < start + PARALLEL_PAGES && pg <= totalPages; pg++) {
              batch.push(conversationApi.getMessages(conversationId, pg).catch(() => null));
            }
            const results = await Promise.all(batch);
            if (cancelled) return;
            results.forEach((r) => { if (r && r.data && r.data.messages) addPage(r.data.messages); });
            setFetched({ ...byId });
          }
          persist(byId, Date.now());
        } else {
          // Quick sync only: keep the old fetchedAt so the daily full refresh still happens
          persist(byId, cache.fetchedAt);
        }
      } catch (e) {
        console.error('[SharedMedia] fetch error:', e.message);
      } finally {
        if (!cancelled) { setLoading(false); setSyncing(false); }
      }
    };
    run();
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
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient colors={['#0084FF', '#0060CC']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Media</Text>
          {!loading && !(syncing && mediaItems.length === 0) && (
            <Text style={styles.headerSub}>{mediaItems.length} photo{mediaItems.length !== 1 ? 's' : ''}</Text>
          )}
        </View>
      </LinearGradient>

      {loading || (syncing && mediaItems.length === 0) ? (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <SkeletonGrid dark={isDark} />
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
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          numColumns={COLS}
          contentContainerStyle={styles.grid}
          initialNumToRender={18}
          windowSize={7}
          removeClippedSubviews
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
  thumbImg: { width: '100%', height: '100%', backgroundColor: 'rgba(150,155,165,0.25)' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  skelWrap: { flexDirection: 'row', flexWrap: 'wrap', padding: 1 },
  skelBox: { width: THUMB - 2, height: THUMB - 2, margin: 1 },
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
  hint: { position: 'absolute', bottom: 40, alignSelf: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  closeText: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  fullImg: { width: SCREEN_W, height: SCREEN_H * 0.8 },
});
