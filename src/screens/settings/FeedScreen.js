import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, RefreshControl, Modal, Animated, Easing,
  StatusBar, Linking, Share, useWindowDimensions, BackHandler, ActivityIndicator, TextInput, InteractionManager,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import useTabBarStore from '../../store/useTabBarStore';
import useFeedUiStore from '../../store/useFeedUiStore';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useAuthStore from '../../store/useAuthStore';
import useChatStore from '../../store/useChatStore';
import useSocketStore from '../../store/useSocketStore';
import useThemeStore, { useColors } from '../../store/useThemeStore';
import { feedApi } from '../../api/services';
import Avatar from '../../components/common/Avatar';
import ArticleReader from '../../components/common/ArticleReader';
import { FEED_CATEGORIES, FEED_GROUPS, CATEGORY_BY_ID, FEED_CITIES, DEFAULT_PREFS, DAILY_EXTRAS, timeAgo } from '../../constants/feedConfig';
import { buildShareText } from '../../utils/feedShare';
import { bdParts, bdClock, bdMinutesOfDay, bdDayKey, bdFullDate } from '../../utils/bdTime';
import MatchCard from '../../components/feed/MatchCard';
import RiverCard from '../../components/feed/RiverCard';
import MatchesPanel from '../../components/feed/MatchesPanel';
import HourlyStrip from '../../components/feed/HourlyStrip';
import SunArc from '../../components/feed/SunArc';

const PREFS_KEY = 'feed_prefs_v1';
const CACHE_KEY = 'feed_cache_v1';
const READ_KEY = 'feed_read_v1';
const STREAK_KEY = 'feed_streak_v1';
const SHOWN_KEY = 'feed_shown_v1';
const TAB_KEY = 'feed_tab_v1';

// The place used for weather, prayer times, air quality, sun, UV, safety: GPS spot if chosen, otherwise the picked city
function placeOf(p) {
  if (p?.useGps && Number.isFinite(p.lat) && Number.isFinite(p.lng)) return { name: p.placeName || 'Your location', lat: p.lat, lng: p.lng };
  return FEED_CITIES.find((c) => c.name === p?.city) || FEED_CITIES[0];
}

// Reads the phone's location and reports a precise reason when it can't.
// error: 'unavailable' (build without the location module) | 'denied' | 'services-off' | 'failed'
// Coordinates are rounded to ~1 km for privacy.
async function getDevicePlace(askPermission) {
  let Location;
  try {
    // requireOptionalNativeModule returns null (instead of throwing) when the module isn't in this build
    let present = false;
    try {
      const core = require('expo-modules-core');
      present = !!(core.requireOptionalNativeModule && core.requireOptionalNativeModule('ExpoLocation'));
    } catch (e) {
      present = !!(globalThis.expo && globalThis.expo.modules && globalThis.expo.modules.ExpoLocation);
    }
    if (!present) return { error: 'unavailable' };
    Location = require('expo-location');
  } catch (e) {
    return { error: 'unavailable', detail: String(e && e.message) };
  }
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      if (!askPermission) return { error: 'denied' };
      perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return { error: 'denied' };
    }
    let enabled = await Location.hasServicesEnabledAsync();
    if (!enabled && askPermission) {
      // Android lets an app ASK for location to be switched on (system dialog), never do it silently
      try { await Location.enableNetworkProviderAsync(); } catch (e) { /* the user said no / not supported */ }
      enabled = await Location.hasServicesEnabledAsync();
    }
    let pos = null;
    let stale = false;
    try { pos = await Location.getLastKnownPositionAsync(); } catch (e) { /* none yet */ }
    if (!enabled) {
      // Location is switched off: don't give up, use the last place the phone knew about
      if (!pos) return { error: 'services-off' };
      stale = true;
    } else {
      const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
      try {
        // a fresh reading (network/Wi-Fi based when GPS isn't locked yet); falls back to the last known spot
        pos = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }), timeout(15000)]);
      } catch (e) {
        if (!pos) return { error: 'failed', detail: String(e && e.message) };
        stale = true;
      }
    }
    if (!pos || !pos.coords) return { error: 'failed', detail: 'no position' };
    const lat = Math.round(pos.coords.latitude * 100) / 100;
    const lng = Math.round(pos.coords.longitude * 100) / 100;
    let name = 'Your location';
    try {
      const r = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      const g = r && r[0];
      name = (g && (g.district || g.city || g.subregion || g.region)) || name;
    } catch (e) { /* the name lookup needs internet; the coordinates are what matter */ }
    // A more exact name (neighbourhood / area, not just the city) from the server's OpenStreetMap lookup
    let full = name;
    try {
      const { data } = await feedApi.getPlace(Math.round(pos.coords.latitude * 1000) / 1000, Math.round(pos.coords.longitude * 1000) / 1000);
      if (data?.short) { name = data.short; full = data.full || data.short; }
    } catch (e) { /* offline or busy: keep the device's own name */ }
    return { lat, lng, name, full, stale };
  } catch (e) {
    return { error: 'failed', detail: String(e && e.message) };
  }
}

// One-word air-quality label, short tip and colour, always derived from the AQI number itself
function aqiInfo(aqi) {
  if (aqi <= 50) return { level: 'Good', tip: 'Clean air, enjoy the outdoors', color: '#16A34A' };
  if (aqi <= 100) return { level: 'Moderate', tip: 'Fine for most, sensitive people take care', color: '#CA8A04' };
  if (aqi <= 150) return { level: 'Unhealthy', tip: 'Limit time outside, especially kids and elders', color: '#EA580C' };
  if (aqi <= 200) return { level: 'Bad', tip: 'Wear a mask and avoid outdoor exercise', color: '#DC2626' };
  if (aqi <= 300) return { level: 'Severe', tip: 'Stay indoors and keep windows closed', color: '#9333EA' };
  return { level: 'Hazardous', tip: 'Avoid going outside, keep windows closed', color: '#7F1D1D' };
}

// Daytime: time left until sunset. Evening/night: time left until the next sunrise.
function sunCountdown(sunrise, sunset) {
  const toMin = (t) => { const [h, mi] = String(t).split(':').map((x) => parseInt(x, 10)); return h * 60 + mi; };
  const cur = bdMinutesOfDay();
  const sr = toMin(sunrise);
  const ss = toMin(sunset);
  const fmt = (mins) => (mins < 60 ? `${Math.max(1, mins)}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`);
  if (cur < sr) return `Sunrise in ${fmt(sr - cur)}`;
  if (cur < ss) return `Sunset in ${fmt(ss - cur)}`;
  return `Sunrise in ${fmt(24 * 60 - cur + sr)}`;
}

function uvInfo(uv) {
  if (uv < 3) return { level: 'Low', tip: 'No protection needed', color: '#16A34A' };
  if (uv < 6) return { level: 'Moderate', tip: 'Sunscreen helps', color: '#CA8A04' };
  if (uv < 8) return { level: 'High', tip: 'Use sunscreen, seek shade', color: '#EA580C' };
  if (uv < 11) return { level: 'Very high', tip: 'Avoid midday sun', color: '#DC2626' };
  return { level: 'Extreme', tip: 'Stay out of the sun', color: '#9333EA' };
}

const dayKey = (d = new Date()) => bdDayKey(d);

const greeting = () => {
  const h = bdParts(Date.now()).h;
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
  const mins = bdMinutesOfDay();
  for (const name of order) {
    const [h, m] = String(prayer[name]).split(':').map((x) => parseInt(x, 10));
    if (h * 60 + m > mins) return { name, time: prayer[name], inMin: h * 60 + m - mins };
  }
  const [h, m] = String(prayer.Fajr).split(':').map((x) => parseInt(x, 10));
  return { name: 'Fajr', time: prayer.Fajr, inMin: 24 * 60 - mins + h * 60 + m, tomorrow: true };
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const fmtClock = (iso) => bdClock(iso, { pad: false });

const fmtIn = (min) => (min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)}h ${min % 60}m`);

// ── Small building blocks ───────────────────────────────────────────────
// If anything inside a tab throws while rendering, show a small message instead of a white screen
class SafeView extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.warn('[Feed] render error:', err?.message); }
  render() {
    if (this.state.err) {
      const { sub, text } = this.props;
      return (
        <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 50 }}>
          <Text style={{ fontSize: 17, fontWeight: '600', color: text }}>Something went wrong here</Text>
          <Text style={{ fontSize: 13, color: sub, textAlign: 'center', marginTop: 6 }}>{String(this.state.err?.message || this.state.err)}</Text>
          <TouchableOpacity onPress={() => this.setState({ err: null })} style={{ marginTop: 16, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 18, backgroundColor: '#7C3AED' }}>
            <Text style={{ color: '#FFF', fontWeight: '600' }}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// Build one card; if its data is odd, skip just that card
const safe = (fn) => { try { return fn(); } catch (e) { console.warn('[Feed] card error:', e?.message); return null; } };

// A big, faint, tilted copy of a card's corner icon in its background (very low visibility, behind the content)
function Watermark({ name, color = '#FFFFFF', opacity = 0.11, size = 112, center = false }) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      pointerEvents="none"
      style={center
        ? { position: 'absolute', alignSelf: 'center', bottom: -20, opacity, transform: [{ rotate: '-16deg' }] }
        : { position: 'absolute', right: -14, bottom: -20, opacity, transform: [{ rotate: '-16deg' }] }}
    />
  );
}

// A story picture that never leaves an empty hole: if it cannot load (blocked, deleted, unsupported format),
// the topic's coloured placeholder is shown instead. It also asks for a browser-like User-Agent, which some news sites require.
function StoryImage({ uri, style, cat, iconSize = 30, fill = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [uri]);
  if (!uri || failed) {
    return (
      <LinearGradient colors={cat?.colors || ['#6366F1', '#4F46E5']} style={[fill ? StyleSheet.absoluteFillObject : null, style, { alignItems: 'center', justifyContent: 'center' }]}>
        {fill ? null : <Ionicons name={cat?.icon || 'newspaper'} size={iconSize} color="rgba(255,255,255,0.9)" />}
      </LinearGradient>
    );
  }
  return (
    <Image
      source={{ uri, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' } }}
      style={fill ? [StyleSheet.absoluteFillObject, style] : style}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

// Heading of one block inside the "Your interests" sheet: small icon, title, one-line hint, and an optional count on the right
function PickHead({ P, icon, title, sub, right }) {
  return (
    <View style={styles.pickHead}>
      <View style={[styles.pickHeadIcon, { backgroundColor: P.accent + '1F' }]}>
        <Ionicons name={icon} size={16} color={P.accent} />
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={[styles.pickHeadTitle, { color: P.text }]}>{title}</Text>
        {sub ? <Text style={[styles.pickHeadSub, { color: P.sub }]}>{sub}</Text> : null}
      </View>
      {right ? <View style={[styles.pickCount, { backgroundColor: P.accent + '1F' }]}><Text style={{ color: P.accent, fontSize: 11.5, fontWeight: '500' }}>{right}</Text></View> : null}
    </View>
  );
}

// Section heading of the Daily tab
function SectionTitle({ icon, title, sub, color, P, onMore }) {
  return (
    <View style={styles.dSecHead}>
      <View style={[styles.dSecIcon, { backgroundColor: (color || '#7C3AED') + '22' }]}>
        <Ionicons name={icon} size={15} color={color || '#7C3AED'} />
      </View>
      <Text style={[styles.dSecTitle, { color: P.text }]}>{title}</Text>
      {sub ? <Text style={[styles.dSecSub, { color: P.sub }]}>{sub}</Text> : null}
      {onMore ? (
        <TouchableOpacity onPress={onMore} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={[styles.dSecMore, { backgroundColor: P.cardAlt }]}>
          <Ionicons name="arrow-forward" size={16} color={P.text} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// Coloured daily card shell (ayah, word, quote, ...)
function DailyShell({ colors, icon, label, onShare, onPress, children, width }) {
  const dark = useThemeStore((s) => s.resolvedTheme) === 'dark';
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.9 : 1} onPress={onPress} style={{ marginBottom: 12 }}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.dCard,
          { width },
          dark
            ? { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' } // dark theme: calmer, with a fine edge
            : { backgroundColor: colors[0], shadowColor: colors[1] || '#000', shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 }, // light theme: a soft coloured glow under the card
        ]}
      >
        {/* dark theme: tone the colours down so the card does not glare against a dark page */}
        {dark ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} /> : null}
        {/* soft light from the top-left corner, and a big faint icon tucked in the bottom-right corner */}
        <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0.6 }} style={StyleSheet.absoluteFill} />
        <Watermark name={icon} opacity={0.1} size={120} />
        <View style={styles.dHead}>
          <View style={styles.dLabelWrap}>
            <View style={styles.dIconDot}><Ionicons name={icon} size={12} color="#FFF" /></View>
            <Text style={styles.dLabel} numberOfLines={1}>{label}</Text>
          </View>
          {onShare ? (
            <TouchableOpacity onPress={onShare} style={styles.dShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="paper-plane-outline" size={14} color="#FFF" />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.dRule} />
        {children}
        {onPress ? (
          <View style={styles.dMore}>
            <Text style={styles.dMoreText}>Read in full</Text>
            <Ionicons name="arrow-forward" size={13} color="rgba(255,255,255,0.92)" />
          </View>
        ) : null}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// Renders a tab's content. Defined once at the top level so React keeps it mounted between renders.
// It is re-created for every tab (the parent gives it a new key), so each tab fades and rises in gently instead of popping.
// One page of the feed. Pages stay mounted once opened and are only shown/hidden, so going back to a page is instant.
//  - the first time a page opens, a light placeholder shows for a moment and the real (heavy) content is built after
//    the animations have finished, so nothing stutters
//  - a hidden page is not rebuilt while other pages change; it is rebuilt when it is opened again
//  - the page fades and rises in gently each time it is shown
//  - the first build is done in two steps (the top of the page first, the rest a moment later), so no single step is heavy
//  - an open page is only rebuilt when something it shows has changed (`deps`), not on every unrelated state change
function Pane({ active, render, deps, fallback, sub, text }) {
  const [ready, setReady] = useState(active);
  const [full, setFull] = useState(false);
  const last = useRef(null);
  const lastDeps = useRef(null);
  const lastFull = useRef(false);
  const a = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    if (!active || ready) return undefined;
    // wait for the tab highlight / scroll glide to finish before the heavy build starts
    const t = setTimeout(() => setReady(true), 220);
    return () => clearTimeout(t);
  }, [active, ready]);
  useEffect(() => {
    if (!ready || full) return undefined;
    // second step: the rest of the page, once the first frame is on screen
    const h = InteractionManager.runAfterInteractions(() => setFull(true));
    return () => h.cancel();
  }, [ready, full]);
  useEffect(() => {
    if (!active || !ready) return;
    a.setValue(0);
    // slow and gentle: the page drifts up and fades in over about half a second
    Animated.timing(a, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [active, ready, a]);
  if (!ready) return active ? fallback : null;
  const same = last.current && lastFull.current === full && lastDeps.current && deps && lastDeps.current.length === deps.length && lastDeps.current.every((x, i) => x === deps[i]);
  if (active && !same) { last.current = render(full); lastDeps.current = deps; lastFull.current = full; }
  if (!last.current) { last.current = render(full); lastDeps.current = deps; lastFull.current = full; }
  return (
    <Animated.View style={active ? { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }] } : { display: 'none' }}>
      <SafeView sub={sub} text={text}>{last.current}</SafeView>
    </Animated.View>
  );
}

// Go-to-top button: subscribes to its own small stores, so scrolling never re-renders the whole Feed page
function GoTopFab({ onPress }) {
  const showTop = useFeedUiStore((st) => st.showTop);
  const barHidden = useTabBarStore((st) => st.hidden);
  const a = useRef(new Animated.Value(0)).current;
  const shift = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: showTop ? 1 : 0, duration: 200, useNativeDriver: true }).start(); }, [showTop, a]);
  useEffect(() => { Animated.timing(shift, { toValue: barHidden ? 1 : 0, duration: 220, useNativeDriver: true }).start(); }, [barHidden, shift]);
  return (
    <Animated.View
      pointerEvents={showTop ? 'auto' : 'none'}
      style={[styles.fab, { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }, { translateY: shift.interpolate({ inputRange: [0, 1], outputRange: [0, 72] }) }] }]}
    >
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        <LinearGradient colors={['#7C3AED', '#5B4BE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabInner}>
          <Ionicons name="arrow-up" size={22} color="#FFF" />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Daily / News switch. Pinned under the status bar once the header scrolls away.
// The pinned copy of the switch: an ordinary view above the scroll view (not a sticky scroll child), so taps always reach it
function StuckTabs({ onChange, P }) {
  const stuck = useFeedUiStore((st) => st.stuck);
  if (!stuck) return null;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, elevation: 6 }}>
      <FeedTabs onChange={onChange} P={P} overlay />
    </View>
  );
}

// The feed's pages. Everything that used to sit in one long "Daily" page is now its own tab.
const FEED_TABS = [
  ['daily', 'Daily', 'sunny'],
  ['news', 'News', 'newspaper'],
  ['inspiration', 'Inspiration', 'sparkles'],
  ['matches', 'Matches', 'trophy'],
  ['discover', 'Discover', 'compass'],
  ['safety', 'Safety', 'warning'],
  ['markets', 'Markets', 'stats-chart'],
  ['holidays', 'Holidays', 'calendar'],
];

function FeedTabs({ onChange, P, overlay = false }) {
  const stuck = overlay;
  const tab = useFeedUiStore((st) => st.tab);
  const sv = useRef(null);
  const spots = useRef({});
  // keep the chosen tab in view when the row is wider than the screen
  useEffect(() => {
    const s = spots.current[tab];
    if (s) sv.current?.scrollTo({ x: Math.max(0, s.x - 48), animated: true });
  }, [tab]);
  return (
    <View style={[styles.tabsBar, { backgroundColor: P.bg, paddingTop: stuck ? 42 : 10, paddingHorizontal: 0 }]}>
      <ScrollView ref={sv} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {FEED_TABS.map(([k, label, icon]) => {
          const on = tab === k;
          const inner = (
            <View style={styles.tabPill}>
              <Ionicons name={on ? icon : `${icon}-outline`} size={14} color={on ? '#FFF' : P.sub} />
              <Text style={[styles.tabText, { color: on ? '#FFF' : P.sub }]}>{label}</Text>
            </View>
          );
          return (
            <TouchableOpacity key={k} activeOpacity={0.8} onPress={() => onChange(k)} onLayout={(e) => { spots.current[k] = e.nativeEvent.layout; }} style={{ marginRight: 8 }}>
              {on ? (
                <LinearGradient colors={['#7C3AED', '#5B4BE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tabChip}>{inner}</LinearGradient>
              ) : (
                <View style={[styles.tabChip, { backgroundColor: P.cardAlt }]}>{inner}</View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

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
  const [exhausted, setExhausted] = useState(false); // true = even a fresh request found nothing new
  const exhaustedRef = useRef(false);
  const articlesRef = useRef(null);
  useEffect(() => { articlesRef.current = articles; }, [articles]);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollRef = useRef(null);
  const pageRef = useRef(1);
  const freshRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const shownRef = useRef([]); // ids of stories already shown (newest last), used so refresh brings unseen ones
  const paramsRef = useRef({ seed: 0, exclude: [] }); // seed + exclude of the current refresh, reused for every page
  const hasMoreRef = useRef(false);
  const loadMoreRef = useRef(() => {});
  const [widgets, setWidgets] = useState(null);
  const [daily, setDaily] = useState(null);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [tab, setTab] = useState('daily'); // 'daily' | 'news' (the page content)
  // the highlighted tab lives in useFeedUiStore: it changes instantly when a tab is tapped and re-renders only the tab bar
  // News topic filter: null = all my topics; otherwise only that topic, on every refresh and every "load more"
  const [topic, setTopic] = useState(null);
  const topicRef = useRef(null);
  const [topicMenu, setTopicMenu] = useState(null); // { x, y, w } of the button while the menu is open
  const topicBtnRef = useRef(null);
  const [sunW, setSunW] = useState(0); // measured width of the sun card
  const [locStale, setLocStale] = useState(false); // true = showing the last known location (Location is off / unreadable)
  const tabRef = useRef('daily');
  const headerH = useRef(220);
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

  // The bottom tab bar always returns when leaving Feed
  useFocusEffect(useCallback(() => {
    useTabBarStore.getState().setHidden(false);
    lastY.current = 0;
    useFeedUiStore.getState().setTab(tabRef.current); // the highlighted tab always matches the page that is really shown
    return () => { useTabBarStore.getState().setHidden(false); useFeedUiStore.getState().reset(); };
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
    useFeedUiStore.getState().setShowTop(y > 900);

    // near the end of the list: auto-load the next batch
    const distanceFromEnd = e.nativeEvent.contentSize.height - (y + e.nativeEvent.layoutMeasurement.height);
    if (tabRef.current === 'news' && distanceFromEnd < 700) loadMoreRef.current();

    // tabs bar becomes sticky once the header has scrolled away
    useFeedUiStore.getState().setStuck(y >= headerH.current - 6);
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
          if (cached?.widgets) { wBase.current += 1; setWidgets(cached.widgets); }
          if (cached?.daily) setDaily(cached.daily);
        }
        if (r) setReadIds(JSON.parse(r));
        try { const sh = await AsyncStorage.getItem(SHOWN_KEY); if (sh) shownRef.current = JSON.parse(sh); } catch { /* ignore */ }

        // daily streak
        const today = dayKey();
        let st = s ? JSON.parse(s) : { last: null, count: 0 };
        if (st.last !== today) {
          const y = new Date(Date.now() - 86400000);
          st = { last: today, count: st.last === dayKey(y) ? st.count + 1 : 1 };
          AsyncStorage.setItem(STREAK_KEY, JSON.stringify(st)).catch(() => {});
        }
        setStreak(st.count);
      } catch {
        if (alive.current) { setPrefs(DEFAULT_PREFS); setDraft(DEFAULT_PREFS); }
      }
    })();
  }, []);

  const city = useMemo(() => placeOf(prefs), [prefs]);

  // Saved screens of the slow-changing tabs, and a counter that goes up whenever the page data is really reloaded
  // (a live-score tick does not count). A saved screen is reused until one of the things it was built from changes.
  const tabCache = useRef({});
  const wBase = useRef(0);

  // which topics to ask the server for: everything I follow, or only the one chosen in the drop-down
  const topicsFor = (p) => {
    const t = topicRef.current;
    const mine = p.customTopics || [];
    if (t && t.startsWith('my:') && mine.includes(t.slice(3))) return { interests: [], custom: [t.slice(3)] };
    if (t && p.interests.includes(t)) return { interests: [t], custom: [] };
    return { interests: p.interests, custom: mine };
  };

  const loadFeed = useCallback(async (p, { silent, refresh } = {}) => {
    if (!p) return false;
    if (!silent) setError(false);
    try {
      const pl = placeOf(p);
      const [a, w, dly] = await Promise.all([
        feedApi.getArticles(topicsFor(p).interests, 'both', 1, !!refresh, paramsRef.current.seed, paramsRef.current.exclude, topicsFor(p).custom),
        feedApi.getWidgets(pl.lat, pl.lng).then((r) => { if (alive.current && r && r.data) { wBase.current += 1; setWidgets(r.data); } return r; }).catch(() => ({ data: null })),
        feedApi.getDaily().then((r) => { if (alive.current && r && r.data) setDaily(r.data); return r; }).catch(() => ({ data: null })),
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
      exhaustedRef.current = false;
      setExhausted(false);
      setArticles(list);
      if (w.data) { wBase.current += 1; setWidgets(w.data); }
      if (dly?.data) setDaily(dly.data);
      setOffline(false);
      setError(false);
      // the offline copy only keeps the full "all topics" list
      if (!topicRef.current) AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ articles: list, widgets: w.data || null, daily: dly?.data || null })).catch(() => {});
      return list;
    } catch {
      if (!alive.current) return false;
      setOffline(true);
      setArticles((cur) => { if (!cur) setError(true); return cur; });
      return false;
    }
  }, []);

  // Auto-load the next batch (24 stories) when the user reaches the end
  // When the current list is finished, don't stop at a dead end: ask the sources again (new mix, stories already
  // on screen left out) and keep going. Only when nothing new exists at all does the "caught up" note appear.
  const refillFeed = useCallback(async (manual) => {
    if (loadingMoreRef.current || !prefs?.onboarded) return;
    if (!articlesRef.current || !articlesRef.current.length) return; // nothing on screen yet: the normal load is still running
    if (!manual && exhaustedRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    if (manual) { exhaustedRef.current = false; setExhausted(false); }
    try {
      const have = (articlesRef.current || []).map((x) => x.id);
      const seed = Date.now() % 2147483647;
      const exclude = [...new Set([...have, ...shownRef.current])].slice(-200);
      const q = topicsFor(prefs);
      const { data } = await feedApi.getArticles(q.interests, 'both', 1, true, seed, exclude, q.custom);
      if (!alive.current) return;
      const seen = new Set(have);
      const fresh = (data?.articles || []).filter((x) => !seen.has(x.id));
      if (fresh.length) {
        paramsRef.current = { seed, exclude };
        pageRef.current = 1;
        hasMoreRef.current = !!data?.hasMore;
        setHasMore(!!data?.hasMore);
        shownRef.current = [...shownRef.current, ...fresh.map((x) => x.id)].slice(-200);
        AsyncStorage.setItem(SHOWN_KEY, JSON.stringify(shownRef.current)).catch(() => {});
        setArticles((cur) => {
          const s2 = new Set((cur || []).map((x) => x.id));
          return [...(cur || []), ...fresh.filter((x) => !s2.has(x.id))];
        });
      } else {
        exhaustedRef.current = true;
        setExhausted(true);
        if (manual) showToast('No new stories yet — check again a little later');
      }
    } catch {
      exhaustedRef.current = true;
      setExhausted(true);
    } finally {
      loadingMoreRef.current = false;
      if (alive.current) setLoadingMore(false);
    }
  }, [prefs]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !prefs?.onboarded) return;
    if (!hasMoreRef.current) { refillFeed(false); return; }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const next = pageRef.current + 1;
      const { data } = await feedApi.getArticles(topicsFor(prefs).interests, 'both', next, false, paramsRef.current.seed, paramsRef.current.exclude, topicsFor(prefs).custom);
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
  }, [prefs, refillFeed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  // if the chosen topic is no longer one of my interests, go back to "all"
  useEffect(() => {
    const tt = topicRef.current;
    if (tt && prefs?.interests && !(tt.startsWith('my:') ? (prefs.customTopics || []).includes(tt.slice(3)) : prefs.interests.includes(tt))) { topicRef.current = null; setTopic(null); }
  }, [prefs]);

  useEffect(() => { if (prefs?.onboarded) loadFeed(prefs, { silent: true }); }, [prefs, loadFeed]);

  const selectTopic = (id) => {
    setTopicMenu(null);
    if ((id || null) === topicRef.current) return;
    topicRef.current = id || null;
    setTopic(id || null);
    // a fresh start for the new list: new mix, nothing excluded, back to the top, skeleton while it loads
    paramsRef.current = { seed: Date.now() % 2147483647, exclude: [] };
    setArticles(null);
    setHasMore(false);
    hasMoreRef.current = false;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    loadFeed(prefs, { silent: true });
  };
  const openTopicMenu = () => {
    topicBtnRef.current?.measureInWindow((x, y, w, h) => setTopicMenu({ x, y: y + h + 6, w }));
  };

  // Safety tab: the whole list (every recent earthquake, disaster alert and the river) is loaded when the tab is opened,
  // and again after a refresh. The old widgets data stays on screen meanwhile, so the tab is never empty.
  const [safetyFull, setSafetyFull] = useState(null);
  const safetyOpen = tab === 'safety';
  useEffect(() => {
    if (!safetyOpen || !prefs?.onboarded) return;
    let off = false;
    feedApi.getSafety(city.lat, city.lng).then((r) => { if (!off && alive.current && r?.data) setSafetyFull(r.data); }).catch(() => {});
    return () => { off = true; };
  }, [safetyOpen, prefs?.onboarded, city.lat, city.lng, daily]);

  // (live scores are handled inside the Matches tab itself: see components/feed/MatchesPanel.js)

  // When "my location" is on, quietly re-read the position (the user may have travelled)
  const gpsChecked = useRef(false);
  const refreshGps = useCallback(async () => {
    if (!prefs?.useGps) return prefs;
    const r = await getDevicePlace(false);
    if (r.error) { setLocStale(true); return prefs; } // keep using the last saved location
    setLocStale(!!r.stale);
    const moved = Math.abs(r.lat - (prefs.lat || 0)) > 0.03 || Math.abs(r.lng - (prefs.lng || 0)) > 0.03;
    if (!moved && r.name === prefs.placeName) return prefs;
    const next = { ...prefs, lat: r.lat, lng: r.lng, placeName: r.name };
    setPrefs(next);
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
    return next;
  }, [prefs]);
  useEffect(() => {
    if (prefs?.onboarded && prefs.useGps && !gpsChecked.current) { gpsChecked.current = true; refreshGps(); }
  }, [prefs, refreshGps]);

  // If the user has already allowed Location and never picked a city by hand, just use where they are.
  // Runs every time the Feed comes into view, so allowing Location in Settings takes effect right away.
  const autoGpsBusy = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!prefs?.onboarded || prefs.useGps || prefs.cityChosen || autoGpsBusy.current) return undefined;
    autoGpsBusy.current = true;
    (async () => {
      const r = await getDevicePlace(false); // never prompts here, only uses a permission that is already given
      autoGpsBusy.current = false;
      if (r.error || !alive.current) return;
      const next = { ...prefs, useGps: true, lat: r.lat, lng: r.lng, placeName: r.name };
      setPrefs(next);
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
    })();
    return undefined;
  }, [prefs]));

  // Pull-to-refresh: the spinner must never hang. Reading the GPS or a slow source happens in the background
  // (each box updates itself when its data arrives); the spinner stops as soon as the page is refreshed, or after 8 s at most.
  const onRefresh = async () => {
    setRefreshing(true);
    // New seed + the stories already shown: the server puts unseen stories first and mixes the order
    paramsRef.current = { seed: Date.now() % 2147483647, exclude: shownRef.current.slice(-150) };
    refreshGps().catch(() => {}); // background: if the place changed, the page reloads for it by itself
    const loading = loadFeed(prefs, { silent: true, refresh: true });
    loading.then((list) => {
      if (alive.current && list) {
        const n = freshRef.current;
        showToast(n > 0 ? 'Fresh stories loaded for you' : 'Showing a new mix of stories');
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
    }).catch(() => {});
    await Promise.race([loading.catch(() => null), new Promise((resolve) => setTimeout(resolve, 8000))]);
    if (alive.current) setRefreshing(false);
  };

  const switchTab = (k) => {
    if (k === tabRef.current) return;
    tabRef.current = k;
    useFeedUiStore.getState().setTab(k); // the switch answers at once, without re-rendering the page
    useTabBarStore.getState().setHidden(false);
    const fromY = lastY.current;
    lastY.current = 0;
    // 1) glide to the very top of the page first (the same smooth scroll as the go-to-top button)
    const far = fromY > 40;
    scrollRef.current?.scrollTo({ y: 0, animated: far });
    // 2) then swap the content once the glide has finished; if the user tapped again meanwhile, only the latest choice wins
    const wait = far ? Math.min(380, 160 + fromY / 16) : 0;
    setTimeout(() => { if (alive.current && tabRef.current === k) setTab(k); }, wait);
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    useTabBarStore.getState().setHidden(false);
  };


  // ── prefs ─────────────────────────────────────────────────────────────
  const openPicker = () => { setDraft(prefs || DEFAULT_PREFS); setShowPicker(true); };
  const toggleInterest = (id) => setDraft((d) => {
    const has = d.interests.includes(id);
    if (has && d.interests.length === 1 && !(d.customTopics || []).length) return d; // keep at least one topic of any kind
    return { ...d, interests: has ? d.interests.filter((x) => x !== id) : [...d.interests, id] };
  });
  const [customText, setCustomText] = useState('');
  const addCustomTopic = () => {
    const t = customText.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (t.length < 2) return;
    setDraft((d) => {
      const cur = d.customTopics || [];
      if (cur.length >= 5 || cur.some((x) => x.toLowerCase() === t.toLowerCase())) return d;
      return { ...d, customTopics: [...cur, t] };
    });
    setCustomText('');
  };
  const removeCustomTopic = (t) => setDraft((d) => {
    const left = (d.customTopics || []).filter((x) => x !== t);
    if (!left.length && !d.interests.length) return d;
    return { ...d, customTopics: left };
  });
  const [locBusy, setLocBusy] = useState(false);
  const [locNote, setLocNote] = useState(null); // { text, tone: 'ok' | 'warn' }
  const useMyLocation = async () => {
    if (locBusy) return;
    setLocBusy(true);
    setLocNote({ text: 'Finding your location…', tone: 'ok' });
    const r = await getDevicePlace(true);
    if (!alive.current) return;
    setLocBusy(false);
    if (r.error === 'unavailable') { setLocNote({ text: 'This version of the app has no location support. Please install the latest build.', tone: 'warn' }); return; }
    if (r.error === 'denied') { setLocNote({ text: 'Location permission is off for PriyoChat. Allow it in Settings → Permissions, or pick a city below.', tone: 'warn', settings: true }); return; }
    if (r.error === 'services-off') { setLocNote({ text: "Location is turned off on your phone. Turn on Location (GPS) from the quick settings, then tap again.", tone: 'warn' }); return; }
    if (r.error) { setLocNote({ text: "Couldn't read your location" + (r.detail ? ' (' + r.detail + ')' : '') + '. Try again, or pick a city below.', tone: 'warn' }); return; }
    setDraft((d) => ({ ...d, useGps: true, cityChosen: false, lat: r.lat, lng: r.lng, placeName: r.name }));
    setLocNote({ text: 'Using ' + (r.full || r.name), tone: 'ok' });
  };

  const toggleExtra = (id) => setDraft((d) => ({ ...d, extras: { ...DEFAULT_PREFS.extras, ...(d.extras || {}), [id]: !({ ...DEFAULT_PREFS.extras, ...(d.extras || {}) })[id] } }));
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
    const text = a.rawText || buildShareText(a, CATEGORY_BY_ID[a.category]?.label);
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
  const dateStr = bdFullDate();
  const headerGrad = dark ? ['#2A2650', '#16141F'] : ['#5B4BE8', '#8B5CF6'];

  const renderHeader = () => (
    <LinearGradient colors={headerGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header} onLayout={(e) => { headerH.current = e.nativeEvent.layout.height; }}>
      <View style={styles.orb} />
      <View style={styles.orb2} />
      <View style={styles.headerRow}>
        <View style={styles.headerBtn}>
          <MaterialCommunityIcons name="newspaper-variant-multiple" size={21} color="#FFF" />
        </View>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
          <Text style={styles.headerTitle}>Feed</Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={openPicker} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="options" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
      <Text style={styles.hello} numberOfLines={1}>{greeting()}{firstName ? `, ${firstName}` : ''} 👋</Text>
      <View style={styles.dateRow}>
        <Text style={styles.dateText}>{dateStr}</Text>
      </View>
    </LinearGradient>
  );

  // Daily tab: tiles --------------------------------------------------------
  const wantsSports = !!prefs && (prefs.interests.includes('cricket') || prefs.interests.includes('sports'));

  const renderWeatherTile = () => {
    const w = widgets?.weather;
    if (!w) return null;
    return (
      <LinearGradient key="weather" colors={w.isDay ? ['#38A3F5', '#2563EB'] : ['#1E2A5A', '#0F172A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tile, { flex: 1.25, minHeight: 176 }]}>
        <Watermark name={w.isDay ? w.icon : (w.icon === 'sunny' ? 'moon' : w.icon)} />
        <View style={styles.widgetTop}>
          <Text style={[styles.widgetLabel, { flex: 1, marginRight: 8 }]} numberOfLines={1}>{city.name}</Text>
        </View>
        <Text style={styles.bigTemp}>{w.temp}°</Text>
        <Text style={styles.widgetSub}>{w.text}</Text>
        <Text style={styles.widgetFoot} numberOfLines={1}>H {w.max}°  ·  L {w.min}°  ·  Feels {w.feels}°</Text>
      </LinearGradient>
    );
  };

  const renderAqiTile = () => {
    const q0 = widgets?.aqi;
    if (!q0) return null;
    const q = { ...q0, ...aqiInfo(q0.aqi) };
    return (
      <LinearGradient key="aqi" colors={[q.color, q.color + 'BB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tile, { flex: 1, minHeight: 176 }]}>
        <Watermark name="leaf" />
        <View style={styles.widgetTop}>
          <Text style={styles.widgetLabel}>Air quality</Text>
        </View>
        <Text style={styles.aqiNum}>{q.aqi}</Text>
        <Text style={styles.widgetSub} numberOfLines={2}>{q.level}</Text>
        <Text style={[styles.aqiAdvice, { fontSize: 10.5, lineHeight: 14, opacity: 0.85 }]}>{q.tip}</Text>
      </LinearGradient>
    );
  };

  const renderPrayerCard = () => {
    const pr = widgets?.prayer;
    if (!pr) return null;
    const np = nextPrayer(pr);
    return (
      <TouchableOpacity key="prayer" activeOpacity={0.9} onPress={() => navigation.navigate('Prayer', { lat: city.lat, lng: city.lng, name: city.name })} style={[styles.listCard, { backgroundColor: P.card, borderColor: P.border }]}>
        <View style={styles.prayerHead}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[styles.miniIcon, { backgroundColor: '#10B98122' }]}><Ionicons name="moon" size={14} color="#10B981" /></View>
            <Text style={[styles.listTitle, { color: P.text, marginLeft: 8 }]}>Prayer times</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[styles.dSecMore, { backgroundColor: P.cardAlt, marginLeft: 0, width: 28, height: 28, borderRadius: 14 }]}>
              <Ionicons name="arrow-forward" size={15} color={P.text} />
            </View>
          </View>
        </View>
        <View style={styles.prayerRow}>
          {['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map((n) => {
            const on = np?.name === n;
            const t = to12h(pr[n]).split(' ');
            return (
              <View key={n} style={[styles.prayerCell, on && { backgroundColor: '#10B981', shadowColor: '#10B981', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }]}>
                <Text style={{ color: on ? '#FFF' : P.sub, fontSize: 11.5, fontWeight: '500' }}>{n}</Text>
                <Text style={{ color: on ? '#FFF' : P.text, fontSize: 13.5, fontWeight: '600', marginTop: 4 }}>{t[0]}</Text>
                <Text style={{ color: on ? 'rgba(255,255,255,0.85)' : P.sub, fontSize: 11.5, fontWeight: '500' }}>{t[1]}</Text>
              </View>
            );
          })}
        </View>
      </TouchableOpacity>
    );
  };

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const renderForecastCard = () => {
    const wx = widgets?.weather;
    if (!wx?.hourly?.length) return null;
    return (
      <View key="forecast" style={[styles.listCard, { backgroundColor: P.card, borderColor: P.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <View style={[styles.miniIcon, { backgroundColor: '#38A3F522' }]}><Ionicons name="partly-sunny" size={15} color="#38A3F5" /></View>
          <Text style={[styles.listTitle, { color: P.text, marginLeft: 8 }]}>Next 24 hours</Text>
        </View>
        <HourlyStrip hours={wx.hourly} nowIndex={wx.nowIndex} nowHour={wx.nowHour} P={P} dark={dark} />
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Weather', { lat: city.lat, lng: city.lng, name: city.name })}
          style={styles.sevenBtn}
        >
          <Text style={{ color: dark ? '#60A5FA' : '#2563EB', fontSize: 13.5, fontWeight: '500' }}>7 Day Forecast</Text>
          <Ionicons name="arrow-forward" size={15} color={dark ? '#60A5FA' : '#2563EB'} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderAlertCard = () => {
    const al = widgets?.alerts;
    if (!al || !al.length) return null;
    const first = al[0];
    const c = first ? (first.level === 'warn' ? '#F59E0B' : '#38BDF8') : '#10B981';
    return (
      <View key="alerts" style={[styles.listCard, styles.rowCard, { backgroundColor: P.card, borderColor: P.border }]}>
        <View style={[styles.rowIcon, { backgroundColor: c + '22' }]}>
          <Ionicons name={first ? (first.icon || 'alert-circle') : 'checkmark-circle'} size={22} color={c} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.listTitle, { color: P.text }]}>{first ? first.title : 'No weather alerts'}</Text>
          <Text style={{ color: P.sub, fontSize: 12.5, lineHeight: 17, marginTop: 2 }}>{first ? first.text : 'All clear for the next 2 days.'}</Text>
          {al.length > 1 ? <Text style={{ color: c, fontSize: 12, fontWeight: '600', marginTop: 4 }}>+{al.length - 1} more alert{al.length > 2 ? 's' : ''}</Text> : null}
        </View>
      </View>
    );
  };

  const renderSunMoonCard = () => {
    const sm = widgets?.sunmoon;
    if (!sm) return null;
    const mo = sm.moon;
    const toMin = (t) => { const [h, mi] = String(t).split(':').map((x) => parseInt(x, 10)); return h * 60 + mi; };
    const cur = bdMinutesOfDay();
    const sr = toMin(sm.sunrise);
    const ss = toMin(sm.sunset);
    const isDay = cur >= sr && cur < ss;
    const progress = isDay ? (cur - sr) / Math.max(1, ss - sr) : null;
    const grad = isDay ? ['#3B82F6', '#1D4ED8'] : ['#1E1B4B', '#0B1020'];
    return (
      <View key="sunmoon">
      <LinearGradient
        colors={grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.sunCard}
        onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w !== sunW) setSunW(w); }}
      >
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {/* faint tilted icon in the bottom-right corner, same as the other boxes */}
          <Watermark name={isDay ? 'sunny' : 'moon'} opacity={0.1} size={104} center />
        </View>
        <Text style={[styles.sunMid, { textAlign: 'center', marginBottom: 2 }]} numberOfLines={1}>{sunCountdown(sm.sunrise, sm.sunset)}</Text>
        <SunArc width={Math.max(0, sunW - 28)} progress={progress} moon={mo.emoji} />
        <View style={styles.sunTimes}>
          <View style={{ alignItems: 'center', minWidth: 74 }}>
            <Text style={styles.sunTime}>{to12h(sm.sunrise)}</Text>
            <Text style={styles.sunLabel}>Sunrise</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ alignItems: 'center', minWidth: 74 }}>
            <Text style={styles.sunTime}>{to12h(sm.sunset)}</Text>
            <Text style={styles.sunLabel}>Sunset</Text>
          </View>
        </View>
        {!isDay ? (
          <Text style={[styles.sunLabel, { fontSize: 10.5, opacity: 0.8, marginTop: 16, textAlign: 'center' }]} numberOfLines={1}>
            {mo.emoji} {mo.name} · {mo.illumination}% lit · Full moon in {mo.nextFullInDays}d
          </Text>
        ) : null}
      </LinearGradient>
      </View>
    );
  };

  const meterColor = (lvl) => (lvl === 'Good' || lvl === 'Low' ? '#4ADE80' : lvl === 'Moderate' ? '#FACC15' : '#F87171');
  const renderMeter = (label, value, level, max) => {
    if (value == null) return null;
    const pct = Math.max(6, Math.min(100, (value / max) * 100));
    return (
      <View key={label} style={{ marginTop: 12 }}>
        <View style={styles.meterHead}>
          <Text style={styles.meterLabel}>{label}</Text>
          <Text style={styles.meterValue}>{value}<Text style={styles.meterUnit}> µg/m³</Text></Text>
        </View>
        <View style={styles.meterTrack}>
          <View style={[styles.meterFill, { width: pct + '%', backgroundColor: meterColor(level) }]} />
        </View>
        <Text style={[styles.meterLevel, { color: meterColor(level) }]}>{level}</Text>
      </View>
    );
  };

  const renderUvTiles = () => {
    const u0 = widgets?.uv;
    if (!u0) return null;
    const ui = uvInfo(u0.uvMax);
    const u = { ...u0, uvLevel: ui.level, uvColor: ui.color, uvAdvice: ui.tip };
    return (
      <View key="uv" style={styles.tileRow}>
        <LinearGradient colors={[u.uvColor, u.uvColor + 'BB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tile, { flex: 1, minHeight: 150 }]}>
          <Watermark name="sunny" />
          <View style={styles.widgetTop}>
            <Text style={styles.widgetLabel}>UV index</Text>
          </View>
          <Text style={styles.aqiNum}>{u.uvMax}</Text>
          <Text style={styles.widgetSub}>{u.uvLevel} today</Text>
          <Text style={[styles.aqiAdvice, { fontSize: 10.5, lineHeight: 14, opacity: 0.85 }]}>{u.uvAdvice}</Text>
        </LinearGradient>
        <LinearGradient colors={dark ? ['#1E293B', '#0F172A'] : ['#546377', '#334155']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tile, { flex: 1, minHeight: 150 }]}>
          <Watermark name="cloudy" />
          <View style={styles.widgetTop}>
            <Text style={styles.widgetLabel}>Dust & particles</Text>
          </View>
          {renderMeter('PM10', u.pm10, u.pmLevel, 150)}
          {renderMeter('Dust', u.dust, u.dustLevel, 100)}
        </LinearGradient>
      </View>
    );
  };

  const LEVEL_COLOR = { Red: '#DC2626', Orange: '#EA580C', Green: '#16A34A' };
  const renderSafetyBlocks = () => {
    const sf = widgets?.safety;
    if (!sf) return [];
    const out = [];
    const ev = sf.events || [];
    if (!ev.length) {
      out.push(
        <View key="safe-ok" style={[styles.listCard, styles.rowCard, { backgroundColor: P.card, borderColor: P.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: '#10B98122' }]}><Ionicons name="shield-checkmark" size={22} color="#10B981" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.listTitle, { color: P.text }]}>All clear in the region</Text>
            <Text style={{ color: P.sub, fontSize: 12.5, marginTop: 2 }}>No active alerts for Bangladesh or the neighbouring countries right now.</Text>
          </View>
        </View>
      );
    } else {
      ev.forEach((e, i) => {
        const c = LEVEL_COLOR[e.level] || '#16A34A';
        out.push(
          <TouchableOpacity key={'safe-' + i} activeOpacity={0.85} onPress={() => e.url && setReader({ url: e.url, title: e.kind, source: 'GDACS' })} style={[styles.listCard, styles.rowCard, { backgroundColor: P.card, borderColor: P.border }]}>
            <View style={[styles.rowIcon, { backgroundColor: c + '22' }]}>
              <Ionicons name={e.type === 'TC' ? 'thunderstorm' : e.type === 'FL' ? 'water' : e.type === 'EQ' ? 'pulse' : 'warning'} size={22} color={c} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.listTitle, { color: P.text, flex: 1 }]} numberOfLines={1}>{e.kind}{e.country ? ' · ' + e.country : ''}</Text>
              </View>
              <Text style={{ color: P.sub, fontSize: 11, lineHeight: 15, marginTop: 3, opacity: 0.9 }} numberOfLines={2}>{e.title}</Text>
              <Text style={{ color: P.sub, fontSize: 10.5, marginTop: 3, opacity: 0.8 }}>{e.km} km from {city.name} · {timeAgo(e.when)}</Text>
            </View>
          </TouchableOpacity>
        );
      });
    }
    if (sf.river) out.push(<RiverCard key="river" rv={sf.river} />);
    return out;
  };

  // The whole Safety tab: earthquakes, disasters, river. Falls back to the short widgets data until the full list arrives.
  const renderSafetyFull = () => {
    const sf = safetyFull;
    if (!sf) return null;
    const magColor = (m) => (m >= 5 ? '#DC2626' : m >= 4 ? '#EA580C' : '#CA8A04');
    const quakes = sf.quakes || [];
    const events = sf.events || [];
    const goAll = (kind) => navigation.navigate(kind === 'quakes' ? 'Earthquakes' : 'Disasters', { kind, lat: city.lat, lng: city.lng, name: city.name });
    const head = (icon, color, title, count, kind) => (
      <View style={[styles.safeHead, { marginTop: kind === 'events' || title === 'Rivers' ? 36 : 6 }]}>
        <View style={[styles.dSecIcon, { backgroundColor: color + '22' }]}><Ionicons name={icon} size={14} color={color} /></View>
        <Text style={[styles.safeTitle, { color: P.text }]}>{title}</Text>
        {count ? <Text style={{ color: P.sub, fontSize: 12 }}>{count}</Text> : null}
        {kind ? (
          <TouchableOpacity onPress={() => goAll(kind)} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={[styles.dSecMore, { backgroundColor: P.cardAlt, marginLeft: 10 }]}>
            <Ionicons name="arrow-forward" size={16} color={P.text} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
    const clear = (text) => (
      <View style={[styles.listCard, styles.rowCard, { backgroundColor: P.card, borderColor: P.border }]}>
        <Ionicons name="shield-checkmark" size={22} color="#10B981" />
        <Text style={{ color: P.text, fontSize: 14, marginLeft: 12, flex: 1 }}>{text}</Text>
      </View>
    );
    const levelColor = { Red: '#DC2626', Orange: '#EA580C', Green: '#16A34A' };
    return (
      <View key="safety-full">
        {head('pulse', '#EF4444', 'Earthquakes', quakes.length + ' in 14 days', 'quakes')}
        {/* (the first heading sits right under the page title; the others get a wider gap above them) */}
        {quakes.length ? (
          <View style={{ gap: 10 }}>
            {quakes.slice(0, 3).map((q, i) => {
              const c = magColor(q.mag);
              return (
                <TouchableOpacity key={'q' + i} activeOpacity={0.85} onPress={() => q.url && setReader({ url: q.url, title: 'Earthquake', source: 'USGS' })} style={[styles.listCard, styles.rowCard, { backgroundColor: P.card, borderColor: P.border }]}>
                  <View style={[styles.magBox, { backgroundColor: c + '1F' }]}>
                    <Text style={{ color: c, fontSize: 16, fontWeight: '500' }}>{Number(q.mag).toFixed(1)}</Text>
                    <Text style={{ color: c, fontSize: 9.5, opacity: 0.85 }}>mag</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: P.text, fontSize: 14 }} numberOfLines={2}>{q.place}</Text>
                    <Text style={{ color: P.sub, fontSize: 11, marginTop: 3 }}>{q.km} km away · {timeAgo(q.time)}{q.depth ? ' · ' + q.depth + ' km deep' : ''}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={P.sub} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : clear('No earthquakes of magnitude 3 or more nearby in the last 14 days.')}

        {head('warning', '#F59E0B', 'Disasters', events.length + ' recent', 'events')}
        {events.length ? (
          <View style={{ gap: 10 }}>
            {events.slice(0, 3).map((e, i) => {
              const c = levelColor[e.level] || '#16A34A';
              return (
                <TouchableOpacity key={'e' + i} activeOpacity={0.85} onPress={() => e.url && setReader({ url: e.url, title: e.kind, source: 'GDACS' })} style={[styles.listCard, styles.rowCard, { backgroundColor: P.card, borderColor: P.border }]}>
                  <View style={[styles.rowIcon, { backgroundColor: c + '22' }]}>
                    <Ionicons name={e.type === 'TC' ? 'thunderstorm' : e.type === 'FL' ? 'water' : e.type === 'EQ' ? 'pulse' : 'warning'} size={22} color={c} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listTitle, { color: P.text }]} numberOfLines={1}>{e.kind}{e.country ? ' · ' + e.country : ''}</Text>
                    <Text style={{ color: P.sub, fontSize: 11.5, lineHeight: 16, marginTop: 3 }} numberOfLines={3}>{e.title}</Text>
                    <Text style={{ color: P.sub, fontSize: 10.5, marginTop: 4, opacity: 0.85 }}>{e.km} km from {city.name} · {timeAgo(e.when)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : clear('No active alerts for Bangladesh or the neighbouring countries.')}

        {sf.river ? (<>{head('water', '#0EA5E9', 'Rivers')}<RiverCard rv={sf.river} /></>) : null}
        <Text style={{ color: P.sub, fontSize: 11, textAlign: 'center', marginTop: 20, opacity: 0.8 }}>Earthquakes: USGS · Disasters: GDACS · River flow is modelled, not an official warning.</Text>
      </View>
    );
  };

  const renderHolidayCard = () => {
    const hs = widgets?.holidays;
    if (!hs?.length) return null;
    return (
      <View style={[styles.listCard, { backgroundColor: P.card, borderColor: P.border, paddingVertical: 6, paddingHorizontal: 12 }]}>
        {hs.map((h, i) => {
          const d = new Date(h.date + 'T00:00:00Z');
          const mon = MONTHS[d.getUTCMonth()];
          const first = i === 0;
          return (
            <View key={h.date + i} style={[styles.holRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
              {first ? (
                <LinearGradient colors={['#0EA5E9', '#2563EB']} style={styles.holBadge}>
                  <Text style={styles.holMon}>{mon}</Text>
                  <Text style={styles.holDay}>{d.getUTCDate()}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.holBadge, { backgroundColor: P.cardAlt }]}>
                  <Text style={[styles.holMon, { color: P.sub }]}>{mon}</Text>
                  <Text style={[styles.holDay, { color: P.text }]}>{d.getUTCDate()}</Text>
                </View>
              )}
              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <Text style={{ color: P.text, fontSize: first ? 14.5 : 13.5, fontWeight: first ? '500' : '400' }} numberOfLines={2}>{h.name}</Text>
                <Text style={{ color: P.sub, fontSize: 11, marginTop: 1 }} numberOfLines={1}>{h.weekday}</Text>
              </View>
              <Text style={{ color: first ? '#0EA5E9' : P.sub, fontSize: first ? 13 : 12, fontWeight: '500' }}>{h.inDays === 0 ? 'Today' : h.inDays === 1 ? 'Tomorrow' : 'in ' + h.inDays + 'd'}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderArtCard = () => {
    const a = daily?.art;
    if (!a?.image) return null;
    return (
      <TouchableOpacity key="art" activeOpacity={0.92} onPress={() => a.url && setReader({ url: a.url, title: a.title, source: 'Cleveland Museum of Art' })} style={{ marginBottom: 12 }}>
        <View style={[styles.artCard, { backgroundColor: P.card }]}>
          <Image source={{ uri: a.image }} style={styles.artImg} resizeMode="cover" />
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']} style={styles.artShade} />
          <View style={styles.artTop}>
            <LinearGradient colors={['#F472B6', '#A855F7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.catChip}>
              <Ionicons name="color-palette" size={11} color="#FFF" />
              <Text style={styles.catChipText}>Artwork of the day</Text>
            </LinearGradient>
            <TouchableOpacity onPress={() => shareText('Artwork of the day', '🎨 ' + a.title + '\n' + a.artist + (a.date ? ', ' + a.date : '') + '\n' + a.url)} style={styles.dShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="paper-plane" size={13} color="#FFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.artInfo}>
            <Text style={styles.artTitle} numberOfLines={2}>{a.title}</Text>
            <Text style={styles.artArtist} numberOfLines={1}>{a.artist}{a.date ? ' · ' + a.date : ''}</Text>
            <Text style={styles.dCredit}>{a.credit}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMarketTiles = () => {
    const r = widgets?.rates;
    const c = widgets?.crypto;
    const tiles2 = [];
    if (r?.usdBdt) {
      tiles2.push(
        <View key="rates" style={[styles.tile, { flex: 1, backgroundColor: P.card, borderWidth: 1, borderColor: P.border }]}>
          <Watermark name="cash" color={P.text} opacity={0.06} />
          <View style={styles.widgetTop}>
            <Text style={[styles.widgetLabel, { color: P.sub }]}>Taka rate</Text>
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
    if (c?.btc?.price) {
      const row = (label, d) => d?.price ? (
        <View key={label} style={styles.rateRow}>
          <Text style={[styles.rateK, { color: P.sub }]}>{label}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.rateV, { color: P.text }]}>${Math.round(d.price).toLocaleString()}</Text>
            <Text style={{ fontSize: 11.5, fontWeight: '400', color: d.change >= 0 ? '#10B981' : '#EF4444' }}>{d.change >= 0 ? '▲' : '▼'} {Math.abs(d.change || 0).toFixed(1)}%</Text>
          </View>
        </View>
      ) : null;
      tiles2.push(
        <View key="crypto" style={[styles.tile, { flex: 1, backgroundColor: P.card, borderWidth: 1, borderColor: P.border }]}>
          <Watermark name="logo-bitcoin" color={P.text} opacity={0.06} />
          <View style={styles.widgetTop}>
            <Text style={[styles.widgetLabel, { color: P.sub }]}>Crypto</Text>
          </View>
          {row('BTC', c.btc)}
          {row('ETH', c.eth)}
        </View>
      );
    }
    return tiles2.length ? <View style={styles.tileRow}>{tiles2}</View> : null;
  };

  // Markets tab: every currency in taka and a longer crypto list (falls back to the two small tiles if the server is older)
  const renderMarketsFull = () => {
    const rl = widgets?.rates?.list;
    const cl = widgets?.crypto?.list;
    if (!rl?.length && !cl?.length) return null;
    const NAMES = { USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', INR: 'Indian Rupee', SAR: 'Saudi Riyal', AED: 'UAE Dirham', KWD: 'Kuwaiti Dinar', QAR: 'Qatari Riyal', MYR: 'Malaysian Ringgit', SGD: 'Singapore Dollar', JPY: 'Japanese Yen', CNY: 'Chinese Yuan', CAD: 'Canadian Dollar', AUD: 'Australian Dollar', CHF: 'Swiss Franc' };
    const COIN = { BTC: 'Bitcoin', ETH: 'Ethereum', BNB: 'BNB', SOL: 'Solana', XRP: 'XRP', DOGE: 'Dogecoin', ADA: 'Cardano', TRX: 'TRON', TON: 'Toncoin', LTC: 'Litecoin' };
    const fmt = (n) => (n >= 100 ? Math.round(n).toLocaleString() : n >= 1 ? n.toFixed(2) : n.toFixed(4));
    return (
      <View key="markets-full">
        {rl?.length ? (
          <>
            <View style={styles.safeHead}>
              <View style={[styles.dSecIcon, { backgroundColor: '#10B98122' }]}><Ionicons name="cash" size={14} color="#10B981" /></View>
              <Text style={[styles.safeTitle, { color: P.text }]}>Taka rate</Text>
              <Text style={{ color: P.sub, fontSize: 12 }}>per 1 unit</Text>
            </View>
            <View style={[styles.listCard, { backgroundColor: P.card, borderColor: P.border, paddingVertical: 4, paddingHorizontal: 14 }]}>
              {rl.map((c, i) => (
                <View key={c.code} style={[styles.mktRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
                  <View style={[styles.mktCode, { backgroundColor: P.cardAlt }]}><Text style={{ color: P.text, fontSize: 12, fontWeight: '600' }}>{c.code}</Text></View>
                  <Text style={{ flex: 1, color: P.sub, fontSize: 13, marginLeft: 12 }} numberOfLines={1}>{NAMES[c.code] || c.code}</Text>
                  <Text style={{ color: P.text, fontSize: 15, fontWeight: '500' }}>৳ {c.bdt}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
        {cl?.length ? (
          <>
            <View style={[styles.safeHead, { marginTop: 22 }]}>
              <View style={[styles.dSecIcon, { backgroundColor: '#F59E0B22' }]}><Ionicons name="logo-bitcoin" size={14} color="#F59E0B" /></View>
              <Text style={[styles.safeTitle, { color: P.text }]}>Crypto</Text>
              <Text style={{ color: P.sub, fontSize: 12 }}>USD · 24h</Text>
            </View>
            <View style={[styles.listCard, { backgroundColor: P.card, borderColor: P.border, paddingVertical: 4, paddingHorizontal: 14 }]}>
              {cl.map((c, i) => {
                const up = (c.change || 0) >= 0;
                return (
                  <View key={c.sym} style={[styles.mktRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
                    <View style={[styles.mktCode, { backgroundColor: P.cardAlt }]}><Text style={{ color: P.text, fontSize: 11.5, fontWeight: '600' }}>{c.sym}</Text></View>
                    <Text style={{ flex: 1, color: P.sub, fontSize: 13, marginLeft: 12 }} numberOfLines={1}>{COIN[c.sym] || c.sym}</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: P.text, fontSize: 15, fontWeight: '500' }}>${fmt(c.price)}</Text>
                      <Text style={{ fontSize: 11.5, color: up ? '#10B981' : '#EF4444' }}>{up ? '▲' : '▼'} {Math.abs(c.change || 0).toFixed(1)}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
        <Text style={{ color: P.sub, fontSize: 11, textAlign: 'center', marginTop: 18, opacity: 0.8 }}>Mid-market rates, updated through the day. Not what a bank or exchange will pay you.</Text>
      </View>
    );
  };

  // Holidays tab: the next holiday as a big card, then the following ones grouped by month
  const renderHolidaysFull = () => {
    const hs = widgets?.holidays;
    if (!hs?.length) return null;
    const next = hs.find((h) => h.kind !== 'observance') || hs[0]; // the big card is the next real day off
    const nd = new Date(next.date + 'T00:00:00Z');
    const when = (h) => (h.inDays === 0 ? 'Today' : h.inDays === 1 ? 'Tomorrow' : 'in ' + h.inDays + ' days');
    const rest = hs.filter((h) => h !== next);
    const groups = [];
    rest.forEach((h) => {
      const d = new Date(h.date + 'T00:00:00Z');
      const label = MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
      const g = groups[groups.length - 1];
      if (g && g.label === label) g.items.push(h); else groups.push({ label, items: [h] });
    });
    return (
      <View key="holidays-full">
        <LinearGradient colors={['#0EA5E9', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.holHero}>
          <Watermark name="calendar" opacity={0.1} size={104} />
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, letterSpacing: 0.6 }}>NEXT HOLIDAY</Text>
          <Text style={{ color: '#FFF', fontSize: 22, fontWeight: '600', marginTop: 6 }} numberOfLines={2}>{next.name}</Text>
          {next.localName && next.localName !== next.name ? <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 }} numberOfLines={1}>{next.localName}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
            <View style={styles.holHeroPill}><Text style={{ color: '#FFF', fontSize: 13, fontWeight: '500' }}>{next.weekday}, {nd.getUTCDate()} {MONTHS[nd.getUTCMonth()]}</Text></View>
            <View style={[styles.holHeroPill, { marginLeft: 8 }]}><Text style={{ color: '#FFF', fontSize: 13, fontWeight: '500' }}>{when(next)}</Text></View>
            {next.approx ? <View style={[styles.holHeroPill, { marginLeft: 8 }]}><Text style={{ color: '#FFF', fontSize: 12 }}>date expected</Text></View> : null}
          </View>
        </LinearGradient>
        {groups.map((g) => (
          <View key={g.label}>
            <Text style={[styles.holGroup, { color: P.sub }]}>{g.label}</Text>
            <View style={[styles.listCard, { backgroundColor: P.card, borderColor: P.border, paddingVertical: 6, paddingHorizontal: 12 }]}>
              {g.items.map((h, i) => {
                const d = new Date(h.date + 'T00:00:00Z');
                return (
                  <View key={h.date + i} style={[styles.holRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
                    <View style={[styles.holBadge, { backgroundColor: P.cardAlt }]}>
                      <Text style={[styles.holMon, { color: P.sub }]}>{MONTHS[d.getUTCMonth()]}</Text>
                      <Text style={[styles.holDay, { color: P.text }]}>{d.getUTCDate()}</Text>
                    </View>
                    <View style={{ flex: 1, marginHorizontal: 10 }}>
                      <Text style={{ color: P.text, fontSize: 13.5 }} numberOfLines={2}>{h.name}</Text>
                      <Text style={{ color: P.sub, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                        {h.weekday}
                        <Text style={{ color: h.kind === 'observance' ? P.sub : '#10B981' }}>{h.kind === 'observance' ? '  ·  Observance' : '  ·  Day off'}</Text>
                        {h.approx ? '  ·  date expected' : ''}
                      </Text>
                    </View>
                    <Text style={{ color: P.sub, fontSize: 12, fontWeight: '500' }}>{when(h)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
        <Text style={{ color: P.sub, fontSize: 11, textAlign: 'center', marginTop: 18, opacity: 0.8 }}>Bangladesh public holidays ("Day off") and notable observances. Moon-sighting festivals can move by a day.</Text>
      </View>
    );
  };

  const renderMatchesCard = () => {
    if (!widgets?.matches?.length) return null; // the Matches tab is opened on purpose, so it no longer depends on the sports interest
    // only two here: live matches first, then the ones starting soonest, then the most recently finished.
    // The full list lives on the Matches page (arrow next to the title).
    const now = Date.now();
    const tm = (m) => (m.time ? Date.parse(m.time) : NaN);
    const rank = (m) => (m.state === 'live' ? 0 : m.state === 'upcoming' ? 1 : 2);
    const picked = [...widgets.matches]
      .sort((a, b) => {
        const ra = rank(a); const rb = rank(b);
        if (ra !== rb) return ra - rb;
        const ta = tm(a); const tb = tm(b);
        if (ra === 1) return (isNaN(ta) ? Infinity : Math.abs(ta - now)) - (isNaN(tb) ? Infinity : Math.abs(tb - now)); // soonest first
        if (ra === 2) return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta); // latest finished first
        return 0;
      })
      .slice(0, 6);
    return (
      <View key="matches" style={{ gap: 10 }}>
        {picked.map((mt, i) => <MatchCard key={mt.id || i} mt={mt} P={P} />)}
      </View>
    );
  };

  const renderQuakeCard = () => {
    const qk = widgets?.quakes?.[0];
    if (!qk) return null;
    return (
      <TouchableOpacity key="quake" activeOpacity={0.85} onPress={() => qk.url && setReader({ url: qk.url, title: 'Earthquake', source: 'USGS' })} style={[styles.listCard, styles.rowCard, { backgroundColor: P.card, borderColor: P.border }]}>
        <View style={[styles.rowIcon, { backgroundColor: '#EF444422' }]}><Ionicons name="pulse" size={22} color="#EF4444" /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.listTitle, { color: P.text }]}>Earthquake · M{Number(qk.mag).toFixed(1)}</Text>
          <Text style={{ color: P.sub, fontSize: 12.5, marginTop: 2 }} numberOfLines={2}>{qk.place}</Text>
          <Text style={{ color: P.sub, fontSize: 11.5, marginTop: 2 }}>{qk.km} km away · {timeAgo(qk.time)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Daily cards (ayah, dua, word, quote, recipe, fun fact, joke) ----------------
  const cardW = winW - 32;
  const shareText = (title, text) => setShareItem({ id: 'raw-' + title, title, source: '', category: null, rawText: text });

  // tap a card -> its own page with the whole text
  const openCard = (kind, item, colors, icon, label, shareTitle, shareBody) => navigation.navigate('DailyCard', { kind, item, colors, icon, label, shareTitle, shareText: shareBody });

  const renderQuran = (q, kind) => (q ? (
    <DailyShell width={cardW}
      key={kind}
      colors={kind === 'ayah' ? ['#0F766E', '#115E59'] : ['#0E7490', '#164E63']}
      icon={kind === 'ayah' ? 'book' : 'hand-left'}
      label={kind === 'ayah' ? 'Ayah of the day' : 'Dua of the day'}
      onPress={() => openCard(kind, q, kind === 'ayah' ? ['#0F766E', '#115E59'] : ['#0E7490', '#164E63'], kind === 'ayah' ? 'book' : 'hand-left', kind === 'ayah' ? 'Ayah of the day' : 'Dua of the day', kind === 'ayah' ? 'Ayah of the day' : 'Dua of the day', '📖 ' + q.surah + ' ' + q.ref + '\n\n' + q.arabic + '\n\n' + q.bangla + '\n\n' + q.english)}
      onShare={() => shareText(kind === 'ayah' ? 'Ayah of the day' : 'Dua of the day', '📖 ' + q.surah + ' ' + q.ref + '\n\n' + q.arabic + '\n\n' + q.bangla + '\n\n' + q.english)}
    >
      <Text style={styles.arabic} numberOfLines={6}>{q.arabic}</Text>
      <Text style={styles.dBangla} numberOfLines={3}>{q.bangla}</Text>
      <Text style={styles.dRef}>{q.surah} · {q.ref}</Text>
      <Text style={styles.dCredit}>{q.translator}</Text>
    </DailyShell>
  ) : null);

  const renderWord = (w) => (w ? (
    <DailyShell width={cardW} key="word" colors={['#4F46E5', '#7C3AED']} icon="text" label="Word of the day"
      onPress={() => openCard('word', w, ['#4F46E5', '#7C3AED'], 'text', 'Word of the day', 'Word of the day', '🔤 ' + w.word + (w.pos ? ' (' + w.pos + ')' : '') + '\n' + w.definition + (w.example ? '\n"' + w.example + '"' : ''))}
      onShare={() => shareText('Word of the day', '🔤 ' + w.word + (w.pos ? ' (' + w.pos + ')' : '') + '\n' + w.definition + (w.example ? '\n"' + w.example + '"' : ''))}>
      <Text style={styles.wordTitle}>{w.word}</Text>
      <Text style={styles.wordMeta}>{[w.pron ? '/' + w.pron + '/' : '', w.pos].filter(Boolean).join('  ·  ')}</Text>
      <Text style={styles.dBody} numberOfLines={4}>{w.definition}</Text>
      {w.example ? <Text style={styles.dExample} numberOfLines={3}>“{w.example}”</Text> : null}
      <Text style={styles.dCredit}>Merriam-Webster</Text>
    </DailyShell>
  ) : null);

  const renderQuote = (q) => (q ? (
    <DailyShell width={cardW} key="quote" colors={['#EA580C', '#DB2777']} icon="chatbox-ellipses" label="Quote of the day"
      onPress={() => openCard('quote', q, ['#EA580C', '#DB2777'], 'chatbox-ellipses', 'Quote of the day', 'Quote of the day', '“' + q.text + '”\n— ' + q.author)}
      onShare={() => shareText('Quote of the day', '“' + q.text + '”\n— ' + q.author)}>
      <Text style={styles.bigQuote}>“</Text>
      <Text style={styles.quoteText} numberOfLines={6}>{q.text}</Text>
      <Text style={styles.quoteAuthor}>— {q.author}</Text>
      <Text style={styles.dCredit}>{q.credit}</Text>
    </DailyShell>
  ) : null);

  const renderRecipe = (r) => (r ? (
    <TouchableOpacity key="recipe" activeOpacity={0.92} onPress={() => setRecipeOpen(true)} style={{ marginBottom: 12 }}>
      <View style={[styles.dCard, { width: cardW, padding: 0, overflow: 'hidden', backgroundColor: '#1F2937' }]}>
        {r.image ? <Image source={{ uri: r.image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" /> : null}
        <LinearGradient colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.88)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFillObject} />
        <View style={{ padding: 16, flex: 1, justifyContent: 'space-between' }}>
          <View style={styles.dHead}>
            <View style={styles.dLabelWrap}>
              <Ionicons name="restaurant" size={13} color="rgba(255,255,255,0.9)" />
              <Text style={styles.dLabel}>Recipe of the day</Text>
            </View>
            <TouchableOpacity onPress={() => shareText('Recipe of the day', '🍽️ ' + r.title + (r.category ? ' · ' + r.category : '') + '\n' + r.url)} style={styles.dShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="paper-plane" size={13} color="#FFF" />
            </TouchableOpacity>
          </View>
          <View>
            <Text style={styles.recipeTitle} numberOfLines={2}>{r.title}</Text>
            <Text style={styles.dCredit}>{[r.category, r.area].filter(Boolean).join(' · ')}  ·  {r.ingredients?.length || 0} ingredients</Text>
            <Text style={styles.recipeCta}>View recipe ›</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  ) : null);

  const renderFact = (f) => (f ? (
    <DailyShell width={cardW} key="fact" colors={['#D97706', '#B45309']} icon="bulb" label="Did you know?" onPress={() => openCard('fact', f, ['#D97706', '#B45309'], 'bulb', 'Did you know?', 'Fun fact', '💡 ' + f.text)} onShare={() => shareText('Fun fact', '💡 ' + f.text)}>
      <Text style={styles.factText} numberOfLines={7}>{f.text}</Text>
      {f.source ? <Text style={styles.dCredit}>Source: {f.source}</Text> : null}
    </DailyShell>
  ) : null);

  const renderJoke = (j) => (j ? (
    <DailyShell width={cardW} key="joke" colors={['#EC4899', '#F43F5E']} icon="happy" label="Just for a smile" onPress={() => openCard('joke', j, ['#EC4899', '#F43F5E'], 'happy', 'Just for a smile', 'Joke', '😄 ' + j.text)} onShare={() => shareText('Joke', '😄 ' + j.text)}>
      <Text style={styles.factText} numberOfLines={7}>{j.text}</Text>
    </DailyShell>
  ) : null);

  const renderDailyTab = (tab, full = true) => { // `tab` here is the page being built (every opened page stays mounted)
    const ex = { ...DEFAULT_PREFS.extras, ...(prefs?.extras || {}) };
    const nothing = !widgets && !daily;
    if (nothing) {
      if (error) {
        return (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: P.cardAlt }]}><Ionicons name="cloud-offline" size={34} color={P.sub} /></View>
            <Text style={[styles.emptyTitle, { color: P.text }]}>Couldn't load your daily</Text>
            <Text style={[styles.emptySub, { color: P.sub }]}>Check your connection and try again.</Text>
            <TouchableOpacity activeOpacity={0.85} onPress={() => { setError(false); loadFeed(prefs); }}>
              <LinearGradient colors={['#7C3AED', '#5B4BE8']} style={styles.retryBtn}><Ionicons name="refresh" size={16} color="#FFF" /><Text style={styles.retryText}>Try again</Text></LinearGradient>
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Skeleton dark={dark} style={{ flex: 1.25, height: 176, borderRadius: 22 }} />
            <Skeleton dark={dark} style={{ flex: 1, height: 176, borderRadius: 22 }} />
          </View>
          <Skeleton dark={dark} style={{ height: 130, borderRadius: 22, marginTop: 12 }} />
          <Skeleton dark={dark} style={{ height: 110, borderRadius: 22, marginTop: 12 }} />
        </View>
      );
    }

    // Only the open tab is built. Tabs whose content changes slowly (everything except Daily, which has clocks, and
    // Matches, which has live scores) are remembered, so going back to one is instant and nothing is rebuilt.
    const slow = full && tab !== 'daily' && tab !== 'matches';
    const depsNow = [daily, prefs, dark, cardW, city, wBase.current, error, articles, safetyFull];
    if (slow) {
      const hit = tabCache.current[tab];
      if (hit && hit.deps.length === depsNow.length && hit.deps.every((x, i) => x === depsNow[i])) return hit.el;
    }
    const isT = (k) => tab === k || (k === 'daily' && !['safety', 'markets', 'holidays', 'matches', 'inspiration', 'discover'].includes(tab));

    const nowTiles = isT('daily') ? [safe(renderWeatherTile), safe(renderAqiTile)].filter(Boolean) : [];
    const nowBlocks = isT('daily') ? [
      nowTiles.length ? <View key="wx" style={styles.tileRow}>{nowTiles}</View> : null,
      safe(renderForecastCard),
      safe(renderPrayerCard),
      safe(renderAlertCard),
      ex.sunmoon && safe(renderSunMoonCard),
      ex.uv && safe(renderUvTiles),
    ].filter(Boolean) : [];
    let safetyBlocks = ex.safety && isT('safety') ? (safe(renderSafetyBlocks) || []) : [];
    const calendar = ex.holidays && isT('holidays') ? safe(renderHolidayCard) : null;
    const markets = isT('markets') ? safe(renderMarketTiles) : null;
    const quakeCard = ex.safety && isT('safety') ? safe(renderQuakeCard) : null;
    {
      // at most 4 cards here: earthquake first, then the top alerts, then the river; the full list is on the Safety page
      const river = safetyBlocks.find((x) => x && x.key === 'river');
      const rest = safetyBlocks.filter((x) => x && x.key !== 'river');
      const room = Math.max(0, 4 - (quakeCard ? 1 : 0) - (river ? 1 : 0));
      safetyBlocks = [quakeCard, ...rest.slice(0, room), river].filter(Boolean);
    }
    const inspiration = tab !== 'inspiration' ? [] : [
      ex.ayah && safe(() => renderQuran(daily?.ayah, 'ayah')),
      ex.dua && safe(() => renderQuran(daily?.dua, 'dua')),
      ex.quote && safe(() => renderQuote(daily?.quote)),
      ex.word && safe(() => renderWord(daily?.word)),
    ].filter(Boolean);
    const discover = tab !== 'discover' ? [] : [
      ex.art && safe(renderArtCard),
      ex.recipe && safe(() => renderRecipe(daily?.recipe)),
      ex.fact && safe(() => renderFact(daily?.fact)),
      ex.joke && safe(() => renderJoke(daily?.joke)),
      safe(renderSpaceCard),
      safe(renderOnThisDayCard),
    ].filter(Boolean);

    // first build of a page: only the top few cards; the rest follows a moment later
    const part = (list) => (full ? list : list.slice(0, 2));
    // each tab shows only its own part of the old long Daily page
    let body = null;
    if (tab === 'safety') {
      const fullList = full ? safe(renderSafetyFull) : null;
      body = fullList
        ? (<><SectionTitle P={P} icon="warning" title="Safety watch" sub={'around ' + city.name} color="#DC2626" />{fullList}</>)
        : (safetyBlocks.length ? (<><SectionTitle P={P} icon="warning" title="Safety watch" color="#DC2626" /><View style={{ gap: 12 }}>{part(safetyBlocks)}</View></>) : null);
    } else if (tab === 'markets') {
      const mk = safe(renderMarketsFull);
      body = mk ? (<><SectionTitle P={P} icon="stats-chart" title="Markets" color="#F59E0B" />{mk}</>) : (markets ? (<><SectionTitle P={P} icon="stats-chart" title="Markets" color="#F59E0B" />{markets}</>) : null);
    } else if (tab === 'holidays') {
      const hl = ex.holidays ? safe(renderHolidaysFull) : null;
      body = hl ? (<><SectionTitle P={P} icon="calendar" title="Upcoming holidays" color="#0EA5E9" />{hl}</>) : (calendar ? (<><SectionTitle P={P} icon="calendar" title="Upcoming holidays" color="#0EA5E9" />{calendar}</>) : null);
    } else if (tab === 'matches') {
      // the whole Matches page lives here now (live list, filters, results); each match opens its own live page
      body = <MatchesPanel P={P} dark={dark} navigation={navigation} />;
    } else if (tab === 'inspiration') {
      body = inspiration.length ? (<><SectionTitle P={P} icon="sparkles" title="Daily inspiration" color="#10B981" /><View>{part(inspiration)}</View></>) : null;
    } else if (tab === 'discover') {
      body = discover.length ? (<><SectionTitle P={P} icon="compass" title="Discover" color="#7C3AED" /><View>{part(discover)}</View></>) : null;
    } else {
      body = nowBlocks.length ? (<><SectionTitle P={P} icon="sunny" title="Right now" sub={city.name} color="#38A3F5" /><View style={{ gap: 12 }}>{part(nowBlocks)}</View></>) : null;
    }
    const page = (
      <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
        {body || (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: P.cardAlt }]}><Ionicons name="file-tray-outline" size={32} color={P.sub} /></View>
            <Text style={[styles.emptyTitle, { color: P.text }]}>Nothing here right now</Text>
            <Text style={[styles.emptySub, { color: P.sub }]}>Pull down to refresh, or turn this on in your interests.</Text>
          </View>
        )}
        <Text style={[styles.credit, { color: P.sub }]}>Pull down to refresh. Daily cards change every day.</Text>
      </View>
    );
    if (slow) tabCache.current[tab] = { deps: depsNow, el: page };
    return page;
  };

  const renderRecipeSheet = () => {
    const r = daily?.recipe;
    return (
      <BottomSheet visible={recipeOpen && !!r} dark={dark} onClose={() => setRecipeOpen(false)} maxHeight="90%">
        {r ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            {r.image ? <Image source={{ uri: r.image }} style={styles.recipeImg} resizeMode="cover" /> : null}
            <Text style={[styles.recipeSheetTitle, { color: P.text }]}>{r.title}</Text>
            <Text style={{ color: P.sub, fontSize: 13, marginTop: 4 }}>{[r.category, r.area].filter(Boolean).join(' · ')}</Text>
            <Text style={[styles.pickerLabel, { color: P.sub }]}>Ingredients</Text>
            {r.ingredients.map((ing, i) => (
              <View key={i} style={[styles.ingRow, { borderBottomColor: P.border }]}>
                <Text style={[styles.ingName, { color: P.text }]}>{ing.name}</Text>
                <Text style={[styles.ingMeasure, { color: P.sub }]}>{ing.measure}</Text>
              </View>
            ))}
            <Text style={[styles.pickerLabel, { color: P.sub }]}>Method</Text>
            <Text style={{ color: P.text, fontSize: 14.5, lineHeight: 22 }}>{r.instructions}</Text>
            <View style={{ flexDirection: 'row', marginTop: 18, marginBottom: 8 }}>
              {r.video ? (
                <TouchableOpacity activeOpacity={0.85} style={{ flex: 1, marginRight: 8 }} onPress={() => { setRecipeOpen(false); setTimeout(() => setReader({ url: r.video, title: r.title, source: 'YouTube' }), 250); }}>
                  <View style={[styles.recipeBtn, { backgroundColor: '#EF4444' }]}><Ionicons name="logo-youtube" size={16} color="#FFF" /><Text style={styles.recipeBtnText}>Watch video</Text></View>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity activeOpacity={0.85} style={{ flex: 1 }} onPress={() => { setRecipeOpen(false); setTimeout(() => shareText('Recipe of the day', '🍽️ ' + r.title + '\n' + r.url), 250); }}>
                <LinearGradient colors={['#7C3AED', '#5B4BE8']} style={styles.recipeBtn}><Ionicons name="paper-plane" size={15} color="#FFF" /><Text style={styles.recipeBtnText}>Send to a friend</Text></LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : null}
      </BottomSheet>
    );
  };

  // Cards -----------------------------------------------------------------
  const renderShareBtn = (a) => (
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
        <StoryImage uri={a.image} cat={cat} fill />
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
      <TouchableOpacity key={a.id} activeOpacity={0.88} onPress={() => openArticle(a)} style={[styles.card, { backgroundColor: P.card, borderColor: P.border }, !dark && styles.cardLift]}>
        {/* top: who published it, and when */}
        <View style={styles.cardTopRow}>
          <View style={[styles.srcDot, { backgroundColor: (cat?.colors?.[0] || '#6366F1') + '26' }]}>
            <Text style={{ color: cat?.colors?.[0] || '#6366F1', fontSize: 11, fontWeight: '600' }}>{String(a.source || '?').trim().charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={[styles.cardSource, { color: P.text }]} numberOfLines={1}>{a.source}</Text>
          <Text style={[styles.cardTime, { color: P.sub }]}>· {timeAgo(a.publishedAt)}</Text>
          {!read ? <View style={[styles.unreadDot, { backgroundColor: P.accent }]} /> : null}
        </View>

        {/* middle: headline + short summary, picture on the right */}
        <View style={styles.cardMid}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.cardTitle, { color: read ? P.sub : P.text }]} numberOfLines={3}>{a.title}</Text>
            {a.summary ? <Text style={[styles.cardSummary, { color: P.sub }]} numberOfLines={2}>{a.summary}</Text> : null}
          </View>
          <StoryImage uri={a.image} cat={cat} style={[styles.thumb, { backgroundColor: P.cardAlt }]} />
        </View>

        {/* bottom: topic label + share */}
        <View style={styles.cardFoot}>
          <View style={[styles.topicTag, { backgroundColor: (cat?.colors?.[0] || '#6366F1') + '1A' }]}>
            <Ionicons name={cat?.icon || 'newspaper'} size={11} color={cat?.colors?.[0] || '#6366F1'} />
            <Text style={{ color: cat?.colors?.[0] || '#6366F1', fontSize: 11.5, fontWeight: '500', marginLeft: 5 }}>{cat?.label || 'News'}</Text>
          </View>
          {renderShareBtn(a)}
        </View>
      </TouchableOpacity>
    );
  };

  // Daily extras shown between stories -------------------------------------
  const renderSpaceCard = () => {
    const sp = widgets?.space;
    if (!sp?.image) return null;
    return (
      <TouchableOpacity key="extra-space" activeOpacity={0.92} onPress={() => setReader({ url: sp.url, title: sp.title, source: 'NASA' })} style={[styles.extraCard, { height: 230, backgroundColor: P.card }]}>
        <Image source={{ uri: sp.image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        <LinearGradient colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.88)']} locations={[0.1, 0.5, 1]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.extraTop}>
          <LinearGradient colors={['#6366F1', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.catChip}>
            <Ionicons name="planet" size={11} color="#FFF" />
            <Text style={styles.catChipText}>Space today</Text>
          </LinearGradient>
        </View>
        <View style={{ padding: 16 }}>
          <Text style={styles.extraTitle} numberOfLines={2}>{sp.title}</Text>
          {sp.caption ? <Text style={styles.extraCaption} numberOfLines={2}>{sp.caption}</Text> : null}
          <Text style={styles.extraCredit}>Photo: {sp.credit}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderOnThisDayCard = () => {
    const o = widgets?.onThisDay;
    if (!o) return null;
    return (
      <TouchableOpacity key="extra-otd" activeOpacity={o.url ? 0.9 : 1} onPress={() => o.url && setReader({ url: o.url, title: 'On this day', source: 'Wikipedia' })}>
        <LinearGradient colors={dark ? ['#2A2650', '#1B1838'] : ['#5B4BE8', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.otdCard}>
          <View style={{ flex: 1, paddingRight: o.image ? 12 : 0 }}>
            <View style={styles.otdHead}>
              <Ionicons name="time" size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.otdLabel}>On this day</Text>
            </View>
            <Text style={styles.otdYear}>{o.year}</Text>
            <Text style={styles.otdBody} numberOfLines={6}>{o.text}</Text>
            {o.url ? <Text style={styles.otdMore}>Read more on Wikipedia ›</Text> : null}
          </View>
          {o.image ? <Image source={{ uri: o.image, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) PriyoChat' } }} style={styles.otdImg} resizeMode="cover" /> : null}
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  // Story list with the two daily extras woven in (Space after ~3 stories, On this day after ~8)
  const renderStoryList = (list) => {
    const out = [];
    list.forEach((a, i) => {
      out.push(renderCard(a));
      if (i === 2) { const c = renderSpaceCard(); if (c) out.push(c); }
      if (i === 7) { const c = renderOnThisDayCard(); if (c) out.push(c); }
    });
    // short lists still get the extras at the end
    if (list.length < 3) { const c = renderSpaceCard(); if (c) out.push(c); }
    if (list.length < 8) { const c = renderOnThisDayCard(); if (c) out.push(c); }
    return out;
  };

  const renderSkeleton = () => (
    <View style={{ paddingHorizontal: 16 }}>
      <Skeleton dark={dark} style={{ height: 190, borderRadius: 22, marginBottom: 14 }} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
          <View style={styles.cardTopRow}>
            <Skeleton dark={dark} style={{ width: 22, height: 22, borderRadius: 11, marginRight: 8 }} />
            <Skeleton dark={dark} style={{ height: 12, width: 110 }} />
          </View>
          <View style={styles.cardMid}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Skeleton dark={dark} style={{ height: 16, marginBottom: 8 }} />
              <Skeleton dark={dark} style={{ height: 16, marginBottom: 8 }} />
              <Skeleton dark={dark} style={{ height: 16, width: '60%' }} />
            </View>
            <Skeleton dark={dark} style={{ width: 104, height: 96, borderRadius: 16 }} />
          </View>
          <Skeleton dark={dark} style={{ height: 22, width: 90, borderRadius: 11, marginTop: 12 }} />
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
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
        <View style={styles.pickerHead}>
          <LinearGradient colors={['#7C3AED', '#5B4BE8']} style={styles.pickerIcon}>
            <Ionicons name="sparkles" size={22} color="#FFF" />
          </LinearGradient>
          <Text style={[styles.pickerTitle, { color: P.text }]}>{prefs?.onboarded ? 'Your interests' : 'Make your feed yours'}</Text>
          <Text style={[styles.pickerSub, { color: P.sub }]}>Pick what you like. We'll build a short daily read for you.</Text>
        </View>

        <PickHead P={P} icon="albums-outline" title="Topics" sub="What you want to read in News" right={draft.interests.length + ' selected'} />
        {FEED_GROUPS.map((g) => {
          const inGroup = FEED_CATEGORIES.filter((c) => c.group === g.id);
          const picked = inGroup.filter((c) => draft.interests.includes(c.id)).length;
          return (
            <View key={g.id} style={{ marginBottom: 6 }}>
              <View style={styles.groupHead}>
                <Ionicons name={g.icon} size={14} color={P.sub} />
                <Text style={[styles.groupLabel, { color: P.sub }]}>{g.label}</Text>
                {picked ? <Text style={[styles.groupCount, { color: P.accent }]}>{picked}</Text> : null}
              </View>
        <View style={styles.chipWrap}>
          {inGroup.map((c) => {
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
                  <View style={[styles.interestChip, { backgroundColor: P.cardAlt, borderColor: P.border }]}>
                    <Ionicons name={c.icon} size={15} color={P.sub} />
                    <Text style={[styles.interestText, { color: P.text }]}>{c.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
            </View>
          );
        })}

        <PickHead P={P} icon="create-outline" title="My own topics" sub="Type anything: VLSI design, Tesla, ফ্রিল্যান্সিং…" right={(draft.customTopics || []).length + '/5'} />
        <View style={[styles.customRow, { backgroundColor: P.cardAlt, borderColor: P.border }]}>
          <Ionicons name="search" size={16} color={P.sub} />
          <TextInput
            value={customText}
            onChangeText={setCustomText}
            onSubmitEditing={addCustomTopic}
            placeholder="Add a topic you care about"
            placeholderTextColor={P.sub}
            maxLength={40}
            returnKeyType="done"
            style={[styles.customInput, { color: P.text }]}
          />
          <TouchableOpacity onPress={addCustomTopic} disabled={customText.trim().length < 2 || (draft.customTopics || []).length >= 5} style={[styles.customAdd, { backgroundColor: P.accent, opacity: customText.trim().length < 2 || (draft.customTopics || []).length >= 5 ? 0.4 : 1 }]}>
            <Ionicons name="add" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
        {(draft.customTopics || []).length ? (
          <View style={[styles.chipWrap, { marginTop: 10 }]}>
            {(draft.customTopics || []).map((t) => (
              <View key={t} style={[styles.interestChip, { backgroundColor: P.accent + '1F', borderColor: P.accent + '55', marginRight: 8, marginBottom: 8 }]}>
                <Ionicons name="bookmark" size={14} color={P.accent} />
                <Text style={[styles.interestText, { color: P.text }]}>{t}</Text>
                <TouchableOpacity onPress={() => removeCustomTopic(t)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={P.sub} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        <PickHead P={P} icon="sparkles-outline" title="Daily extras" sub="Cards you want on your Daily page" right={DAILY_EXTRAS.filter((e) => ({ ...DEFAULT_PREFS.extras, ...(draft.extras || {}) })[e.id]).length + ' on'} />
        <View style={styles.chipWrap}>
          {DAILY_EXTRAS.map((e) => {
            const on = ({ ...DEFAULT_PREFS.extras, ...(draft.extras || {}) })[e.id];
            return (
              <TouchableOpacity key={e.id} activeOpacity={0.8} onPress={() => toggleExtra(e.id)} style={{ marginRight: 8, marginBottom: 8 }}>
                {on ? (
                  <LinearGradient colors={['#7C3AED', '#5B4BE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.interestChip}>
                    <Ionicons name={e.icon} size={15} color="#FFF" />
                    <Text style={[styles.interestText, { color: '#FFF' }]}>{e.label}</Text>
                    <Ionicons name="checkmark" size={14} color="#FFF" />
                  </LinearGradient>
                ) : (
                  <View style={[styles.interestChip, { backgroundColor: P.cardAlt, borderColor: P.border }]}>
                    <Ionicons name={e.icon} size={15} color={P.sub} />
                    <Text style={[styles.interestText, { color: P.text }]}>{e.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <PickHead P={P} icon="location-outline" title="Your location" sub="For weather, prayer times and air quality" />
        <TouchableOpacity activeOpacity={0.85} onPress={useMyLocation} style={{ marginBottom: 12 }}>
          {draft.useGps ? (
            <LinearGradient colors={['#7C3AED', '#5B4BE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gpsBtn}>
              <Ionicons name="location" size={18} color="#FFF" />
              <Text style={[styles.gpsText, { color: '#FFF' }]} numberOfLines={1}>{draft.placeName || 'Your location'}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5 }}>{locBusy ? 'Updating…' : 'Tap to update'}</Text>
            </LinearGradient>
          ) : (
            <View style={[styles.gpsBtn, { backgroundColor: P.cardAlt }]}>
              <Ionicons name="locate" size={18} color={P.accent} />
              <Text style={[styles.gpsText, { color: P.text }]}>{locBusy ? 'Finding you…' : 'Use my current location'}</Text>
            </View>
          )}
        </TouchableOpacity>
        {locNote ? (
          <View style={{ marginTop: -4, marginBottom: 12, paddingHorizontal: 4 }}>
            <Text style={{ color: locNote.tone === 'warn' ? '#D97706' : '#10B981', fontSize: 13, lineHeight: 18 }}>{locNote.text}</Text>
            {locNote.settings ? (
              <TouchableOpacity onPress={() => Linking.openSettings()} style={{ marginTop: 6 }}>
                <Text style={{ color: P.accent, fontSize: 13, fontWeight: '600' }}>Open app settings ›</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        <View style={styles.chipWrap}>
          {FEED_CITIES.map((c) => {
            const on = !draft.useGps && draft.city === c.name;
            return (
              <TouchableOpacity key={c.name} activeOpacity={0.8} onPress={() => setDraft((d) => ({ ...d, city: c.name, useGps: false, cityChosen: true }))}
                style={[styles.cityChip, { backgroundColor: on ? P.accent : 'transparent', borderColor: on ? P.accent : P.border }]}>
                {on ? <Ionicons name="checkmark" size={13} color="#FFF" style={{ marginRight: 4 }} /> : null}
                <Text style={{ fontSize: 13, fontWeight: '500', color: on ? '#FFF' : P.text }}>{c.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <TouchableOpacity activeOpacity={0.85} onPress={savePrefs} style={{ marginTop: 10 }}>
        <LinearGradient colors={['#7C3AED', '#5B4BE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtn}>
          <Text style={styles.saveText}>{(prefs?.onboarded ? 'Save' : 'Show my feed') + ' · ' + (draft.interests.length + (draft.customTopics || []).length) + (draft.interests.length + (draft.customTopics || []).length === 1 ? ' topic' : ' topics')}</Text>
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
          <Text style={[styles.pickerLabel, { color: P.sub, marginTop: 14 }]}>Send to</Text>
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
            <Text style={{ color: P.accent, fontWeight: '600', marginLeft: 6 }}>More apps…</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </BottomSheet>
  );

  const renderNewsTab = (full = true) => (
    <>
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
            {topic ? (
              <TouchableOpacity activeOpacity={0.85} onPress={() => selectTopic(null)} style={{ marginTop: 14 }}>
                <LinearGradient colors={['#7C3AED', '#5B4BE8']} style={styles.retryBtn}><Ionicons name="apps" size={16} color="#FFF" /><Text style={styles.retryText}>Show all topics</Text></LinearGradient>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {articles && articles.length > 0 ? (
          <View style={{ marginTop: 22 }}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: P.text }]}>Today for you</Text>
              <TouchableOpacity ref={topicBtnRef} collapsable={false} activeOpacity={0.8} onPress={openTopicMenu} style={[styles.topicBtn, { backgroundColor: P.cardAlt, borderColor: P.border }]}>
                <Ionicons name={topic && CATEGORY_BY_ID[topic] ? CATEGORY_BY_ID[topic].icon : 'apps'} size={13} color={topic && CATEGORY_BY_ID[topic] ? CATEGORY_BY_ID[topic].colors[0] : P.accent} />
                <Text style={[styles.topicBtnText, { color: P.text }]} numberOfLines={1}>{topic && CATEGORY_BY_ID[topic] ? CATEGORY_BY_ID[topic].label : 'All topics'}</Text>
                <Ionicons name="chevron-down" size={14} color={P.sub} />
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 16 }}>
              {hero ? renderHero(hero) : null}
              {renderStoryList(full ? rest : rest.slice(0, 2))}
            </View>

            {hasMore || !exhausted ? (
              <View style={styles.moreWrap}>
                <ActivityIndicator color={P.accent} />
                <Text style={[styles.moreText, { color: P.sub }]}>{loadingMore ? (hasMore ? 'Loading more stories…' : 'Finding fresh stories…') : 'Keep scrolling for more'}</Text>
              </View>
            ) : (
            <View style={styles.endWrap}>
              <LinearGradient colors={['#34D399', '#10B981']} style={styles.endIcon}>
                <Ionicons name="checkmark" size={30} color="#FFF" />
              </LinearGradient>
              <Text style={[styles.endTitle, { color: P.text }]}>You're all caught up</Text>
              <Text style={[styles.endSub, { color: P.sub }]}>Nothing new right now. Fresh stories arrive through the day.</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => refillFeed(true)} disabled={loadingMore} style={{ marginBottom: 10 }}>
                <LinearGradient colors={['#7C3AED', '#5B4BE8']} style={styles.retryBtn}>
                  {loadingMore ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="refresh" size={16} color="#FFF" />}
                  <Text style={styles.retryText}>Load fresh stories</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.8} onPress={openPicker} style={[styles.editBtn, { backgroundColor: P.cardAlt }]}>
                <Ionicons name="options" size={15} color={P.accent} />
                <Text style={{ color: P.accent, fontWeight: '600', marginLeft: 6 }}>Edit my interests</Text>
              </TouchableOpacity>
              <Text style={[styles.credit, { color: P.sub }]}>Headlines from their original publishers. Tap a story to read it at the source.</Text>
            </View>
            )}
          </View>
        ) : null}
    </>
  );

  const renderTabs = () => <FeedTabs onChange={switchTab} P={P} />;

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
        {renderTabs()}

        {offline && articles ? (
          <View style={[styles.offlineBar, { backgroundColor: dark ? '#2A2113' : '#FFF6E0' }]}>
            <Ionicons name="cloud-offline" size={14} color="#D97706" />
            <Text style={styles.offlineText}>You're offline — showing your last update</Text>
          </View>
        ) : null}

        {FEED_TABS.map(([k]) => (
          <Pane
            key={k}
            active={tab === k}
            sub={P.sub}
            text={P.text}
            render={(full) => (k === 'news' ? renderNewsTab(full) : renderDailyTab(k, full))}
            deps={k === 'news'
              ? [articles, readIds, topic, hasMore, exhausted, loadingMore, error, showSkeleton, prefs, widgets, daily, dark, winW, offline]
              : [daily, widgets, prefs, dark, winW, city, error, articles, safetyFull, Math.floor(Date.now() / 60000)]}
            fallback={(
              <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
                <Skeleton dark={dark} style={{ height: 150, borderRadius: 22 }} />
                <Skeleton dark={dark} style={{ height: 110, borderRadius: 22, marginTop: 12 }} />
              </View>
            )}
          />
        ))}
      </ScrollView>

      <StuckTabs onChange={switchTab} P={P} />
      <GoTopFab onPress={scrollToTop} />

      {renderPicker()}
      {/* small drop-down for choosing one News topic */}
      <Modal visible={!!topicMenu} transparent animationType="fade" onRequestClose={() => setTopicMenu(null)} statusBarTranslucent>
        <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={() => setTopicMenu(null)}>
          {topicMenu ? (
            <View style={[styles.topicMenu, { top: topicMenu.y, right: Math.max(12, winW - (topicMenu.x + topicMenu.w)), backgroundColor: P.card, borderColor: P.border }]}>
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                {[{ id: null, label: 'All topics', icon: 'apps', colors: [P.accent, P.accent] }, ...((prefs?.interests || []).map((id) => CATEGORY_BY_ID[id]).filter(Boolean)), ...((prefs?.customTopics || []).map((t) => CATEGORY_BY_ID['my:' + t]))].map((c) => {
                  const on = (c.id || null) === (topic || null);
                  return (
                    <TouchableOpacity key={c.id || 'all'} activeOpacity={0.7} onPress={() => selectTopic(c.id)} style={[styles.topicItem, on && { backgroundColor: P.accent + '14' }]}>
                      <View style={[styles.topicDot, { backgroundColor: c.colors[0] + '22' }]}><Ionicons name={c.icon} size={14} color={c.colors[0]} /></View>
                      <Text style={[styles.topicItemText, { color: P.text }]} numberOfLines={1}>{c.label}</Text>
                      {on ? <Ionicons name="checkmark" size={16} color={P.accent} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </TouchableOpacity>
      </Modal>
      {renderShare()}
      {renderRecipeSheet()}
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
  headerTitle: { color: '#FFF', fontSize: 26, fontWeight: '600', letterSpacing: -0.4 },
  betaPill: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.14)' },
  betaText: { color: '#FFF', fontSize: 11.5, fontWeight: '600', letterSpacing: 0 },
  hello: { color: '#FFF', fontSize: 19, fontWeight: '500', marginTop: 18 },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dateText: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '400' },
  streakPill: { flexDirection: 'row', alignItems: 'center', marginLeft: 10, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.22)' },
  streakText: { color: '#FFF', fontSize: 12, fontWeight: '500', marginLeft: 4 },

  offlineBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 14, paddingVertical: 8, borderRadius: 12 },
  offlineText: { color: '#B45309', fontSize: 12.5, fontWeight: '600', marginLeft: 6 },

  widgetRow: { paddingHorizontal: 16 },
  widget: { width: 160, height: 150, borderRadius: 22, padding: 14, marginRight: 12 },
  widgetWide: { width: 250 },
  widgetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  widgetLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' },
  miniIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  bigTemp: { color: '#FFF', fontSize: 46, fontWeight: '300', marginTop: 6, letterSpacing: -2 },
  widgetSub: { color: '#FFF', fontSize: 14, fontWeight: '500', marginTop: -2 },
  widgetFoot: { color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 6, fontWeight: '400' },
  prayerName: { color: '#FFF', fontSize: 22, fontWeight: '600', marginTop: 12 },
  prayerTime: { color: '#FFF', fontSize: 26, fontWeight: '300', marginTop: 0 },
  rateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 },
  rateK: { fontSize: 13, fontWeight: '400' },
  rateV: { fontSize: 15, fontWeight: '400' },
  spaceTitle: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  otdText: { fontSize: 13, lineHeight: 19, marginTop: 10, fontWeight: '500' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3 },
  sectionCount: { fontSize: 12.5, fontWeight: '400' },

  catChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  catChipText: { color: '#FFF', fontSize: 11.5, fontWeight: '500', marginLeft: 4 },

  hero: { borderRadius: 24, overflow: 'hidden', marginBottom: 14, justifyContent: 'space-between' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  heroShare: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  heroBottom: { padding: 16 },
  heroTitle: { color: '#FFF', fontSize: 21, fontWeight: '600', lineHeight: 28, letterSpacing: -0.2 },
  heroMeta: { color: 'rgba(255,255,255,0.82)', fontSize: 12.5, marginTop: 8, fontWeight: '400' },

  card: { borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, marginBottom: 14 },
  cardLift: { shadowColor: '#1E2A4A', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  srcDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, marginLeft: 'auto' },
  cardMid: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTime: { fontSize: 12, fontWeight: '400', marginLeft: 5 },
  cardTitle: { fontSize: 15.5, fontWeight: '500', lineHeight: 22 },
  cardSummary: { fontSize: 13, lineHeight: 19, marginTop: 6, fontWeight: '400' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  topicTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 11 },
  cardSource: { fontSize: 12.5, fontWeight: '500', flexShrink: 1 },
  shareBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 104, height: 96, borderRadius: 16 },

  gpsBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderRadius: 18 },
  gpsText: { flex: 1, marginLeft: 10, fontSize: 14.5, fontWeight: '500' },
  glassIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  meterHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  meterLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '400' },
  meterValue: { color: '#FFF', fontSize: 15, fontWeight: '500' },
  meterUnit: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '400' },
  meterTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 6, overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3 },
  meterLevel: { fontSize: 11, fontWeight: '500', marginTop: 4 },
  fcRow: { flexDirection: 'row', justifyContent: 'space-between' },
  fcCol: { flex: 1, alignItems: 'center' },
  sunCard: { borderRadius: 24, paddingTop: 12, paddingBottom: 12, paddingHorizontal: 14, overflow: 'hidden' },
  sunTimes: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  sunMid: { color: 'rgba(255,255,255,0.88)', fontSize: 11, fontWeight: '400' },
  sunRow: { flexDirection: 'row', alignItems: 'flex-start' },
  sunCol: { flex: 1, alignItems: 'center' },
  sunTime: { color: 'rgba(255,255,255,0.95)', fontSize: 13, fontWeight: '400', letterSpacing: 0.3 },
  sunLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '400', marginTop: 1, letterSpacing: 0.2 },
  moonEmoji: { fontSize: 36, lineHeight: 44 },
  moonName: { color: '#FFF', fontSize: 14, fontWeight: '600', marginTop: 2 },
  sunFoot: { textAlign: 'center', color: 'rgba(255,255,255,0.82)', fontSize: 12.5, fontWeight: '400', marginTop: 10 },
  levelPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 },
  levelPillText: { color: '#FFF', fontSize: 11.5, fontWeight: '600', letterSpacing: 0 },
  riverCard: { borderRadius: 22, paddingVertical: 12, paddingHorizontal: 14, overflow: 'hidden' },
  riverTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  riverTitle: { color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '500' },
  riverChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)' },
  riverChipText: { color: '#FFF', fontSize: 12, fontWeight: '500', marginLeft: 5 },
  riverBig: { flexDirection: 'row', alignItems: 'baseline', marginTop: 0 },
  riverNum: { color: '#FFF', fontSize: 30, fontWeight: '300', letterSpacing: -1, lineHeight: 36 },
  riverUnit: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '400', marginLeft: 6 },
  riverBars: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: 6 },
  riverCol: { flex: 1, alignItems: 'center', minWidth: 0 },
  riverDay: { color: 'rgba(255,255,255,0.7)', fontSize: 10.5, fontWeight: '400', marginTop: 3 },
  riverFoot: { color: 'rgba(255,255,255,0.7)', fontSize: 10, lineHeight: 13, marginTop: 6 },
  sparkRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, gap: 6 },
  sparkCol: { flex: 1, alignItems: 'center', minWidth: 0 },
  holRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  holBadge: { width: 42, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  holMon: { color: 'rgba(255,255,255,0.9)', fontSize: 9.5, fontWeight: '500', letterSpacing: 0.4 },
  holDay: { color: '#FFF', fontSize: 17, fontWeight: '500', lineHeight: 20 },
  artCard: { height: 300, borderRadius: 24, overflow: 'hidden', justifyContent: 'space-between' },
  artImg: { ...StyleSheet.absoluteFillObject },
  artShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 150 },
  artTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  artInfo: { padding: 16 },
  artTitle: { color: '#FFF', fontSize: 18, fontWeight: '600', lineHeight: 24 },
  artArtist: { color: 'rgba(255,255,255,0.9)', fontSize: 13.5, fontWeight: '400', marginTop: 3 },
  tabsBar: { paddingHorizontal: 16, paddingBottom: 10 },
  tabsTrack: { flexDirection: 'row', alignSelf: 'center', borderRadius: 19, padding: 3 },
  tabItem: { flex: 1 },
  mktRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  mktCode: { minWidth: 46, paddingHorizontal: 8, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  holHero: { borderRadius: 24, padding: 18, overflow: 'hidden', marginTop: 4 },
  holHeroPill: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  holGroup: { fontSize: 12, fontWeight: '500', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  safeHead: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 10, marginVertical: 0 },
  safeTitle: { flex: 1, fontSize: 16, fontWeight: '600', letterSpacing: -0.2, marginLeft: 9 },
  magBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 0 },
  tabChip: { borderRadius: 17, paddingHorizontal: 13, paddingVertical: 7 },
  tabPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 13, fontWeight: '500', marginLeft: 6, letterSpacing: 0.2 },
  tile: { borderRadius: 24, padding: 15, overflow: 'hidden', minWidth: 0 },
  tileRow: { flexDirection: 'row', gap: 12 },
  dSecHead: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 12 },
  sevenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 18, marginTop: 8 },
  dSecMore: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  dSecIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dSecTitle: { fontSize: 18, fontWeight: '600', letterSpacing: -0.2, marginLeft: 10, flex: 1 },
  dSecSub: { fontSize: 11, fontWeight: '400', opacity: 0.85 },
  listCard: { borderRadius: 22, borderWidth: 1, padding: 14 },
  rowCard: { flexDirection: 'row', alignItems: 'center' },
  rowIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  listTitle: { fontSize: 15, fontWeight: '600' },
  prayerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  prayerRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 6 },
  prayerCell: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 14 },
  matchCard: { borderRadius: 20, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16 },
  mHead: { flexDirection: 'row', alignItems: 'center' },
  mLeague: { flex: 1, fontSize: 11, marginLeft: 6, marginRight: 8 },
  mChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  mBoard: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  mTeam: { flex: 1, alignItems: 'center' },
  mName: { fontSize: 12.5, marginTop: 8, textAlign: 'center', lineHeight: 16 },
  mCenter: { minWidth: 92, alignItems: 'center', paddingHorizontal: 4 },
  mScore: { fontSize: 28, fontWeight: '300', letterSpacing: -0.5 },
  mTime: { fontSize: 19, fontWeight: '400' },
  mSub: { fontSize: 11, marginTop: 2 },
  cRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  cName: { flex: 1, fontSize: 14, marginLeft: 10, marginRight: 8 },
  cScore: { fontSize: 14, maxWidth: '58%', textAlign: 'right' },
  mMore: { alignItems: 'center', paddingVertical: 8 },
  teamRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444', marginRight: 5 },
  matchLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  sportDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  aqiNum: { color: '#FFF', fontSize: 40, fontWeight: '500', marginTop: 6, letterSpacing: -1 },
  aqiAdvice: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5, lineHeight: 15, marginTop: 4, fontWeight: '400' },
  alertTitle: { color: '#FFF', fontSize: 15, fontWeight: '600', marginTop: 10, lineHeight: 20 },
  quakeMag: { fontSize: 32, fontWeight: '500', marginTop: 6, letterSpacing: -0.8 },
  matchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 9 },
  matchTeams: { flex: 1, fontSize: 13.5, fontWeight: '500', marginHorizontal: 7 },
  matchTime: { fontSize: 12.5, fontWeight: '600' },
  dCard: { minHeight: 232, borderRadius: 26, padding: 18, overflow: 'hidden' },
  dHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dLabelWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  dIconDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  dLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '500', marginLeft: 8, flexShrink: 1, letterSpacing: 0.3 },
  dShare: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  dMore: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 14 },
  dMoreText: { color: 'rgba(255,255,255,0.92)', fontSize: 12.5, fontWeight: '500', marginRight: 5 },
  dRule: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.28)', marginTop: 12 },
  arabic: { color: '#FFF', fontSize: 22, lineHeight: 40, textAlign: 'right', writingDirection: 'rtl', marginTop: 14 },
  dBangla: { color: 'rgba(255,255,255,0.96)', fontSize: 15, lineHeight: 24, marginTop: 10, fontWeight: '400' },
  dRef: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '500', marginTop: 20 },
  dCredit: { color: 'rgba(255,255,255,0.68)', fontSize: 12, marginTop: 4, fontWeight: '400' },
  dBody: { color: 'rgba(255,255,255,0.96)', fontSize: 15, lineHeight: 22, marginTop: 10, fontWeight: '400' },
  dExample: { color: 'rgba(255,255,255,0.86)', fontSize: 13.5, lineHeight: 20, marginTop: 8, fontStyle: 'italic', fontWeight: '400' },
  wordTitle: { color: '#FFF', fontSize: 32, fontWeight: '600', letterSpacing: -0.6, marginTop: 12 },
  wordMeta: { color: 'rgba(255,255,255,0.82)', fontSize: 13.5, fontStyle: 'italic', marginTop: 2, fontWeight: '400' },
  bigQuote: { color: 'rgba(255,255,255,0.35)', fontSize: 64, lineHeight: 64, fontWeight: '600', marginTop: 6, marginBottom: -18 },
  quoteText: { color: '#FFF', fontSize: 19, lineHeight: 28, fontWeight: '500', fontStyle: 'italic' },
  quoteAuthor: { color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '500', marginTop: 10 },
  factText: { color: '#FFF', fontSize: 17.5, lineHeight: 26, fontWeight: '500', marginTop: 16 },
  recipeTitle: { color: '#FFF', fontSize: 21, fontWeight: '600', lineHeight: 27 },
  recipeCta: { color: '#FFF', fontSize: 13.5, fontWeight: '500', marginTop: 8 },
  recipeImg: { width: '100%', height: 190, borderRadius: 20, marginBottom: 14 },
  recipeSheetTitle: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  ingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  ingName: { fontSize: 14.5, fontWeight: '600', flex: 1, marginRight: 10 },
  ingMeasure: { fontSize: 13.5, fontWeight: '600' },
  recipeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 18 },
  recipeBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600', marginLeft: 6 },
  extraCard: { borderRadius: 24, overflow: 'hidden', marginBottom: 14, justifyContent: 'space-between' },
  extraTop: { padding: 14, flexDirection: 'row' },
  extraTitle: { color: '#FFF', fontSize: 18, fontWeight: '600', lineHeight: 24 },
  extraCaption: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18, marginTop: 5, fontWeight: '400' },
  extraCredit: { color: 'rgba(255,255,255,0.65)', fontSize: 11.5, marginTop: 6, fontWeight: '500' },
  otdCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 24, padding: 18, marginBottom: 14 },
  otdHead: { flexDirection: 'row', alignItems: 'center' },
  otdLabel: { color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: '500', marginLeft: 6 },
  otdYear: { color: '#FFF', fontSize: 38, fontWeight: '500', letterSpacing: -1.2, marginTop: 6 },
  otdBody: { color: 'rgba(255,255,255,0.94)', fontSize: 14.5, lineHeight: 21, marginTop: 4, fontWeight: '400' },
  otdMore: { color: 'rgba(255,255,255,0.8)', fontSize: 12.5, fontWeight: '500', marginTop: 10 },
  otdImg: { width: 92, height: 120, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)' },
  moreWrap: { alignItems: 'center', paddingVertical: 26 },
  moreText: { fontSize: 12.5, fontWeight: '600', marginTop: 8 },
  fab: { position: 'absolute', right: 18, bottom: 92, elevation: 8, shadowColor: '#5B4BE8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, borderRadius: 26 },
  fabInner: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  endWrap: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 22, paddingBottom: 10 },
  endIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  endTitle: { fontSize: 19, fontWeight: '600' },
  endSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 6 },
  editBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18, marginTop: 16 },
  credit: { fontSize: 11.5, textAlign: 'center', marginTop: 22, opacity: 0.8 },

  emptyWrap: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 50 },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptySub: { fontSize: 14, textAlign: 'center', marginTop: 6 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 22, marginTop: 20 },
  retryText: { color: '#FFF', fontWeight: '600', marginLeft: 6 },

  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingBottom: 26, paddingTop: 10, elevation: 24 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 14 },

  pickerHead: { alignItems: 'center', marginBottom: 6 },
  pickerIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  pickerTitle: { fontSize: 20, fontWeight: '600' },
  pickerSub: { fontSize: 13.5, textAlign: 'center', marginTop: 4, lineHeight: 19 },
  pickerLabel: { fontSize: 13, fontWeight: '500', marginTop: 20, marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  pickHead: { flexDirection: 'row', alignItems: 'center', marginTop: 26, marginBottom: 12 },
  topicBtn: { flexDirection: 'row', alignItems: 'center', maxWidth: 190, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  topicBtnText: { fontSize: 12.5, fontWeight: '500', marginHorizontal: 6, flexShrink: 1 },
  topicMenu: { position: 'absolute', width: 230, borderRadius: 18, borderWidth: 1, paddingVertical: 6, elevation: 14, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  topicItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: 6, borderRadius: 12 },
  topicDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  topicItemText: { flex: 1, fontSize: 14, fontWeight: '400', marginLeft: 10 },
  customRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingLeft: 12, paddingRight: 6, paddingVertical: 6 },
  customInput: { flex: 1, fontSize: 14.5, paddingVertical: 6, paddingHorizontal: 10 },
  customAdd: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  groupHead: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  groupLabel: { fontSize: 12, fontWeight: '500', letterSpacing: 0.4, marginLeft: 6, textTransform: 'uppercase' },
  groupCount: { fontSize: 11.5, fontWeight: '600', marginLeft: 8 },
  pickHeadIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pickHeadTitle: { fontSize: 15, fontWeight: '500' },
  pickHeadSub: { fontSize: 12, marginTop: 1 },
  pickCount: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 11 },
  interestChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: 'transparent' },
  interestText: { fontSize: 14, fontWeight: '400', marginHorizontal: 7 },
  segment: { flexDirection: 'row', borderRadius: 16, padding: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  segText: { fontSize: 13.5, fontWeight: '500' },
  hint: { fontSize: 11.5, marginTop: 8, lineHeight: 16 },
  cityChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1, marginRight: 8, marginBottom: 8 },
  saveBtn: { borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingVertical: 15 },
  saveText: { color: '#FFF', fontSize: 15.5, fontWeight: '500', letterSpacing: 0.2 },

  sharePreview: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 18 },
  sharePreviewIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sharePreviewTitle: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  shareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  shareAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  shareName: { flex: 1, fontSize: 15.5, fontWeight: '600' },
  sendPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  sendPillText: { color: '#FFF', fontSize: 13, fontWeight: '600', marginLeft: 5 },
  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },

  toast: { position: 'absolute', bottom: 96, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(20,22,28,0.95)', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22 },
  toastText: { color: '#FFF', fontSize: 13.5, fontWeight: '600', marginLeft: 8 },
});
