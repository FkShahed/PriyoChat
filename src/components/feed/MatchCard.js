import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { bdClock } from '../../utils/bdTime';

// One match as a clean, roomy card. Used on the Feed's Daily page and on the dedicated Matches page.
// mt: { sport, league, state: 'live'|'final'|'upcoming', status, time, home, away, homeScore, awayScore,
//       homeWinner, awayWinner, homeLogo, awayLogo }
// P: the Feed colour palette { card, cardAlt, text, sub, border, accent }

const BADGE_COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];

// Team badge: the real logo when we have one, otherwise a coloured circle with the team's initials
export function TeamBadge({ name = '', logo, size = 40 }) {
  const [failed, setFailed] = useState(false);
  const initials = name.replace(/[^A-Za-z ]/g, ' ').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const color = BADGE_COLORS[(name.charCodeAt(0) || 0) % BADGE_COLORS.length];
  if (logo && !failed) {
    return <Image source={{ uri: logo }} onError={() => setFailed(true)} style={{ width: size, height: size }} resizeMode="contain" />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '26', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontSize: size * 0.36, fontWeight: '500' }}>{initials}</Text>
    </View>
  );
}

// Red dot that gently pulses while a match is live
export function PulseDot() {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.25, duration: 700, useNativeDriver: true }),
      Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EF4444', marginRight: 6, opacity: a }} />;
}

const fmtIn = (min) => (min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)}h ${min % 60}m`);

export default function MatchCard({ mt, P, onPress }) {
  const card = <MatchCardBody mt={mt} P={P} tappable={!!onPress} />;
  return onPress ? <TouchableOpacity activeOpacity={0.88} onPress={onPress}>{card}</TouchableOpacity> : card;
}

function MatchCardBody({ mt, P, tappable }) {
  const live = mt.state === 'live';
  const final = mt.state === 'final';
  const upcoming = mt.state === 'upcoming';
  const isFootball = mt.sport !== 'cricket'; // the feed says 'soccer' (or 'football' in the fallback source)
  const when = mt.time ? bdClock(mt.time, { pad: false }) : '';
  const minsLeft = mt.time ? Math.round((Date.parse(mt.time) - Date.now()) / 60000) : null;
  const chipText = live ? (mt.status || 'Live') : final ? (isFootball ? 'Full time' : 'Final') : 'Upcoming';

  return (
    <View style={[styles.card, { backgroundColor: P.card, borderColor: live ? 'rgba(239,68,68,0.45)' : P.border }]}>
      <View style={styles.head}>
        <Ionicons name={isFootball ? 'football' : 'baseball'} size={13} color={isFootball ? '#10B981' : '#F59E0B'} />
        <Text style={[styles.league, { color: P.sub }]} numberOfLines={1}>{mt.league}</Text>
        <View style={[styles.chip, { backgroundColor: live ? 'rgba(239,68,68,0.14)' : P.cardAlt }]}>
          {live ? <PulseDot /> : null}
          <Text style={{ color: live ? '#EF4444' : P.sub, fontSize: 11, fontWeight: live ? '500' : '400' }} numberOfLines={1}>{chipText}</Text>
        </View>
        {tappable ? <Ionicons name="chevron-forward" size={15} color={P.sub} style={{ marginLeft: 6 }} /> : null}
      </View>

      {isFootball ? (
        <View style={styles.board}>
          <View style={styles.team}>
            <TeamBadge name={mt.home} logo={mt.homeLogo} size={42} />
            <Text style={[styles.name, { color: P.text }]} numberOfLines={2}>{mt.home}</Text>
          </View>
          <View style={styles.center}>
            {upcoming ? (
              <>
                <Text style={[styles.time, { color: P.text }]}>{when}</Text>
                {minsLeft != null && minsLeft > 0 ? <Text style={[styles.sub, { color: P.sub }]}>{fmtIn(minsLeft)}</Text> : null}
              </>
            ) : (
              <Text style={[styles.score, { color: P.text }]}>{mt.homeScore || '0'}<Text style={{ color: P.sub }}>  –  </Text>{mt.awayScore || '0'}</Text>
            )}
          </View>
          <View style={styles.team}>
            <TeamBadge name={mt.away} logo={mt.awayLogo} size={42} />
            <Text style={[styles.name, { color: P.text }]} numberOfLines={2}>{mt.away}</Text>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          {[[mt.home, mt.homeLogo, mt.homeScore, mt.homeWinner], [mt.away, mt.awayLogo, mt.awayScore, mt.awayWinner]].map(([name, logo, score, win], k) => (
            <View key={k} style={styles.cRow}>
              <TeamBadge name={name} logo={logo} size={30} />
              <Text style={[styles.cName, { color: P.text, opacity: final && !win && (mt.homeWinner || mt.awayWinner) ? 0.65 : 1 }]} numberOfLines={1}>{name}</Text>
              {score ? <Text style={[styles.cScore, { color: P.text, fontWeight: final && win ? '500' : '400' }]} numberOfLines={1}>{score}</Text> : null}
            </View>
          ))}
          {upcoming ? <Text style={[styles.sub, { color: P.sub, marginTop: 6 }]}>Starts {when}{minsLeft != null && minsLeft > 0 ? ' · ' + fmtIn(minsLeft) : ''}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'center' },
  league: { flex: 1, fontSize: 11, marginLeft: 6, marginRight: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  board: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  team: { flex: 1, alignItems: 'center' },
  name: { fontSize: 12.5, marginTop: 8, textAlign: 'center', lineHeight: 16 },
  center: { minWidth: 92, alignItems: 'center', paddingHorizontal: 4 },
  score: { fontSize: 28, fontWeight: '300', letterSpacing: -0.5 },
  time: { fontSize: 19, fontWeight: '400' },
  sub: { fontSize: 11, marginTop: 2 },
  cRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  cName: { flex: 1, fontSize: 14, marginLeft: 10, marginRight: 8 },
  cScore: { fontSize: 14, maxWidth: '58%', textAlign: 'right' },
});
