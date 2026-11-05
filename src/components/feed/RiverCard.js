import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import useThemeStore from '../../store/useThemeStore';

// River flow: a water-coloured card with the current flow, a trend tag and a smooth 7-day line chart.
// rv: { now, series: number[], peak, change, trend: 'Steady' | 'Rising' | 'Rising fast' | 'Falling' }

// Smooth line + soft filled area for a short series. "Now" is the big ringed dot.
export function RiverChart({ series, width, height = 78, labels, dark }) {
  const n = series.length;
  if (!width || n < 2) return <View style={{ height }} />;
  const padX = 10;
  const padTop = 12;
  const padBottom = 8;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const flat = max - min < Math.max(max, 0.0001) * 0.02;
  const xs = series.map((_, i) => padX + (i * (width - padX * 2)) / (n - 1));
  const ys = series.map((v) => {
    const t = flat ? 0.5 : (v - min) / (max - min);
    return padTop + (1 - t) * (height - padTop - padBottom);
  });
  // smooth curve through the points (Catmull-Rom converted to cubic Béziers)
  let d = 'M ' + xs[0] + ' ' + ys[0];
  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? i - 1 : i;
    const p3 = i + 2 < n ? i + 2 : i + 1;
    const c1x = xs[i] + (xs[i + 1] - xs[p0]) / 6;
    const c1y = ys[i] + (ys[i + 1] - ys[p0]) / 6;
    const c2x = xs[i + 1] - (xs[p3] - xs[i]) / 6;
    const c2y = ys[i + 1] - (ys[p3] - ys[i]) / 6;
    d += ' C ' + c1x + ' ' + c1y + ', ' + c2x + ' ' + c2y + ', ' + xs[i + 1] + ' ' + ys[i + 1];
  }
  const area = d + ' L ' + xs[n - 1] + ' ' + height + ' L ' + xs[0] + ' ' + height + ' Z';
  return (
    <View style={{ width, height: height + 18 }}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgGradient id="riverFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={dark ? 0.2 : 0.38} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </SvgGradient>
        </Defs>
        <Path d={area} fill="url(#riverFill)" />
        <Path d={d} stroke={dark ? '#E0F2FE' : '#FFFFFF'} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {xs.map((x, i) => (i === 0 ? null : <Circle key={i} cx={x} cy={ys[i]} r={2.6} fill="#FFFFFF" opacity={0.75} />))}
        <Circle cx={xs[0]} cy={ys[0]} r={9} fill="#FFFFFF" opacity={0.22} />
        <Circle cx={xs[0]} cy={ys[0]} r={4.8} fill="#FFFFFF" />
      </Svg>
      {labels.map((l, i) => (
        <Text key={i} style={{ position: 'absolute', top: height + 2, left: xs[i] - 16, width: 32, textAlign: 'center', color: i === 0 ? '#FFFFFF' : 'rgba(255,255,255,0.7)', fontSize: 10.5 }}>{l}</Text>
      ))}
    </View>
  );
}

// Switching light/dark remounts the card (fresh layout, fresh gradient). Before this, the card could vanish after a theme switch.
export default function RiverCard(props) {
  const dark = useThemeStore((st) => st.resolvedTheme === 'dark');
  return <RiverCardInner key={dark ? 'dark' : 'light'} {...props} dark={dark} />;
}

function RiverCardInner({ rv, dark }) {
  const [w, setW] = useState(0);
  if (!rv) return null;
  // calm blue when steady, teal when falling, amber/red when rising. In dark mode the colours are deep and muted,
  // so the card sits quietly on the dark page instead of glowing.
  const grad = dark
    ? (rv.trend === 'Rising fast' ? ['#4A1B1B', '#240D0D'] : rv.trend === 'Rising' ? ['#4A330F', '#25190A'] : rv.trend === 'Falling' ? ['#0F403C', '#08201E'] : ['#10334F', '#0A1B2D'])
    : (rv.trend === 'Rising fast' ? ['#EF4444', '#7F1D1D'] : rv.trend === 'Rising' ? ['#F59E0B', '#B45309'] : rv.trend === 'Falling' ? ['#14B8A6', '#0F766E'] : ['#0EA5E9', '#075985']);
  return (
    <LinearGradient
      colors={grad}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, dark && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }]}
      onLayout={(e) => { const x = Math.round(e.nativeEvent.layout.width); if (x !== w) setW(x); }}
    >
      <Ionicons name="water" size={110} color="#FFFFFF" pointerEvents="none" style={{ position: 'absolute', right: -14, bottom: -20, opacity: dark ? 0.06 : 0.1, transform: [{ rotate: '-16deg' }] }} />
      <View style={styles.top}>
        <View>
          <Text style={styles.title}>River flow</Text>
          <View style={styles.big}>
            <Text style={styles.num}>{rv.now}</Text>
            <Text style={styles.unit}>m³/s now</Text>
          </View>
        </View>
        <View style={styles.chip}>
          <Ionicons name={rv.trend.startsWith('Rising') ? 'trending-up' : rv.trend === 'Falling' ? 'trending-down' : 'remove'} size={13} color="#FFF" />
          <Text style={styles.chipText}>{rv.trend}</Text>
        </View>
      </View>
      <View style={{ marginTop: 6 }}>
        <RiverChart dark={dark} series={rv.series} width={Math.max(0, w - 28)} labels={rv.series.map((_, i) => (i === 0 ? 'Now' : '+' + i + 'd'))} />
      </View>
      <Text style={styles.foot} numberOfLines={1}>7-day peak {rv.peak} m³/s · modelled, not an official warning</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, paddingVertical: 12, paddingHorizontal: 14, overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '500' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)' },
  chipText: { color: '#FFF', fontSize: 12, fontWeight: '500', marginLeft: 5 },
  big: { flexDirection: 'row', alignItems: 'baseline', marginTop: 0 },
  num: { color: '#FFF', fontSize: 30, fontWeight: '300', letterSpacing: -1, lineHeight: 36 },
  unit: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '400', marginLeft: 6 },
  foot: { color: 'rgba(255,255,255,0.7)', fontSize: 10, lineHeight: 13, marginTop: 6 },
});
