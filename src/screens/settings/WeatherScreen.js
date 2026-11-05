import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, StatusBar, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useThemeStore from '../../store/useThemeStore';
import { feedApi } from '../../api/services';
import HourlyStrip from '../../components/feed/HourlyStrip';

// Dedicated Weather page: now, today hour by hour, and the next 7 days with details

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const to12 = (hhmm) => {
  const [h, mi] = String(hhmm).split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h)) return hhmm || '';
  return `${((h + 11) % 12) + 1}:${String(mi).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const iconColor = (icon, sub) => (
  icon === 'sunny' ? '#F59E0B'
  : icon === 'moon' || icon === 'cloudy-night' ? '#818CF8'
  : icon === 'rainy' || icon === 'thunderstorm' ? '#3B82F6'
  : icon === 'snow' ? '#38BDF8'
  : sub
);

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

export default function WeatherScreen({ navigation, route }) {
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

  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await feedApi.getWeather(lat, lng);
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

  const cur = data?.current;
  const days = data?.daily || [];
  const today = days[0];
  const weekMin = days.length ? Math.min(...days.map((d) => d.min)) : 0;
  const weekMax = days.length ? Math.max(...days.map((d) => d.max)) : 1;
  const span = Math.max(1, weekMax - weekMin);
  const headerGrad = cur ? (cur.isDay ? ['#38A3F5', '#2563EB'] : ['#1E2A5A', '#0F172A']) : (dark ? ['#16253A', '#0B1220'] : ['#38A3F5', '#2563EB']);

  const dayName = (date, i) => {
    if (i === 0) return 'Today';
    if (i === 1) return 'Tomorrow';
    const [y, mo, da] = date.split('-').map((x) => parseInt(x, 10));
    return DAY_LONG[new Date(y, mo - 1, da).getDay()];
  };

  return (
    <View style={[styles.container, { backgroundColor: P.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" colors={['#2563EB']} progressViewOffset={40} />}
      >
        <LinearGradient colors={headerGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <View style={styles.orb} />
          {cur ? <Ionicons name={cur.isDay ? cur.icon : (cur.icon === 'sunny' ? 'moon' : cur.icon)} size={150} color="#FFF" pointerEvents="none" style={{ position: 'absolute', right: -20, top: 70, opacity: 0.12, transform: [{ rotate: '-14deg' }] }} /> : null}
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={22} color="#FFF" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.place} numberOfLines={1}>{name || 'Weather'}</Text>
              <Text style={styles.sub}>7 day forecast</Text>
            </View>
          </View>
          {cur ? (
            <View style={styles.now}>
              <Text style={styles.temp}>{cur.temp}°</Text>
              <View style={{ marginLeft: 14, flex: 1 }}>
                <Text style={styles.cond}>{cur.text}</Text>
                <Text style={styles.condSub}>Feels like {cur.feels}°{today ? `  ·  H ${today.max}°  L ${today.min}°` : ''}</Text>
              </View>
            </View>
          ) : null}
        </LinearGradient>

        <View style={{ paddingHorizontal: 16 }}>
          {!data && !error ? (
            <View style={{ gap: 12, marginTop: 16 }}>
              <Skeleton dark={dark} style={{ height: 120 }} />
              <Skeleton dark={dark} style={{ height: 300 }} />
            </View>
          ) : null}

          {error && !data ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: P.cardAlt }]}><Ionicons name="cloud-offline" size={32} color={P.sub} /></View>
              <Text style={[styles.emptyTitle, { color: P.text }]}>Couldn't load the weather</Text>
              <Text style={[styles.emptySub, { color: P.sub }]}>Check your connection and try again.</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => { setError(false); load(); }}>
                <LinearGradient colors={['#38A3F5', '#2563EB']} style={styles.retry}><Text style={styles.retryText}>Try again</Text></LinearGradient>
              </TouchableOpacity>
            </View>
          ) : null}

          {data ? (
            <>
              <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border, marginTop: 16 }]}>
                <Text style={[styles.cardTitle, { color: P.text }]}>Next 24 hours</Text>
                <View style={{ marginTop: 6 }}>
                  <HourlyStrip hours={data.hourly} nowIndex={data.nowIndex} nowHour={data.nowHour} P={P} dark={dark} />
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border, marginTop: 14 }]}>
                <Text style={[styles.cardTitle, { color: P.text }]}>Next 7 days</Text>
                {days.map((d, i) => {
                  const left = ((d.min - weekMin) / span) * 100;
                  const width = Math.max(8, ((d.max - d.min) / span) * 100);
                  return (
                    <View key={d.date} style={[styles.dayRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
                      <View style={{ width: 92 }}>
                        <Text style={{ color: P.text, fontSize: 14.5, fontWeight: i === 0 ? '500' : '400' }}>{dayName(d.date, i)}</Text>
                        <Text style={{ color: d.rain >= 40 ? '#3B82F6' : P.sub, fontSize: 11, marginTop: 2 }}>{d.rain >= 20 ? `${d.rain}% rain` : d.text}</Text>
                      </View>
                      <Ionicons name={d.icon} size={22} color={iconColor(d.icon, P.sub)} style={{ width: 34 }} />
                      <Text style={{ color: P.sub, fontSize: 13.5, width: 30, textAlign: 'right' }}>{d.min}°</Text>
                      <View style={[styles.rangeTrack, { backgroundColor: P.cardAlt }]}>
                        <LinearGradient colors={['#38BDF8', '#F59E0B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.rangeFill, { left: left + '%', width: width + '%' }]} />
                      </View>
                      <Text style={{ color: P.text, fontSize: 13.5, width: 32 }}>{d.max}°</Text>
                    </View>
                  );
                })}
              </View>

              {today ? (
                <View style={[styles.detailCard, { backgroundColor: P.card, borderColor: P.border, marginTop: 14 }]}>
                  {[0, 3].map((start) => (
                    <View key={start} style={[styles.detailRow, start > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
                      {[
                        { icon: 'sunny', c: '#F59E0B', k: 'Sunrise', v: to12(today.sunrise) },
                        { icon: 'partly-sunny', c: '#FB923C', k: 'Sunset', v: to12(today.sunset) },
                        { icon: 'sunny-outline', c: '#EAB308', k: 'UV index', v: String(today.uv) },
                        { icon: 'flag', c: '#38BDF8', k: 'Wind', v: (cur ? cur.wind : today.wind) + ' km/h' },
                        { icon: 'water', c: '#3B82F6', k: 'Humidity', v: cur ? cur.humidity + '%' : '-' },
                        { icon: 'rainy', c: '#6366F1', k: 'Rain today', v: today.rainMm + ' mm' },
                      ].slice(start, start + 3).map((t, i) => (
                        <View key={t.k} style={[styles.detailCell, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: P.border }]}>
                          <View style={[styles.tileIcon, { backgroundColor: t.c + '22' }]}><Ionicons name={t.icon} size={18} color={t.c} /></View>
                          <Text style={{ color: P.text, fontSize: 16, marginTop: 10, textAlign: 'center' }} numberOfLines={1}>{t.v}</Text>
                          <Text style={{ color: P.sub, fontSize: 11.5, marginTop: 3, textAlign: 'center' }} numberOfLines={1}>{t.k}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              ) : null}

              <Text style={[styles.credit, { color: P.sub }]}>Forecast from Open-Meteo. Pull down to refresh.</Text>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 52, paddingHorizontal: 18, paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  orb: { position: 'absolute', top: -90, left: -60, width: 230, height: 230, borderRadius: 115, backgroundColor: 'rgba(255,255,255,0.08)' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  place: { color: '#FFF', fontSize: 20, fontWeight: '600', letterSpacing: -0.3 },
  sub: { color: 'rgba(255,255,255,0.8)', fontSize: 12.5, marginTop: 1 },
  now: { flexDirection: 'row', alignItems: 'center', marginTop: 22 },
  temp: { color: '#FFF', fontSize: 64, fontWeight: '200', letterSpacing: -3 },
  cond: { color: '#FFF', fontSize: 18, fontWeight: '500' },
  condSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 3 },
  card: { borderRadius: 22, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 14 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  rangeTrack: { flex: 1, height: 6, borderRadius: 3, marginHorizontal: 8, overflow: 'hidden' },
  rangeFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
  detailCard: { borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  detailRow: { flexDirection: 'row' },
  detailCell: { flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 6 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '31.4%', borderRadius: 20, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center' },
  tileIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 30, paddingTop: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySub: { fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  retry: { paddingHorizontal: 24, paddingVertical: 11, borderRadius: 20, marginTop: 18 },
  retryText: { color: '#FFF', fontWeight: '600' },
  credit: { fontSize: 11, textAlign: 'center', marginTop: 20, opacity: 0.8 },
});
