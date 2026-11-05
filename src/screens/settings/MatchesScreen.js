import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, StatusBar, Animated, Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useThemeStore from '../../store/useThemeStore';
import { feedApi } from '../../api/services';
import MatchCard from '../../components/feed/MatchCard';
import { bdDayNumber, bdFullDate } from '../../utils/bdTime';

// Dedicated Matches page: live now, today, the coming days, and recent results (cricket + football)

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
  return <Animated.View style={[{ backgroundColor: dark ? '#262A33' : '#E4E7EE', borderRadius: 20, opacity: a }, style]} />;
}

const FILTERS = [
  { key: 'all', label: 'All', icon: 'apps' },
  { key: 'live', label: 'Live', icon: 'radio' },
  { key: 'cricket', label: 'Cricket', icon: 'baseball' },
  { key: 'football', label: 'Football', icon: 'football' },
];

export default function MatchesScreen({ navigation }) {
  const dark = useThemeStore((s) => s.resolvedTheme === 'dark');
  const P = useMemo(() => ({
    bg: dark ? '#0C0D10' : '#F4F6FB',
    card: dark ? '#16181D' : '#FFFFFF',
    cardAlt: dark ? '#20232A' : '#EEF1F8',
    text: dark ? '#F2F2F5' : '#14171F',
    sub: dark ? '#8E9099' : '#6B7280',
    border: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)',
    accent: '#F59E0B',
  }), [dark]);

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const [matches, setMatches] = useState(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [showMinor, setShowMinor] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await feedApi.getMatches(7);
      if (!alive.current) return;
      setMatches(data?.matches || []);
      setError(false);
    } catch (e) {
      if (alive.current) setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // live scores: refresh every minute while any match is live
  // (also while a match is about to start, within 3 hours, so it flips to Live by itself)
  const hasLive = !!matches?.some((m) => m.state === 'live' || (m.state === 'upcoming' && m.time && Date.parse(m.time) - Date.now() < 3 * 3600 * 1000));
  useEffect(() => {
    if (!hasLive) return undefined;
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [hasLive, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    if (alive.current) setRefreshing(false);
  };

  const liveCount = matches ? matches.filter((m) => m.state === 'live' && (m.major || showMinor)).length : 0;

  // filter, then group: Live now -> Today -> Tomorrow / later days -> Results
  const sections = useMemo(() => {
    if (!matches) return [];
    const list = matches.filter((m) => {
      if (!showMinor && !m.major) return false;
      if (filter === 'live') return m.state === 'live';
      if (filter === 'cricket') return m.sport === 'cricket';
      if (filter === 'football') return m.sport !== 'cricket';
      return true;
    });
    const out = [];
    const live = list.filter((m) => m.state === 'live');
    if (live.length) out.push({ key: 'live', title: 'Live now', icon: 'radio', color: '#EF4444', items: live });
    const upcoming = list.filter((m) => m.state === 'upcoming');
    const byDay = {};
    upcoming.forEach((m) => {
      const diff = bdDayNumber(m.time) - bdDayNumber(Date.now());
      const k = String(diff);
      (byDay[k] = byDay[k] || { diff, items: [] }).items.push(m);
    });
    Object.values(byDay).sort((a, b) => a.diff - b.diff).forEach((g) => {
      const title = g.diff <= 0 ? 'Today' : g.diff === 1 ? 'Tomorrow' : bdFullDate(g.items[0].time);
      out.push({ key: 'day' + g.diff, title, icon: 'calendar', color: g.diff <= 0 ? '#10B981' : '#0EA5E9', items: g.items });
    });
    const results = list.filter((m) => m.state === 'final');
    if (results.length) out.push({ key: 'results', title: 'Results', icon: 'checkmark-done', color: '#8E9099', items: results });
    return out;
  }, [matches, filter, showMinor]);

  const headerGrad = dark ? ['#3A2A12', '#1B130A'] : ['#F59E0B', '#EA580C'];

  return (
    <View style={[styles.container, { backgroundColor: P.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.accent} colors={[P.accent]} progressViewOffset={40} />}
      >
        <LinearGradient colors={headerGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <View style={styles.orb} />
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={22} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.title}>Matches</Text>
            {liveCount > 0 ? (
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.livePillText}>{liveCount} live</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.subtitle}>Live scores, results and what's coming up</Text>
        </LinearGradient>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <TouchableOpacity key={f.key} activeOpacity={0.8} onPress={() => setFilter(f.key)} style={{ marginRight: 8 }}>
                {on ? (
                  <LinearGradient colors={['#F59E0B', '#EA580C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chip}>
                    <Ionicons name={f.icon} size={14} color="#FFF" />
                    <Text style={[styles.chipText, { color: '#FFF' }]}>{f.label}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.chip, { backgroundColor: P.cardAlt }]}>
                    <Ionicons name={f.icon} size={14} color={P.sub} />
                    <Text style={[styles.chipText, { color: P.text }]}>{f.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: 16 }}>
          {!matches && !error ? (
            <View style={{ gap: 10, marginTop: 6 }}>
              <Skeleton dark={dark} style={{ height: 130 }} />
              <Skeleton dark={dark} style={{ height: 130 }} />
              <Skeleton dark={dark} style={{ height: 130 }} />
            </View>
          ) : null}

          {error && !matches ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: P.cardAlt }]}><Ionicons name="cloud-offline" size={32} color={P.sub} /></View>
              <Text style={[styles.emptyTitle, { color: P.text }]}>Couldn't load matches</Text>
              <Text style={[styles.emptySub, { color: P.sub }]}>Check your connection and try again.</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => { setError(false); load(); }}>
                <LinearGradient colors={['#F59E0B', '#EA580C']} style={styles.retry}><Text style={styles.retryText}>Try again</Text></LinearGradient>
              </TouchableOpacity>
            </View>
          ) : null}

          {matches && sections.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: P.cardAlt }]}><Ionicons name="trophy" size={32} color={P.sub} /></View>
              <Text style={[styles.emptyTitle, { color: P.text }]}>No matches here</Text>
              <Text style={[styles.emptySub, { color: P.sub }]}>{filter === 'live' ? 'Nothing is being played right now.' : 'Try another filter, or include more leagues below.'}</Text>
            </View>
          ) : null}

          {sections.map((sec) => (
            <View key={sec.key}>
              <View style={styles.secHead}>
                <View style={[styles.secIcon, { backgroundColor: sec.color + '22' }]}>
                  <Ionicons name={sec.icon} size={14} color={sec.color} />
                </View>
                <Text style={[styles.secTitle, { color: P.text }]}>{sec.title}</Text>
                <Text style={[styles.secCount, { color: P.sub }]}>{sec.items.length}</Text>
              </View>
              <View style={{ gap: 10 }}>
                {sec.items.map((mt, i) => <MatchCard key={mt.id || sec.key + i} mt={mt} P={P} />)}
              </View>
            </View>
          ))}

          {matches ? (
            <TouchableOpacity activeOpacity={0.8} onPress={() => setShowMinor((v) => !v)} style={[styles.minorBtn, { backgroundColor: P.cardAlt }]}>
              <Ionicons name={showMinor ? 'eye-off' : 'add-circle'} size={16} color={P.accent} />
              <Text style={{ color: P.accent, fontSize: 13.5, fontWeight: '500', marginLeft: 6 }}>{showMinor ? 'Show top matches only' : 'Include domestic & other leagues'}</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={[styles.credit, { color: P.sub }]}>Scores from ESPN. Live matches update every minute.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 52, paddingHorizontal: 18, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  orb: { position: 'absolute', top: -90, right: -60, width: 230, height: 230, borderRadius: 115, backgroundColor: 'rgba(255,255,255,0.1)' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  title: { flex: 1, color: '#FFF', fontSize: 26, fontWeight: '600', letterSpacing: -0.4 },
  livePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.25)' },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#FCA5A5', marginRight: 6 },
  livePillText: { color: '#FFF', fontSize: 12.5, fontWeight: '500' },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, marginTop: 12 },
  chips: { paddingHorizontal: 16, paddingVertical: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  chipText: { fontSize: 13.5, fontWeight: '500', marginLeft: 6 },
  secHead: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10 },
  secIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  secTitle: { flex: 1, fontSize: 17, fontWeight: '600', letterSpacing: -0.2, marginLeft: 9 },
  secCount: { fontSize: 12.5 },
  empty: { alignItems: 'center', paddingHorizontal: 30, paddingTop: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySub: { fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  retry: { paddingHorizontal: 24, paddingVertical: 11, borderRadius: 20, marginTop: 18 },
  retryText: { color: '#FFF', fontWeight: '600' },
  minorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 18, marginTop: 22 },
  credit: { fontSize: 11, textAlign: 'center', marginTop: 16, opacity: 0.8 },
});
