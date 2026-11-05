import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Two hours that just passed, then the CURRENT hour (3rd cell), then the next 24 hours. Swipe left to see what is coming.
// hours: [{ date: 'YYYY-MM-DD', h: 0..23, temp, icon }]   nowIndex: position of the current hour in `hours`

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const label = (h) => `${((h + 11) % 12) + 1} ${h >= 12 ? 'PM' : 'AM'}`;
const CELL = 60;

const weekday = (date) => {
  const [y, m, d] = String(date).split('-').map((x) => parseInt(x, 10));
  return DAY[new Date(y, m - 1, d).getDay()];
};

const iconColor = (icon, P) => (
  icon === 'sunny' ? '#F59E0B'
  : icon === 'moon' || icon === 'cloudy-night' ? '#818CF8'
  : icon === 'rainy' || icon === 'thunderstorm' ? '#3B82F6'
  : icon === 'snow' ? '#38BDF8'
  : P.sub
);

export default function HourlyStrip({ hours, nowIndex, nowHour, P, dark }) {
  if (!hours || !hours.length) return null;

  // older server data has no nowIndex: fall back to the matching hour of the list
  const nowIdx = Number.isFinite(nowIndex) ? nowIndex : Math.max(0, hours.findIndex((x) => x.h === nowHour));
  const start = Math.max(0, nowIdx - 2);
  const list = hours.slice(start, nowIdx + 25); // 2 hours before, now, and the next 24 hours
  const nowPos = nowIdx - start; // 2 normally (the 3rd cell)

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 2 }}>
      {list.map((x, i) => {
        const now = i === nowPos;
        const past = i < nowPos;
        const newDay = x.h === 0 && !now;
        return (
          <View
            key={i}
            style={[
              styles.cell,
              past && { opacity: 0.55 },
              now && { backgroundColor: dark ? 'rgba(124,58,237,0.28)' : 'rgba(124,58,237,0.12)', borderRadius: 18 },
              newDay && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: P.border },
            ]}
          >
            <Text style={{ color: now ? '#7C3AED' : newDay ? P.text : P.sub, fontSize: 11.5, fontWeight: now || newDay ? '600' : '400' }}>
              {now ? 'Now' : newDay ? weekday(x.date) : label(x.h)}
            </Text>
            <Ionicons name={x.icon} size={22} color={iconColor(x.icon, P)} style={{ marginVertical: 9 }} />
            <Text style={{ color: P.text, fontSize: 14.5, fontWeight: now ? '500' : '400' }}>{x.temp}°</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cell: { width: CELL, alignItems: 'center', paddingVertical: 10 },
});
