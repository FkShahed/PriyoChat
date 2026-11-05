import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { feedApi } from '../../api/services';
import useFeedUiStore from '../../store/useFeedUiStore';
import MatchCard from './MatchCard';
import { bdDayNumber, bdFullDate } from '../../utils/bdTime';

// The Matches tab of the Feed: live now, today, the coming days and recent results (cricket + football).
// It fetches by itself, refreshes every 20 s while a match is live and the tab is on screen, and each match opens its own page.

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

export default function MatchesPanel({ P, dark, navigation }) {
  const active = useFeedUiStore((s) => s.tab) === 'matches';
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const [matches, setMatches] = useState(null);
  const [error, setError] = useState(false);
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

  // refresh whenever the tab is opened
  useEffect(() => { if (active) load(); }, [active, load]);

  // live scores: every 20 s while a match is live (or about to start, within 3 hours), only while this tab is open
  const hasLive = !!matches?.some((m) => m.state === 'live' || (m.state === 'upcoming' && m.time && Date.parse(m.time) - Date.now() < 3 * 3600 * 1000));
  useEffect(() => {
    if (!active || !hasLive) return undefined;
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [active, hasLive, load]);

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
    const byDay = {};
    list.filter((m) => m.state === 'upcoming').forEach((m) => {
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

  const liveCount = matches ? matches.filter((m) => m.state === 'live' && (m.major || showMinor)).length : 0;

  return (
    <View>
      <View style={styles.head}>
        <View style={[styles.headIcon, { backgroundColor: '#F59E0B22' }]}><Ionicons name="trophy" size={15} color="#F59E0B" /></View>
        <Text style={[styles.headTitle, { color: P.text }]}>Matches</Text>
        {liveCount > 0 ? (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>{liveCount} live</Text>
          </View>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={styles.chips}>
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
            {sec.items.map((mt, i) => (
              <MatchCard key={mt.id || sec.key + i} mt={mt} P={P} onPress={() => navigation.navigate('MatchDetail', { mt })} />
            ))}
          </View>
        </View>
      ))}

      {matches ? (
        <TouchableOpacity activeOpacity={0.8} onPress={() => setShowMinor((v) => !v)} style={[styles.minorBtn, { backgroundColor: P.cardAlt }]}>
          <Ionicons name={showMinor ? 'eye-off' : 'add-circle'} size={16} color="#F59E0B" />
          <Text style={{ color: '#F59E0B', fontSize: 13.5, fontWeight: '500', marginLeft: 6 }}>{showMinor ? 'Show top matches only' : 'Include domestic & other leagues'}</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={[styles.credit, { color: P.sub }]}>Scores from ESPN. Tap a match for the full live page.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 6 },
  headIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, fontSize: 18, fontWeight: '600', letterSpacing: -0.2, marginLeft: 10 },
  livePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(239,68,68,0.14)' },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EF4444', marginRight: 6 },
  livePillText: { color: '#EF4444', fontSize: 12.5, fontWeight: '500' },
  chips: { paddingHorizontal: 16, paddingVertical: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  chipText: { fontSize: 13.5, fontWeight: '500', marginLeft: 6 },
  secHead: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 10 },
  secIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  secTitle: { flex: 1, fontSize: 17, fontWeight: '600', letterSpacing: -0.2, marginLeft: 9 },
  secCount: { fontSize: 12.5 },
  empty: { alignItems: 'center', paddingHorizontal: 30, paddingTop: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySub: { fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  retry: { paddingHorizontal: 24, paddingVertical: 11, borderRadius: 20, marginTop: 18 },
  retryText: { color: '#FFF', fontWeight: '600' },
  minorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 18, marginTop: 26 },
  credit: { fontSize: 11, textAlign: 'center', marginTop: 16, opacity: 0.8 },
});
