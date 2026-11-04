import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, RefreshControl, Modal, Animated, Easing,
  StatusBar, Linking, Share, useWindowDimensions, BackHandler, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import useTabBarStore from '../../store/useTabBarStore';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useAuthStore from '../../store/useAuthStore';
import useChatStore from '../../store/useChatStore';
import useSocketStore from '../../store/useSocketStore';
import useThemeStore, { useColors } from '../../store/useThemeStore';
import { feedApi } from '../../api/services';
import Avatar from '../../components/common/Avatar';
import ArticleReader from '../../components/common/ArticleReader';
import { FEED_CATEGORIES, CATEGORY_BY_ID, FEED_CITIES, DEFAULT_PREFS, timeAgo } from '../../constants/feedConfig';
import { buildShareText } from '../../utils/feedShare';

const PREFS_KEY = 'feed_prefs_v1';
const CACHE_KEY = 'feed_cache_v1';
const READ_KEY = 'feed_read_v1';
const STREAK_KEY = 'feed_streak_v1';
const SHOWN_KEY = 'feed_shown_v1';

const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
};

const to12h = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h)) return hhmm;
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
};

// Next prayer from the day's timings (device local time)
function nextPrayer(prayer) {
  if (!prayer) return null;
  const order = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const name of order) {
    const [h, m] = String(prayer[name]).split(':').map((x) => parseInt(x, 10));
    if (h * 60 + m > mins) return { name, time: prayer[name], inMin: h * 60 + m - mins };
  }
  const [h, m] = String(prayer.Fajr).split(':').map((x) => parseInt(x, 10));
  return { name: 'Fajr', time: prayer.Fajr, inMin: 24 * 60 - mins + h * 60 + m, tomorrow: true };
}

const fmtIn = (min) => (min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)}h ${min % 60}m`);

// ── Small building blocks ───────────────────────────────────────────────
function Skeleton({ style, dark }) {
  const a = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.45, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={[{ backgroundColor: dark ? '#262A33' : '#E4E7EE', borderRadius: 14, opacity: a }, style]} />;
}

function CategoryChip({ cat, small }) {
  if (!cat) return null;
  return (
    <LinearGradient colors={cat.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.catChip, small && { paddingVertical: 3 }]}>
      <Ionicons name={cat.icon} size={11} color="#FFF" />
      <Text style={styles.catChipText}>{cat.label}</Text>
    </LinearGradient>
  );
}

function BottomSheet({ visible, onClose, dark, children, maxHeight }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [show, setShow] = useState(visible);
  useEffect(() => {
    if (visible) {
      setShow(true);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (show) {
      Animated.timing(anim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setShow(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal visible={show} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.55)', opacity: anim }]}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet, { backgroundColor: dark ? '#16181D' : '#FFFFFF', maxHeight: maxHeight || '88%' },
            { transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [500, 0] }) }] },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────
export default function FeedScreen({ navigation }) {
  const C = useColors();
  const resolved = useThemeStore((s) => s.resolvedTheme);
  const dark = resolved === 'dark';
  const { width: winW } = useWindowDimensions();
  const user = useAuthStore((s) => s.user);
  const conversations = useChatStore((s) => s.conversations);

  const P = useMemo(() => ({
    bg: dark ? '#0C0D10' : '#F4F6FB',
    card: dark ? '#16181D' : '#FFFFFF',
    cardAlt: dark ? '#20232A' : '#EEF1F8',
    text: dark ? '#F2F2F5' : '#14171F',
    sub: dark ? '#8E9099' : '#6B7280',
    border: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)',
    accent: '#7C3AED',
  }), [dark]);

  const [prefs, setPrefs] = useState(null); // null until loaded
  const [articles, setArticles] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const scrollRef = useRef(null);
  const pageRef = useRef(1);
  const freshRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const shownRef = useRef([]); // ids of stories already shown (newest last), used so refresh brings unseen ones
  const paramsRef = useRef({ seed: 0, exclude: [] }); // seed + exclude of the current refresh, reused for every page
  const showTopRef = useRef(false);
  const hasMoreRef = useRef(false);
  const loadMoreRef = useRef(() => {});
  const topAnim = useRef(new Animated.Value(0)).current;
  const tabHidden = useTabBarStore((st) => st.hidden);
  const fabShift = useRef(new Animated.Value(0)).current;
  const [widgets, setWidgets] = useState(null);
  const [error, setError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [readIds, setReadIds] = useState({});
  const [streak, setStreak] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_PREFS);
  const [shareItem, setShareItem] = useState(null);
  const [reader, setReader] = useState(null); // story open in the in-app reader
  const [toast, setToast] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;
  const lastY = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Back goes to Settings (Feed is a tab-level screen) and the tab bar always returns when leaving
  useFocusEffect(useCallback(() => {
    useTabBarStore.getState().setHidden(false);
    lastY.current = 0;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { navigation.navigate('Settings'); return true; });
    return () => { sub.remove(); useTabBarStore.getState().setHidden(false); };
  }, [navigation]));

  // Scroll down -> slide the bottom bar away; scroll up -> bring it back
  const onScroll = useCallback((e) => {
    const y = e.nativeEvent.contentOffset.y;
    const max = e.nativeEvent.contentSize.height - e.nativeEvent.layoutMeasurement.height;
    if (y < 0 || y > max) return; // ignore overscroll bounce
    const dy = y - lastY.current;
    if (y < 24) useTabBarStore.getState().setHidden(false);
    else if (dy > 8) useTabBarStore.getState().setHidden(true);
    else if (dy < -8) useTabBarStore.getState().setHidden(false);
    lastY.current = y;

    // go-to-top button appears after a few screens of scrolling
    const wantTop = y > 900;
    if (wantTop !== showTopRef.current) {
      showTopRef.current = wantTop;
      setShowTop(wantTop);
      Animated.timing(topAnim, { toValue: wantTop ? 1 : 0, duration: 200, useNativeDriver: true }).start();
    }

    // near the end of the list: auto-load the next batch
    const distanceFromEnd = e.nativeEvent.contentSize.height - (y + e.nativeEvent.layoutMeasurement.height);
    if (distanceFromEnd < 700) loadMoreRef.current();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── load saved prefs / cache / streak ─────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [p, c, r, s] = await Promise.all([
          AsyncStorage.getItem(PREFS_KEY), AsyncStorage.getItem(CACHE_KEY),
          AsyncStorage.getItem(READ_KEY), AsyncStorage.getItem(STREAK_KEY),
        ]);
        const loaded = p ? { ...DEFAULT_PREFS, ...JSON.parse(p) } : DEFAULT_PREFS;
        if (!alive.current) return;
        setPrefs(loaded);
        setDraft(loaded);
        if (!loaded.onboarded) setShowPicker(true);
        if (c) {
          const cached = JSON.parse(c);
          if (cached?.articles?.length) setArticles(cached.articles);
          if (cached?.widgets) setWidgets(cached.widgets);
        }
        if (r) setReadIds(JSON.parse(r));
        try { const sh = await AsyncStorage.getItem(SHOWN_KEY); if (sh) shownRef.current = JSON.parse(sh); } catch { /* ignore */ }

        // daily streak
        const today = dayKey();
        let st = s ? JSON.parse(s) : { last: null, count: 0 };
        if (st.last !== today) {
          const y = new Date(); y.setDate(y.getDate() - 1);
          st = { last: today, count: st.last === dayKey(y) ? st.count + 1 : 1 };
          AsyncStorage.setItem(STREAK_KEY, JSON.stringify(st)).catch(() => {});
        }
        setStreak(st.count);
      } catch {
        if (alive.current) { setPrefs(DEFAULT_PREFS); setDraft(DEFAULT_PREFS); }
      }
    })();
  }, []);

  const city = useMemo(() => FEED_CITIES.find((c) => c.name === prefs?.city) || FEED_CITIES[0], [prefs?.city]);

  const loadFeed = useCallback(async (p, { silent, refresh } = {}) => {
    if (!p) return false;
    if (!silent) setError(false);
    try {
      const [a, w] = await Promise.all([
        feedApi.getArticles(p.interests, p.lang, 1, !!refresh, paramsRef.current.seed, paramsRef.current.exclude),
        feedApi.getWidgets(FEED_CITIES.find((c) => c.name === p.city)?.lat, FEED_CITIES.find((c) => c.name === p.city)?.lng).catch(() => ({ data: null })),
      ]);
      if (!alive.current) return false;
      const list = a.data?.articles || [];
      freshRef.current = a.data?.freshCount ?? list.length;
      // remember what has been shown so the next refresh can prefer different stories
      shownRef.current = [...shownRef.current.filter((id) => !list.some((x) => x.id === id)), ...list.map((x) => x.id)].slice(-200);
      AsyncStorage.setItem(SHOWN_KEY, JSON.stringify(shownRef.current)).catch(() => {});
      pageRef.current = 1;
      hasMoreRef.current = !!a.data?.hasMore;
      setHasMore(!!a.data?.hasMore);
      setArticles(list);
      setWidgets(w.data || null);
      setOffline(false);
      setError(false);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ articles: list, widgets: w.data || null })).catch(() => {});
      return list;
    } catch {
      if (!alive.current) return false;
      setOffline(true);
      setArticles((cur) => { if (!cur) setError(true); return cur; });
      return false;
    }
  }, []);

  // Auto-load the next batch (24 stories) when the user reaches the end
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || !prefs?.onboarded) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const next = pageRef.current + 1;
      const { data } = await feedApi.getArticles(prefs.interests, prefs.lang, next, false, paramsRef.current.seed, paramsRef.current.exclude);
      if (!alive.current) return;
      pageRef.current = next;
      hasMoreRef.current = !!data?.hasMore;
      setHasMore(!!data?.hasMore);
      shownRef.current = [...shownRef.current, ...(data?.articles || []).map((x) => x.id)].slice(-200);
      AsyncStorage.setItem(SHOWN_KEY, JSON.stringify(shownRef.current)).catch(() => {});
      setArticles((cur) => {
        const seen = new Set((cur || []).map((x) => x.id));
        return [...(cur || []), ...(data?.articles || []).filter((x) => !seen.has(x.id))];
      });
    } catch {
      // keep what we have; reaching the end again retries
    } finally {
      loadingMoreRef.current = false;
      if (alive.current) setLoadingMore(false);
    }
  }, [prefs]);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  useEffect(() => { if (prefs?.onboarded) loadFeed(prefs, { silent: true }); }, [prefs, loadFeed]);

  const onRefresh = async () => {
    setRefreshing(true);
    // New seed + the stories already shown: the server puts unseen stories first and mixes the order
    paramsRef.current = { seed: Date.now() % 2147483647, exclude: shownRef.current.slice(-150) };
    const list = await loadFeed(prefs, { silent: true, refresh: true });
    if (alive.current) {
      setRefreshing(false);
      if (list) {
        const n = freshRef.current;
        showToast(n > 0 ? 'Fresh stories loaded for you' : 'Showing a new mix of stories');
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
    }
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    useTabBarStore.getState().setHidden(false);
  };

  // keep the go-to-top button clear of the bottom bar: it slides down when the bar hides
  useEffect(() => {
    Animated.timing(fabShift, { toValue: tabHidden ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [tabHidden, fabShift]);

  // ── prefs ─────────────────────────────────────────────────────────────
  const openPicker = () => { setDraft(prefs || DEFAULT_PREFS); setShowPicker(true); };
  const toggleInterest = (id) => setDraft((d) => {
    const has = d.interests.includes(id);
    if (has && d.interests.length === 1) return d; // keep at least one
    return { ...d, interests: has ? d.interests.filter((x) => x !== id) : [...d.interests, id] };
  });
  const savePrefs = async () => {
    const next = { ...draft, onboarded: true };
    setPrefs(next);
    setShowPicker(false);
    setArticles((cur) => cur); // keep showing the old list until the new one arrives
    try { await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  // ── actions ───────────────────────────────────────────────────────────
  const markRead = (id) => {
    setReadIds((cur) => {
      if (cur[id]) return cur;
      const next = { ...cur, [id]: 1 };
      const keys = Object.keys(next);
      if (keys.length > 300) delete next[keys[0]];
      AsyncStorage.setItem(READ_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };
  const openArticle = (a) => {
    markRead(a.id);
    setReader({ url: a.url, title: a.title, source: a.source });
  };

  const showToast = (msg) => {
    setToast(msg);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  };

  const sendToChat = (conv) => {
    const a = shareItem;
    if (!a) return;
    const text = buildShareText(a, CATEGORY_BY_ID[a.category]?.label);
    const conversationId = conv._id;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    useChatStore.getState().addMessage(conversationId, {
      _id: tempId, conversation: conversationId, sender: user, text, images: [], status: 'sending', createdAt: new Date().toISOString(),
    });
    useSocketStore.getState().emit('send_message', { conversationId, text, images: [], replyTo: null }, (res) => {
      if (res?.error) useChatStore.getState().updateMessageStatus(conversationId, tempId, 'failed');
      else if (res?.message) useChatStore.getState().replaceOptimisticMessage(conversationId, tempId, res.message);
    });
    const other = conv.participants?.find((p) => p?._id?.toString() !== user?._id?.toString());
    setShareItem(null);
    showToast(`Sent to ${other?.name || 'chat'}`);
  };

  const shareExternal = async (a) => {
    try { await Share.share({ message: `${a.title}\n${a.url}` }); } catch { /* ignore */ }
  };

  // ── render pieces ─────────────────────────────────────────────────────
  const firstName = (user?.name || '').split(' ')[0];
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const headerGrad = dark ? ['#2A2650', '#16141F'] : ['#5B4BE8', '#8B5CF6'];

  const renderHeader = () => (
    <LinearGradient colors={headerGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
      <View style={styles.orb} />
      <View style={styles.orb2} />
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('Settings')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
          <Text style={styles.headerTitle}>Feed</Text>
          <View style={styles.betaPill}><Text style={styles.betaText}>BETA</Text></View>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={openPicker} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="options" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
      <Text style={styles.hello} numberOfLines={1}>{greeting()}{firstName ? `, ${firstName}` : ''} 👋</Text>
      <View style={styles.dateRow}>
        <Text style={styles.dateText}>{dateStr}</Text>
        {streak > 1 ? (
          <View style={styles.streakPill}>
            <Ionicons name="flame" size={13} color="#FFB020" />
            <Text style={styles.streakText}>{streak}-day streak</Text>
          </View>
        ) : null}
      </View>
    </LinearGradient>
  );

  // Widgets ---------------------------------------------------------------
  const widgetCards = [];
  if (widgets?.weather) {
    const w = widgets.weather;
    widgetCards.push(
      <LinearGradient key="weather" colors={w.isDay ? ['#38A3F5', '#2563EB'] : ['#1E2A5A', '#0F172A']} style={styles.widget} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.widgetTop}>
          <Text style={styles.widgetLabel}>{city.name}</Text>
          <Ionicons name={w.isDay ? w.icon : (w.icon === 'sunny' ? 'moon' : w.icon)} size={22} color="#FFF" />
        </View>
        <Text style={styles.bigTemp}>{w.temp}°</Text>
        <Text style={styles.widgetSub}>{w.text}</Text>
        <Text style={styles.widgetFoot}>H {w.max}°  ·  L {w.min}°  ·  Feels {w.feels}°</Text>
      </LinearGradient>
    );
  }
  if (widgets?.prayer) {
    const np = nextPrayer(widgets.prayer);
    widgetCards.push(
      <LinearGradient key="prayer" colors={['#0F9D78', '#047857']} style={styles.widget} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.widgetTop}>
          <Text style={styles.widgetLabel}>Next prayer</Text>
          <Ionicons name="moon" size={20} color="#FFF" />
        </View>
        <Text style={styles.prayerName}>{np?.name}{np?.tomorrow ? ' (tomorrow)' : ''}</Text>
        <Text style={styles.prayerTime}>{np ? to12h(np.time) : ''}</Text>
        <Text style={styles.widgetFoot}>{np ? fmtIn(np.inMin) : ''}{widgets.prayer.hijri ? `  ·  ${widgets.prayer.hijri}` : ''}</Text>
      </LinearGradient>
    );
  }
  if (widgets?.rates?.usdBdt) {
    const r = widgets.rates;
    widgetCards.push(
      <View key="rates" style={[styles.widget, { backgroundColor: P.card, borderWidth: 1, borderColor: P.border }]}>
        <View style={styles.widgetTop}>
          <Text style={[styles.widgetLabel, { color: P.sub }]}>Taka rate</Text>
          <View style={[styles.miniIcon, { backgroundColor: '#F59E0B22' }]}><Ionicons name="cash" size={15} color="#F59E0B" /></View>
        </View>
        {[['USD', r.usdBdt], ['EUR', r.eurBdt], ['GBP', r.gbpBdt]].filter(([, v]) => v).map(([k, v]) => (
          <View key={k} style={styles.rateRow}>
            <Text style={[styles.rateK, { color: P.sub }]}>1 {k}</Text>
            <Text style={[styles.rateV, { color: P.text }]}>৳ {v}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (widgets?.crypto?.btc?.price) {
    const c = widgets.crypto;
    const row = (label, d) => d?.price ? (
      <View key={label} style={styles.rateRow}>
        <Text style={[styles.rateK, { color: P.sub }]}>{label}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.rateV, { color: P.text }]}>${Math.round(d.price).toLocaleString()}</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: d.change >= 0 ? '#10B981' : '#EF4444' }}>
            {d.change >= 0 ? '▲' : '▼'} {Math.abs(d.change || 0).toFixed(1)}%
          </Text>
        </View>
      </View>
    ) : null;
    widgetCards.push(
      <View key="crypto" style={[styles.widget, { backgroundColor: P.card, borderWidth: 1, borderColor: P.border }]}>
        <View style={styles.widgetTop}>
          <Text style={[styles.widgetLabel, { color: P.sub }]}>Crypto</Text>
          <View style={[styles.miniIcon, { backgroundColor: '#F7931A22' }]}><Ionicons name="logo-bitcoin" size={16} color="#F7931A" /></View>
        </View>
        {row('BTC', c.btc)}
        {row('ETH', c.eth)}
      </View>
    );
  }
  if (widgets?.space?.image) {
    const s = widgets.space;
    widgetCards.push(
      <TouchableOpacity key="space" activeOpacity={0.9} style={[styles.widget, { padding: 0, overflow: 'hidden' }]} onPress={() => setReader({ url: s.url, title: s.title, source: 'NASA' })}>
        <Image source={{ uri: s.image }} style={StyleSheet.absoluteFillObject} />
        <LinearGradient colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFillObject} />
        <View style={{ flex: 1, justifyContent: 'space-between', padding: 14 }}>
          <View style={styles.widgetTop}><Text style={styles.widgetLabel}>Space today</Text><Ionicons name="planet" size={20} color="#FFF" /></View>
          <View>
            <Text style={styles.spaceTitle} numberOfLines={2}>{s.title}</Text>
            <Text style={styles.widgetFoot}>© {s.credit}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }
  if (widgets?.onThisDay) {
    const o = widgets.onThisDay;
    widgetCards.push(
      <TouchableOpacity key="otd" activeOpacity={o.url ? 0.85 : 1} style={[styles.widget, styles.widgetWide, { backgroundColor: P.card, borderWidth: 1, borderColor: P.border }]} onPress={() => o.url && setReader({ url: o.url, title: 'On this day', source: 'Wikipedia' })}>
        <View style={styles.widgetTop}>
          <Text style={[styles.widgetLabel, { color: P.sub }]}>On this day · {o.year}</Text>
          <View style={[styles.miniIcon, { backgroundColor: '#7C3AED22' }]}><Ionicons name="time" size={15} color="#7C3AED" /></View>
        </View>
        <Text style={[styles.otdText, { color: P.text }]} numberOfLines={5}>{o.text}</Text>
      </TouchableOpacity>
    );
  }

  const renderWidgets = () => (widgetCards.length ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.widgetRow} decelerationRate="fast" snapToInterval={172}>
      {widgetCards}
    </ScrollView>
  ) : null);

  // Cards -----------------------------------------------------------------
  const ShareBtn = ({ a }) => (
    <TouchableOpacity onPress={() => setShareItem(a)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={[styles.shareBtn, { backgroundColor: P.cardAlt }]}>
      <Ionicons name="paper-plane" size={14} color={P.accent} />
    </TouchableOpacity>
  );

  const renderHero = (a) => {
    const cat = CATEGORY_BY_ID[a.category];
    const read = !!readIds[a.id];
    const h = Math.min(260, (winW - 32) * 0.72);
    return (
      <TouchableOpacity key={a.id} activeOpacity={0.92} onPress={() => openArticle(a)} style={[styles.hero, { height: h, backgroundColor: P.card }]}>
        {a.image ? <Image source={{ uri: a.image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" /> : (
          <LinearGradient colors={cat?.colors || ['#6366F1', '#4F46E5']} style={StyleSheet.absoluteFillObject} />
        )}
        <LinearGradient colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.85)']} locations={[0.15, 0.5, 1]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.heroTop}>
          <CategoryChip cat={cat} />
          <TouchableOpacity onPress={() => setShareItem(a)} style={styles.heroShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="paper-plane" size={15} color="#FFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.heroBottom}>
          <Text style={[styles.heroTitle, read && { opacity: 0.7 }]} numberOfLines={3}>{a.title}</Text>
          <Text style={styles.heroMeta} numberOfLines={1}>{a.source} · {timeAgo(a.publishedAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCard = (a) => {
    const cat = CATEGORY_BY_ID[a.category];
    const read = !!readIds[a.id];
    return (
      <TouchableOpacity key={a.id} activeOpacity={0.85} onPress={() => openArticle(a)} style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <View style={styles.cardTopRow}>
            <CategoryChip cat={cat} small />
            <Text style={[styles.cardTime, { color: P.sub }]}>{timeAgo(a.publishedAt)}</Text>
          </View>
          <Text style={[styles.cardTitle, { color: read ? P.sub : P.text }]} numberOfLines={3}>{a.title}</Text>
          {a.summary ? <Text style={[styles.cardSummary, { color: P.sub }]} numberOfLines={2}>{a.summary}</Text> : null}
          <View style={styles.cardFoot}>
            <Text style={[styles.cardSource, { color: P.sub }]} numberOfLines={1}>{a.source}</Text>
            <ShareBtn a={a} />
          </View>
        </View>
        {a.image ? (
          <Image source={{ uri: a.image }} style={[styles.thumb, { backgroundColor: P.cardAlt }]} resizeMode="cover" />
        ) : (
          <LinearGradient colors={cat?.colors || ['#6366F1', '#4F46E5']} style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name={cat?.icon || 'newspaper'} size={30} color="rgba(255,255,255,0.9)" />
          </LinearGradient>
        )}
      </TouchableOpacity>
    );
  };

  const renderSkeleton = () => (
    <View style={{ paddingHorizontal: 16 }}>
      <Skeleton dark={dark} style={{ height: 190, borderRadius: 22, marginBottom: 14 }} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Skeleton dark={dark} style={{ height: 14, width: 80, marginBottom: 10 }} />
            <Skeleton dark={dark} style={{ height: 16, marginBottom: 8 }} />
            <Skeleton dark={dark} style={{ height: 16, width: '70%' }} />
          </View>
          <Skeleton dark={dark} style={{ width: 92, height: 92, borderRadius: 16 }} />
        </View>
      ))}
    </View>
  );

  const hero = articles?.find((a) => a.image) || articles?.[0];
  const rest = articles ? articles.filter((a) => a !== hero) : [];

  const showSkeleton = prefs && prefs.onboarded && !articles && !error;

  // ── sheets ────────────────────────────────────────────────────────────
  const renderPicker = () => (
    <BottomSheet visible={showPicker} dark={dark} onClose={() => { if (prefs?.onboarded) setShowPicker(false); }} maxHeight="92%">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
        <View style={styles.pickerHead}>
          <LinearGradient colors={['#7C3AED', '#5B4BE8']} style={styles.pickerIcon}>
            <Ionicons name="sparkles" size={22} color="#FFF" />
          </LinearGradient>
          <Text style={[styles.pickerTitle, { color: P.text }]}>{prefs?.onboarded ? 'Your interests' : 'Make your feed yours'}</Text>
          <Text style={[styles.pickerSub, { color: P.sub }]}>Pick what you like. We'll build a short daily read for you.</Text>
        </View>

        <Text style={[styles.pickerLabel, { color: P.sub }]}>TOPICS</Text>
        <View style={styles.chipWrap}>
          {FEED_CATEGORIES.map((c) => {
            const on = draft.interests.includes(c.id);
            return (
              <TouchableOpacity key={c.id} activeOpacity={0.8} onPress={() => toggleInterest(c.id)} style={{ marginRight: 8, marginBottom: 8 }}>
                {on ? (
                  <LinearGradient colors={c.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.interestChip}>
                    <Ionicons name={c.icon} size={15} color="#FFF" />
                    <Text style={[styles.interestText, { color: '#FFF' }]}>{c.label}</Text>
                    <Ionicons name="checkmark" size={14} color="#FFF" />
                  </LinearGradient>
                ) : (
                  <View style={[styles.interestChip, { backgroundColor: P.cardAlt }]}>
                    <Ionicons name={c.icon} size={15} color={P.sub} />
                    <Text style={[styles.interestText, { color: P.text }]}>{c.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.pickerLabel, { color: P.sub }]}>LANGUAGE</Text>
        <View style={[styles.segment, { backgroundColor: P.cardAlt }]}>
          {[['bn', 'বাংলা'], ['en', 'English'], ['both', 'Both']].map(([k, label]) => {
            const on = draft.lang === k;
            return (
              <TouchableOpacity key={k} style={[styles.segItem, on && { backgroundColor: P.accent }]} activeOpacity={0.85} onPress={() => setDraft((d) => ({ ...d, lang: k }))}>
                <Text style={[styles.segText, { color: on ? '#FFF' : P.sub }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {draft.lang === 'bn' ? <Text style={[styles.hint, { color: P.sub }]}>Bangla stories are available for Bangladesh and World. Other topics show in English.</Text> : null}

        <Text style={[styles.pickerLabel, { color: P.sub }]}>YOUR CITY (WEATHER & PRAYER TIMES)</Text>
        <View style={styles.chipWrap}>
          {FEED_CITIES.map((c) => {
            const on = draft.city === c.name;
            return (
              <TouchableOpacity key={c.name} activeOpacity={0.8} onPress={() => setDraft((d) => ({ ...d, city: c.name }))}
                style={[styles.cityChip, { backgroundColor: on ? P.accent : P.cardAlt }]}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#FFF' : P.text }}>{c.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <TouchableOpacity activeOpacity={0.85} onPress={savePrefs} style={{ marginTop: 10 }}>
        <LinearGradient colors={['#7C3AED', '#5B4BE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtn}>
          <Text style={styles.saveText}>{prefs?.onboarded ? 'Save' : 'Show my feed'}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </BottomSheet>
  );

  const shareChats = useMemo(() => (conversations || [])
    .map((c) => ({ c, other: c.participants?.find((p) => p?._id?.toString() !== user?._id?.toString()) }))
    .filter((x) => x.other && !x.c.isArchived), [conversations, user?._id]);

  const renderShare = () => (
    <BottomSheet visible={!!shareItem} dark={dark} onClose={() => setShareItem(null)} maxHeight="78%">
      {shareItem ? (
        <>
          <View style={[styles.sharePreview, { backgroundColor: P.cardAlt }]}>
            <LinearGradient colors={CATEGORY_BY_ID[shareItem.category]?.colors || ['#6366F1', '#4F46E5']} style={styles.sharePreviewIcon}>
              <Ionicons name={CATEGORY_BY_ID[shareItem.category]?.icon || 'newspaper'} size={18} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sharePreviewTitle, { color: P.text }]} numberOfLines={2}>{shareItem.title}</Text>
              <Text style={{ fontSize: 12, color: P.sub, marginTop: 2 }} numberOfLines={1}>{shareItem.source}</Text>
            </View>
          </View>
          <Text style={[styles.pickerLabel, { color: P.sub, marginTop: 14 }]}>SEND TO</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
            {shareChats.length === 0 ? (
              <Text style={{ color: P.sub, textAlign: 'center', paddingVertical: 24 }}>No chats yet. Start a conversation first.</Text>
            ) : shareChats.map(({ c, other }) => (
              <TouchableOpacity key={c._id} activeOpacity={0.7} onPress={() => sendToChat(c)} style={styles.shareRow}>
                <Avatar uri={other.avatar} style={styles.shareAvatar} />
                <Text style={[styles.shareName, { color: P.text }]} numberOfLines={1}>{other.name}</Text>
                <LinearGradient colors={['#7C3AED', '#5B4BE8']} style={styles.sendPill}>
                  <Ionicons name="paper-plane" size={13} color="#FFF" />
                  <Text style={styles.sendPillText}>Send</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { const a = shareItem; setShareItem(null); setTimeout(() => shareExternal(a), 250); }} style={[styles.moreBtn, { borderColor: P.border }]}>
            <Ionicons name="share-outline" size={17} color={P.accent} />
            <Text style={{ color: P.accent, fontWeight: '700', marginLeft: 6 }}>More apps…</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </BottomSheet>
  );

  // ── page ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: P.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.accent} colors={[P.accent]} progressViewOffset={40} />}
      >
        {renderHeader()}

        {offline && articles ? (
          <View style={[styles.offlineBar, { backgroundColor: dark ? '#2A2113' : '#FFF6E0' }]}>
            <Ionicons name="cloud-offline" size={14} color="#D97706" />
            <Text style={styles.offlineText}>You're offline — showing your last update</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 16 }}>{renderWidgets()}</View>

        {showSkeleton ? <View style={{ marginTop: 18 }}>{renderSkeleton()}</View> : null}

        {error && !articles ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: P.cardAlt }]}><Ionicons name="cloud-offline" size={34} color={P.sub} /></View>
            <Text style={[styles.emptyTitle, { color: P.text }]}>Couldn't load your feed</Text>
            <Text style={[styles.emptySub, { color: P.sub }]}>Check your connection and try again.</Text>
            <TouchableOpacity activeOpacity={0.85} onPress={() => { setError(false); setArticles(null); loadFeed(prefs); }}>
              <LinearGradient colors={['#7C3AED', '#5B4BE8']} style={styles.retryBtn}><Ionicons name="refresh" size={16} color="#FFF" /><Text style={styles.retryText}>Try again</Text></LinearGradient>
            </TouchableOpacity>
          </View>
        ) : null}

        {articles && articles.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: P.cardAlt }]}><Ionicons name="newspaper" size={34} color={P.sub} /></View>
            <Text style={[styles.emptyTitle, { color: P.text }]}>Nothing new right now</Text>
            <Text style={[styles.emptySub, { color: P.sub }]}>Try adding more topics or pull down to refresh.</Text>
          </View>
        ) : null}

        {articles && articles.length > 0 ? (
          <View style={{ marginTop: 22 }}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: P.text }]}>Today for you</Text>
              <Text style={[styles.sectionCount, { color: P.sub }]}>{articles.length} stories</Text>
            </View>
            <View style={{ paddingHorizontal: 16 }}>
              {hero ? renderHero(hero) : null}
              {rest.map(renderCard)}
            </View>

            {hasMore ? (
              <View style={styles.moreWrap}>
                <ActivityIndicator color={P.accent} />
                <Text style={[styles.moreText, { color: P.sub }]}>{loadingMore ? 'Loading more stories…' : 'Keep scrolling for more'}</Text>
              </View>
            ) : (
            <View style={styles.endWrap}>
              <LinearGradient colors={['#34D399', '#10B981']} style={styles.endIcon}>
                <Ionicons name="checkmark" size={30} color="#FFF" />
              </LinearGradient>
              <Text style={[styles.endTitle, { color: P.text }]}>You're all caught up</Text>
              <Text style={[styles.endSub, { color: P.sub }]}>That's everything for now. Fresh stories arrive through the day — pull down to refresh.</Text>
              <TouchableOpacity activeOpacity={0.8} onPress={openPicker} style={[styles.editBtn, { backgroundColor: P.cardAlt }]}>
                <Ionicons name="options" size={15} color={P.accent} />
                <Text style={{ color: P.accent, fontWeight: '700', marginLeft: 6 }}>Edit my interests</Text>
              </TouchableOpacity>
              <Text style={[styles.credit, { color: P.sub }]}>Headlines from their original publishers. Tap a story to read it at the source.</Text>
            </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* Go to top */}
      <Animated.View
        pointerEvents={showTop ? 'auto' : 'none'}
        style={[
          styles.fab,
          { opacity: topAnim, transform: [{ scale: topAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }, { translateY: fabShift.interpolate({ inputRange: [0, 1], outputRange: [0, 72] }) }] },
        ]}
      >
        <TouchableOpacity activeOpacity={0.85} onPress={scrollToTop}>
          <LinearGradient colors={['#7C3AED', '#5B4BE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabInner}>
            <Ionicons name="arrow-up" size={22} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {renderPicker()}
      {renderShare()}
      <ArticleReader data={reader} onClose={() => setReader(null)} />

      <Animated.View pointerEvents="none" style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
        <Ionicons name="checkmark-circle" size={16} color="#34D399" />
        <Text style={styles.toastText}>{toast}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { paddingTop: 52, paddingHorizontal: 18, paddingBottom: 22, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden' },
  orb: { position: 'absolute', top: -90, right: -60, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(255,255,255,0.09)' },
  orb2: { position: 'absolute', bottom: -70, left: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.06)' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFF', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  betaPill: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.14)' },
  betaText: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  hello: { color: '#FFF', fontSize: 20, fontWeight: '700', marginTop: 18 },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dateText: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  streakPill: { flexDirection: 'row', alignItems: 'center', marginLeft: 10, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.22)' },
  streakText: { color: '#FFF', fontSize: 11.5, fontWeight: '700', marginLeft: 4 },

  offlineBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 14, paddingVertical: 8, borderRadius: 12 },
  offlineText: { color: '#B45309', fontSize: 12.5, fontWeight: '600', marginLeft: 6 },

  widgetRow: { paddingHorizontal: 16 },
  widget: { width: 160, height: 150, borderRadius: 22, padding: 14, marginRight: 12 },
  widgetWide: { width: 250 },
  widgetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  widgetLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  miniIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  bigTemp: { color: '#FFF', fontSize: 44, fontWeight: '300', marginTop: 6, letterSpacing: -2 },
  widgetSub: { color: '#FFF', fontSize: 14, fontWeight: '600', marginTop: -2 },
  widgetFoot: { color: 'rgba(255,255,255,0.78)', fontSize: 11, marginTop: 6 },
  prayerName: { color: '#FFF', fontSize: 22, fontWeight: '800', marginTop: 12 },
  prayerTime: { color: '#FFF', fontSize: 26, fontWeight: '300', marginTop: 0 },
  rateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 },
  rateK: { fontSize: 12.5, fontWeight: '600' },
  rateV: { fontSize: 15, fontWeight: '800' },
  spaceTitle: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  otdText: { fontSize: 13, lineHeight: 19, marginTop: 10, fontWeight: '500' },

  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  sectionCount: { fontSize: 12.5, fontWeight: '600' },

  catChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  catChipText: { color: '#FFF', fontSize: 10.5, fontWeight: '800', marginLeft: 4, letterSpacing: 0.3 },

  hero: { borderRadius: 24, overflow: 'hidden', marginBottom: 14, justifyContent: 'space-between' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  heroShare: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  heroBottom: { padding: 16 },
  heroTitle: { color: '#FFF', fontSize: 21, fontWeight: '800', lineHeight: 27, letterSpacing: -0.3 },
  heroMeta: { color: 'rgba(255,255,255,0.8)', fontSize: 12.5, marginTop: 8, fontWeight: '600' },

  card: { flexDirection: 'row', alignItems: 'stretch', borderRadius: 20, borderWidth: 1, padding: 12, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  cardTime: { fontSize: 11.5, fontWeight: '600' },
  cardTitle: { fontSize: 15.5, fontWeight: '700', lineHeight: 21 },
  cardSummary: { fontSize: 12.5, lineHeight: 17, marginTop: 5 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  cardSource: { fontSize: 12, fontWeight: '600', flex: 1, marginRight: 8 },
  shareBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 92, height: 92, borderRadius: 16, alignSelf: 'center' },

  moreWrap: { alignItems: 'center', paddingVertical: 26 },
  moreText: { fontSize: 12.5, fontWeight: '600', marginTop: 8 },
  fab: { position: 'absolute', right: 18, bottom: 92, elevation: 8, shadowColor: '#5B4BE8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, borderRadius: 26 },
  fabInner: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  endWrap: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 22, paddingBottom: 10 },
  endIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  endTitle: { fontSize: 19, fontWeight: '800' },
  endSub: { fontSize: 13.5, textAlign: 'center', lineHeight: 19, marginTop: 6 },
  editBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18, marginTop: 16 },
  credit: { fontSize: 11, textAlign: 'center', marginTop: 22, opacity: 0.8 },

  emptyWrap: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 50 },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center', marginTop: 6 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 22, marginTop: 20 },
  retryText: { color: '#FFF', fontWeight: '800', marginLeft: 6 },

  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingBottom: 26, paddingTop: 10, elevation: 24 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 14 },

  pickerHead: { alignItems: 'center', marginBottom: 6 },
  pickerIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  pickerTitle: { fontSize: 20, fontWeight: '800' },
  pickerSub: { fontSize: 13, textAlign: 'center', marginTop: 4, lineHeight: 18 },
  pickerLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, marginTop: 18, marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  interestChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 20 },
  interestText: { fontSize: 13.5, fontWeight: '700', marginHorizontal: 7 },
  segment: { flexDirection: 'row', borderRadius: 16, padding: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  segText: { fontSize: 13.5, fontWeight: '800' },
  hint: { fontSize: 11.5, marginTop: 8, lineHeight: 16 },
  cityChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16, marginRight: 8, marginBottom: 8 },
  saveBtn: { borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingVertical: 15 },
  saveText: { color: '#FFF', fontSize: 16, fontWeight: '800' },

  sharePreview: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 18 },
  sharePreviewIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sharePreviewTitle: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  shareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  shareAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  shareName: { flex: 1, fontSize: 15.5, fontWeight: '700' },
  sendPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  sendPillText: { color: '#FFF', fontSize: 13, fontWeight: '800', marginLeft: 5 },
  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },

  toast: { position: 'absolute', bottom: 96, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(20,22,28,0.95)', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22 },
  toastText: { color: '#FFF', fontSize: 13.5, fontWeight: '700', marginLeft: 8 },
});
