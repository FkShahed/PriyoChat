import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, StatusBar, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useThemeStore from '../../store/useThemeStore';
import { feedApi } from '../../api/services';
import { timeAgo } from '../../constants/feedConfig';
import RiverCard from '../../components/feed/RiverCard';
import ArticleReader from '../../components/common/ArticleReader';

// Dedicated Safety page: every earthquake, disaster alert and the river flow around the user

const LEVEL_COLOR = { Red: '#DC2626', Orange: '#EA580C', Green: '#16A34A' };
const magColor = (m) => (m >= 5 ? '#DC2626' : m >= 4 ? '#EA580C' : '#CA8A04');

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
  return <Animated.View style={[{ backgroundColor: dark ? '#262A33' : '#E4E7EE', borderRadius: 18, opacity: a }, style]} />;
}

const FILTERS = [
  { key: 'all', label: 'All', icon: 'apps' },
  { key: 'quakes', label: 'Earthquakes', icon: 'pulse' },
  { key: 'events', label: 'Disasters', icon: 'warning' },
];

export default function SafetyScreen({ navigation, route }) {
  // one page per kind: kind === 'quakes' -> every recent earthquake, kind === 'events' -> every disaster alert
  const { lat, lng, name, kind } = route.params || {};
  const quakesPage = kind === 'quakes';
  const dark = useThemeStore((s) => s.resolvedTheme === 'dark');
  const P = useMemo(() => ({
    bg: dark ? '#0C0D10' : '#F4F6FB',
    card: dark ? '#16181D' : '#FFFFFF',
    cardAlt: dark ? '#20232A' : '#EEF1F8',
    text: dark ? '#F2F2F5' : '#14171F',
    sub: dark ? '#8E9099' : '#6B7280',
    border: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)',
  }), [dark]);

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const filter = quakesPage ? 'quakes' : 'events';
  const [reader, setReader] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await feedApi.getSafety(lat, lng);
      if (!alive.current) return;
      setData(res.data);
      setError(false);
    } catch (e) {
      if (alive.current) setError(true);
    }
  }, [lat, lng]);
  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    if (alive.current) setRefreshing(false);
  };

  const events = data?.events || [];
  const quakes = data?.quakes || [];
  const headerGrad = dark ? ['#3B1414', '#1A0B0B'] : ['#EF4444', '#B91C1C'];

  const renderQuake = (q, i) => {
    const c = magColor(q.mag);
    return (
      <TouchableOpacity key={'q' + i} activeOpacity={0.85} onPress={() => q.url && setReader({ url: q.url, title: 'Earthquake', source: 'USGS' })} style={[styles.row, { backgroundColor: P.card, borderColor: P.border }]}>
        <View style={[styles.magBox, { backgroundColor: c + '1F' }]}>
          <Text style={{ color: c, fontSize: 16, fontWeight: '500' }}>{Number(q.mag).toFixed(1)}</Text>
          <Text style={{ color: c, fontSize: 9.5, opacity: 0.85 }}>mag</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: P.text, fontSize: 14, fontWeight: '400' }} numberOfLines={2}>{q.place}</Text>
          <Text style={{ color: P.sub, fontSize: 11, marginTop: 3 }}>{q.km} km away · {timeAgo(q.time)}{q.depth ? ' · ' + q.depth + ' km deep' : ''}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={P.sub} />
      </TouchableOpacity>
    );
  };

  const renderEvent = (e, i) => {
    const c = LEVEL_COLOR[e.level] || '#16A34A';
    return (
      <TouchableOpacity key={'e' + i} activeOpacity={0.85} onPress={() => e.url && setReader({ url: e.url, title: e.kind, source: 'GDACS' })} style={[styles.row, { backgroundColor: P.card, borderColor: P.border }]}>
        <View style={[styles.evIcon, { backgroundColor: c + '22' }]}>
          <Ionicons name={e.type === 'TC' ? 'thunderstorm' : e.type === 'FL' ? 'water' : e.type === 'EQ' ? 'pulse' : 'warning'} size={21} color={c} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: P.text, fontSize: 14.5, fontWeight: '500' }} numberOfLines={1}>{e.kind}{e.country ? ' · ' + e.country : ''}</Text>
          <Text style={{ color: P.sub, fontSize: 11.5, lineHeight: 16, marginTop: 3 }} numberOfLines={3}>{e.title}</Text>
          <Text style={{ color: P.sub, fontSize: 10.5, marginTop: 4, opacity: 0.85 }}>{e.km} km from {name || 'you'} · {timeAgo(e.when)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const showQuakes = filter === 'all' || filter === 'quakes';
  const showEvents = filter === 'all' || filter === 'events';

  return (
    <View style={[styles.container, { backgroundColor: P.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EF4444" colors={['#EF4444']} progressViewOffset={40} />}
      >
        <LinearGradient colors={headerGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <View style={styles.orb} />
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={22} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.title}>{quakesPage ? 'Earthquakes' : 'Disasters'}</Text>
          </View>
          <Text style={styles.subtitle}>{quakesPage ? 'Every quake of magnitude 3+ in the last 14 days' : 'Active alerts for the region'}{name ? ' · near ' + name : ''}</Text>
        </LinearGradient>

        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          {!data && !error ? (
            <View style={{ gap: 10 }}>
              <Skeleton dark={dark} style={{ height: 76 }} />
              <Skeleton dark={dark} style={{ height: 76 }} />
              <Skeleton dark={dark} style={{ height: 76 }} />
            </View>
          ) : null}

          {error && !data ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: P.cardAlt }]}><Ionicons name="cloud-offline" size={32} color={P.sub} /></View>
              <Text style={[styles.emptyTitle, { color: P.text }]}>Couldn't load safety info</Text>
              <Text style={[styles.emptySub, { color: P.sub }]}>Check your connection and try again.</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => { setError(false); load(); }}>
                <LinearGradient colors={['#EF4444', '#B91C1C']} style={styles.retry}><Text style={styles.retryText}>Try again</Text></LinearGradient>
              </TouchableOpacity>
            </View>
          ) : null}

          {data && showQuakes ? (
            <View>
              <View style={styles.secHead}>
                <View style={[styles.secIcon, { backgroundColor: '#EF444422' }]}><Ionicons name="pulse" size={14} color="#EF4444" /></View>
                <Text style={[styles.secTitle, { color: P.text }]}>Earthquakes</Text>
                <Text style={[styles.secCount, { color: P.sub }]}>{quakes.length} in 14 days</Text>
              </View>
              {quakes.length ? <View style={{ gap: 10 }}>{quakes.map(renderQuake)}</View> : (
                <View style={[styles.row, { backgroundColor: P.card, borderColor: P.border }]}>
                  <Ionicons name="shield-checkmark" size={22} color="#10B981" />
                  <Text style={{ color: P.text, fontSize: 14, marginLeft: 12, flex: 1 }}>No earthquakes of magnitude 3 or more nearby in the last 14 days.</Text>
                </View>
              )}
            </View>
          ) : null}

          {data && showEvents ? (
            <View>
              <View style={styles.secHead}>
                <View style={[styles.secIcon, { backgroundColor: '#F59E0B22' }]}><Ionicons name="warning" size={14} color="#F59E0B" /></View>
                <Text style={[styles.secTitle, { color: P.text }]}>Disasters</Text>
                <Text style={[styles.secCount, { color: P.sub }]}>{events.length} recent</Text>
              </View>
              {events.length ? <View style={{ gap: 10 }}>{events.map(renderEvent)}</View> : (
                <View style={[styles.row, { backgroundColor: P.card, borderColor: P.border }]}>
                  <Ionicons name="shield-checkmark" size={22} color="#10B981" />
                  <Text style={{ color: P.text, fontSize: 14, marginLeft: 12, flex: 1 }}>No active alerts for Bangladesh or the neighbouring countries.</Text>
                </View>
              )}
            </View>
          ) : null}

          {data ? <Text style={[styles.credit, { color: P.sub }]}>{quakesPage ? 'Earthquakes: USGS' : 'Disasters: GDACS'}</Text> : null}
        </View>
      </ScrollView>
      <ArticleReader data={reader} onClose={() => setReader(null)} />
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
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, marginTop: 12 },
  chips: { paddingHorizontal: 16, paddingVertical: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  chipText: { fontSize: 13.5, fontWeight: '500', marginLeft: 6 },
  secHead: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10 },
  secIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  secTitle: { flex: 1, fontSize: 17, fontWeight: '600', letterSpacing: -0.2, marginLeft: 9 },
  secCount: { fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14 },
  magBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  evIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 30, paddingTop: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySub: { fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  retry: { paddingHorizontal: 24, paddingVertical: 11, borderRadius: 20, marginTop: 18 },
  retryText: { color: '#FFF', fontWeight: '600' },
  credit: { fontSize: 11, textAlign: 'center', marginTop: 22, opacity: 0.8 },
});
