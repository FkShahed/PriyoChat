import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, StatusBar, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useThemeStore from '../../store/useThemeStore';
import { feedApi } from '../../api/services';
import { bdMinutesOfDay, bdDayNumber, bdFullDate } from '../../utils/bdTime';

// Dedicated Prayer times page: the next prayer with a live countdown, today's full list, and the following days.
// Times are for the place chosen in the Feed (Bangladesh time), from the same source as the Feed card.

const FIVE = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const ICON = { Fajr: 'cloudy-night', Sunrise: 'sunny-outline', Dhuhr: 'sunny', Asr: 'partly-sunny', Maghrib: 'partly-sunny-outline', Isha: 'moon' };
const GREEN = '#10B981';

const parse = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map((x) => parseInt(x, 10));
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const to12 = (hhmm) => {
  const mins = parse(hhmm);
  if (mins == null) return { t: hhmm || '--', ap: '' };
  const h = Math.floor(mins / 60);
  return { t: `${((h + 11) % 12) + 1}:${String(mins % 60).padStart(2, '0')}`, ap: h >= 12 ? 'PM' : 'AM' };
};
const fmtIn = (min) => (min < 1 ? 'now' : min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)}h ${min % 60}m`);

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

export default function PrayerScreen({ navigation, route }) {
  const { lat, lng, name } = route.params || {};
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

  const [days, setDays] = useState(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => bdMinutesOfDay());

  const load = useCallback(async () => {
    try {
      const { data } = await feedApi.getPrayerWeek(lat, lng, 7);
      if (!alive.current) return;
      setDays(data?.days || []);
      setError(false);
    } catch (e) {
      if (alive.current) setError(true);
    }
  }, [lat, lng]);
  useEffect(() => { load(); }, [load]);

  // keep the countdown honest: tick every 20 s
  useEffect(() => {
    const id = setInterval(() => setNow(bdMinutesOfDay()), 20000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); if (alive.current) setRefreshing(false); };

  // the list may have been fetched on an earlier day: always pick "today" by the date, not by position
  const todayNum = bdDayNumber(Date.now());
  const dayNum = (d) => bdDayNumber(Date.parse(d.date + 'T00:00:00+06:00'));
  const list = (days || []).filter((d) => dayNum(d) >= todayNum);
  const today = list.find((d) => dayNum(d) === todayNum) || null;
  const rest = list.filter((d) => dayNum(d) > todayNum).slice(0, 7);

  // the next prayer: first of today's five still ahead, else tomorrow's Fajr
  let next = null;
  if (today) {
    for (const n of FIVE) {
      const m = parse(today[n]);
      if (m != null && m > now) { next = { name: n, time: today[n], inMin: m - now, tomorrow: false }; break; }
    }
    if (!next && rest[0]) {
      const m = parse(rest[0].Fajr);
      if (m != null) next = { name: 'Fajr', time: rest[0].Fajr, inMin: 24 * 60 - now + m, tomorrow: true };
    }
  }

  const header = (
    <LinearGradient colors={dark ? ['#0F3B2E', '#06150F'] : ['#10B981', '#047857']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.orb} />
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Prayer times</Text>
      </View>
      <Text style={styles.sub}>{name ? name + ' · ' : ''}{bdFullDate(Date.now())}</Text>
      {today?.hijri ? <Text style={styles.hijri}>{today.hijri}</Text> : null}

      {next ? (
        <View style={styles.nextBox}>
          <Text style={styles.nextLabel}>{next.tomorrow ? 'NEXT · TOMORROW' : 'NEXT PRAYER'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
            <Text style={styles.nextName}>{next.name}</Text>
            <Text style={styles.nextTime}>{to12(next.time).t}<Text style={styles.nextAp}> {to12(next.time).ap}</Text></Text>
          </View>
          <View style={styles.inPill}><Ionicons name="time-outline" size={13} color="#FFF" /><Text style={styles.inText}>{fmtIn(next.inMin)}</Text></View>
        </View>
      ) : null}
    </LinearGradient>
  );

  const renderToday = () => {
    if (!today) return null;
    const rows = [['Fajr', today.Fajr], ['Sunrise', today.Sunrise], ['Dhuhr', today.Dhuhr], ['Asr', today.Asr], ['Maghrib', today.Maghrib], ['Isha', today.Isha]];
    return (
      <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
        {rows.map(([n, t], i) => {
          const m = parse(t);
          const isNext = !!next && !next.tomorrow && next.name === n;
          const passed = m != null && m <= now && !isNext;
          const x = to12(t);
          const isSun = n === 'Sunrise';
          return (
            <View key={n} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }, isNext && { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
              <View style={[styles.rowIcon, { backgroundColor: isNext ? GREEN : P.cardAlt }]}>
                <Ionicons name={ICON[n]} size={17} color={isNext ? '#FFF' : isSun ? '#F59E0B' : P.sub} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: P.text, fontSize: 15, fontWeight: isNext ? '600' : '500', opacity: passed ? 0.5 : 1 }}>{n}</Text>
                {isSun ? <Text style={{ color: P.sub, fontSize: 11.5, marginTop: 1 }}>Fajr ends</Text> : isNext ? <Text style={{ color: GREEN, fontSize: 11.5, marginTop: 1 }}>{fmtIn(next.inMin)}</Text> : passed ? <Text style={{ color: P.sub, fontSize: 11.5, marginTop: 1 }}>Passed</Text> : null}
              </View>
              <Text style={{ color: P.text, fontSize: 18, fontWeight: '500', opacity: passed ? 0.5 : 1, fontVariant: ['tabular-nums'] }}>{x.t}<Text style={{ color: P.sub, fontSize: 12 }}> {x.ap}</Text></Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderDay = (d) => {
    const dn = dayNum(d) - todayNum;
    const label = dn === 1 ? 'Tomorrow' : d.weekday;
    const short = `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`;
    return (
      <View key={d.date} style={[styles.dayCard, { backgroundColor: P.card, borderColor: P.border }]}>
        <View style={styles.dayHead}>
          <Text style={{ color: P.text, fontSize: 15, fontWeight: '500' }}>{label}</Text>
          <Text style={{ color: P.sub, fontSize: 12, marginLeft: 8 }}>{short}</Text>
          <View style={{ flex: 1 }} />
          {d.hijri ? <Text style={{ color: P.sub, fontSize: 11 }} numberOfLines={1}>{d.hijri}</Text> : null}
        </View>
        <View style={styles.dayCells}>
          {FIVE.map((n) => {
            const x = to12(d[n]);
            return (
              <View key={n} style={[styles.cell, { backgroundColor: P.cardAlt }]}>
                <Text style={{ color: P.sub, fontSize: 10.5 }}>{n}</Text>
                <Text style={{ color: P.text, fontSize: 13.5, fontWeight: '500', marginTop: 3, fontVariant: ['tabular-nums'] }}>{x.t}</Text>
                <Text style={{ color: P.sub, fontSize: 10 }}>{x.ap}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: P.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} colors={[GREEN]} progressViewOffset={40} />}
      >
        {header}

        <View style={{ paddingHorizontal: 16 }}>
          {!days && !error ? (
            <View style={{ gap: 12, marginTop: 22 }}>
              <Skeleton dark={dark} style={{ height: 330 }} />
              <Skeleton dark={dark} style={{ height: 110 }} />
              <Skeleton dark={dark} style={{ height: 110 }} />
            </View>
          ) : null}

          {error && !days ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: P.cardAlt }]}><Ionicons name="cloud-offline" size={30} color={P.sub} /></View>
              <Text style={{ color: P.text, fontSize: 16, fontWeight: '600' }}>Couldn't load prayer times</Text>
              <Text style={{ color: P.sub, fontSize: 13.5, textAlign: 'center', marginTop: 6 }}>Check your connection and try again.</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => { setError(false); load(); }}>
                <LinearGradient colors={['#10B981', '#047857']} style={styles.retry}><Text style={styles.retryText}>Try again</Text></LinearGradient>
              </TouchableOpacity>
            </View>
          ) : null}

          {today ? (
            <>
              <View style={styles.secHead}>
                <View style={[styles.secIcon, { backgroundColor: GREEN + '22' }]}><Ionicons name="today" size={14} color={GREEN} /></View>
                <Text style={[styles.secTitle, { color: P.text }]}>Today</Text>
              </View>
              {renderToday()}
            </>
          ) : null}

          {rest.length ? (
            <>
              <View style={[styles.secHead, { marginTop: 30 }]}>
                <View style={[styles.secIcon, { backgroundColor: '#0EA5E922' }]}><Ionicons name="calendar" size={14} color="#0EA5E9" /></View>
                <Text style={[styles.secTitle, { color: P.text }]}>Next {rest.length} days</Text>
              </View>
              <View style={{ gap: 12 }}>{rest.map(renderDay)}</View>
            </>
          ) : null}

          {days ? <Text style={[styles.credit, { color: P.sub }]}>Method: University of Islamic Sciences, Karachi (as in the Feed). Times can differ by a minute or two from your local mosque.</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { paddingTop: 52, paddingHorizontal: 18, paddingBottom: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  orb: { position: 'absolute', top: -100, right: -70, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.1)' },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  title: { flex: 1, color: '#FFF', fontSize: 25, fontWeight: '600', letterSpacing: -0.3 },
  sub: { color: 'rgba(255,255,255,0.9)', fontSize: 13.5, marginTop: 14 },
  hijri: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 3 },
  nextBox: { marginTop: 20, padding: 16, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.2)' },
  nextLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  nextName: { color: '#FFF', fontSize: 24, fontWeight: '500', flex: 1 },
  nextTime: { color: '#FFF', fontSize: 28, fontWeight: '400', fontVariant: ['tabular-nums'] },
  nextAp: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  inPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)' },
  inText: { color: '#FFF', fontSize: 13, fontWeight: '500', marginLeft: 6 },
  secHead: { flexDirection: 'row', alignItems: 'center', marginTop: 26, marginBottom: 12 },
  secIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secTitle: { flex: 1, fontSize: 17, fontWeight: '500', letterSpacing: -0.2, marginLeft: 10 },
  card: { borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayCard: { borderRadius: 20, borderWidth: 1, padding: 14 },
  dayHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dayCells: { flexDirection: 'row', gap: 6 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12 },
  empty: { alignItems: 'center', paddingHorizontal: 30, paddingTop: 40 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  retry: { paddingHorizontal: 24, paddingVertical: 11, borderRadius: 20, marginTop: 16 },
  retryText: { color: '#FFF', fontWeight: '600' },
  credit: { fontSize: 11, textAlign: 'center', marginTop: 26, lineHeight: 16, opacity: 0.8 },
});
