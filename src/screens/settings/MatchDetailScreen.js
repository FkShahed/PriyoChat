import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, StatusBar, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useThemeStore from '../../store/useThemeStore';
import { feedApi } from '../../api/services';
import { TeamBadge, PulseDot } from '../../components/feed/MatchCard';
import { bdClock, bdFullDate, bdDayNumber } from '../../utils/bdTime';

// One match, in full and live. Football: score, goals/cards timeline, stats bars, line-ups, minute-by-minute commentary.
// Cricket: score of every side, toss and ground, batting and bowling scorecards, close of play notes.
// While the match is live the page asks the server again every 12 seconds (the server keeps data at most ~15 s old).

const POLL_LIVE = 12000;
const POLL_SOON = 30000;

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

// A number that pops briefly whenever it changes (a goal, a wicket)
function Pop({ value, style }) {
  const s = useRef(new Animated.Value(1)).current;
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && prev.current !== undefined) {
      s.setValue(1.5);
      Animated.spring(s, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();
    }
    prev.current = value;
  }, [value, s]);
  return <Animated.Text style={[style, { transform: [{ scale: s }] }]} numberOfLines={1}>{value}</Animated.Text>;
}

// Fades and lifts into place, one block after another
function Rise({ i = 0, children }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 480, delay: 120 + i * 110, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [a, i]);
  return <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>{children}</Animated.View>;
}

const EVENT_ICON = {
  goal: ['football', '#10B981'], 'penalty---scored': ['football', '#10B981'], 'own-goal': ['football', '#EF4444'],
  'yellow-card': ['square', '#FACC15'], 'red-card': ['square', '#EF4444'], substitution: ['swap-horizontal', '#38BDF8'],
};

export default function MatchDetailScreen({ navigation, route }) {
  const mt = route.params?.mt || {};
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

  const isCricket = mt.sport === 'cricket';
  const [d, setD] = useState(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState(null);
  const [lineTeam, setLineTeam] = useState(0);
  const [card, setCard] = useState(0);

  const canLoad = !!mt.id && !!mt.leagueKey;
  const load = useCallback(async () => {
    if (!canLoad) return;
    try {
      const { data } = await feedApi.getMatchDetail(isCricket ? 'cricket' : 'soccer', mt.leagueKey, mt.id);
      if (!alive.current) return;
      setD(data);
      setError(false);
      setUpdated(Date.now());
    } catch (e) {
      if (alive.current) setError(true);
    }
  }, [canLoad, isCricket, mt.leagueKey, mt.id]);
  useEffect(() => { load(); }, [load]);

  const state = d?.state || mt.state || 'upcoming';
  const soon = state === 'upcoming' && mt.time && Date.parse(mt.time) - Date.now() < 3 * 3600 * 1000;
  useEffect(() => {
    if (!canLoad || (state !== 'live' && !soon)) return undefined;
    const id = setInterval(load, state === 'live' ? POLL_LIVE : POLL_SOON);
    return () => clearInterval(id);
  }, [canLoad, state, soon, load]);

  const onRefresh = async () => { setRefreshing(true); await load(); if (alive.current) setRefreshing(false); };

  // header data: the live detail when we have it, else the card that was tapped
  const home = d?.teams?.[0] || { name: mt.home, logo: mt.homeLogo, score: mt.homeScore };
  const away = d?.teams?.[1] || { name: mt.away, logo: mt.awayLogo, score: mt.awayScore };
  const live = state === 'live';
  const final = state === 'final';
  const when = (d?.date || mt.time) ? bdClock(d?.date || mt.time, { pad: false }) : '';
  const whenDay = (d?.date || mt.time) ? (bdDayNumber(d?.date || mt.time) === bdDayNumber(Date.now()) ? 'Today' : bdFullDate(d?.date || mt.time)) : '';
  const statusLine = live ? (d?.status || mt.status || 'Live') : final ? (isCricket ? (d?.summary || 'Final') : 'Full time') : `${whenDay} · ${when}`;
  const grad = isCricket ? (dark ? ['#3A2A12', '#150E06'] : ['#F59E0B', '#C2410C']) : (dark ? ['#0F3B2E', '#06150F'] : ['#10B981', '#047857']);

  // a team in a football header: big logo, the FULL name (wraps to two lines, never cut)
  const teamCol = (t) => (
    <View style={styles.teamCol}>
      <View style={styles.badgeWrap}><TeamBadge name={t.name} logo={t.logo} size={60} /></View>
      <Text style={[styles.teamName, { opacity: final && d && !t.winner && (d.teams || []).some((x) => x.winner) ? 0.7 : 1 }]} numberOfLines={3}>{t.name}</Text>
      {final && t.winner ? <View style={styles.winTag}><Ionicons name="trophy" size={10} color="#FDE68A" /><Text style={styles.winTagText}>Winner</Text></View> : null}
    </View>
  );

  // very long names (say "Royal Challengers Bengaluru") read better as their short code, with the full name small underneath
  const nameParts = (t) => {
    const full = String(t.name || '');
    if (full.length > 20 && t.short && t.short.length >= 2 && t.short.length <= 6) return [t.short, full];
    return [full, ''];
  };

  // "254 & 184" or "144 & 172 (57.2 ov, target 295)" -> big part and small part
  const splitScore = (sc) => {
    const str = String(sc || '').trim();
    const i = str.indexOf('(');
    return i > 0 ? [str.slice(0, i).trim(), str.slice(i).trim()] : [str, ''];
  };

  const renderHero = () => (
    <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.orb} />
      <View style={styles.orb2} />
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.league} numberOfLines={1}>{d?.league || mt.league}</Text>
        {live && !isCricket ? (
          <View style={styles.livePill}><PulseDot /><Text style={styles.livePillText}>LIVE</Text></View>
        ) : null}
      </View>

      {isCricket ? (
        <View style={styles.vsRow}>
          <View style={styles.vsTeam}>
            <View style={styles.vsBadge}><TeamBadge name={home.name} logo={home.logo} size={46} /></View>
            <Text style={styles.vsName} numberOfLines={2}>{nameParts(home)[0]}</Text>
          </View>
          <View style={styles.vsMid}><Text style={styles.vsText}>VS</Text></View>
          <View style={styles.vsTeam}>
            <View style={styles.vsBadge}><TeamBadge name={away.name} logo={away.logo} size={46} /></View>
            <Text style={styles.vsName} numberOfLines={2}>{nameParts(away)[0]}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.board}>
          {teamCol(home)}
          <View style={styles.mid}>
            {state === 'upcoming' ? (
              <>
                <Text style={styles.bigTime}>{when}</Text>
                <Text style={styles.bigDay}>{whenDay}</Text>
              </>
            ) : (
              <View style={styles.scoreGlass}>
                <Pop value={home.score || '0'} style={styles.bigScore} />
                <Text style={styles.scoreDash}>:</Text>
                <Pop value={away.score || '0'} style={styles.bigScore} />
              </View>
            )}
          </View>
          {teamCol(away)}
        </View>
      )}

      <View style={[styles.statusPill, live && styles.statusLive]}>
        {live ? <PulseDot /> : null}
        <Text style={styles.statusText} numberOfLines={2}>{statusLine}</Text>
      </View>
      {d?.venue || mt.venue ? (
        <View style={styles.venueRow}>
          <Ionicons name="location" size={13} color="rgba(255,255,255,0.8)" />
          <Text style={styles.venue} numberOfLines={2}>{d?.venue}{d?.city && !String(d.venue).includes(d.city) ? ', ' + d.city : ''}</Text>
        </View>
      ) : null}
    </LinearGradient>
  );

  // One delivery as a round chip: dot, runs, 4, 6, wicket, extras
  const BALL = {
    dot: { bg: dark ? '#2A2F3A' : '#E6E9F0', fg: dark ? '#9CA3AF' : '#6B7280' },
    run: { bg: dark ? '#1E3A5F' : '#DBEAFE', fg: dark ? '#93C5FD' : '#1D4ED8' },
    four: { bg: '#2563EB', fg: '#FFFFFF' },
    six: { bg: '#7C3AED', fg: '#FFFFFF' },
    wicket: { bg: '#EF4444', fg: '#FFFFFF' },
    extra: { bg: dark ? '#4A3410' : '#FEF3C7', fg: dark ? '#FBBF24' : '#B45309' },
  };
  const BallChip = ({ b, size = 32, latest = false, faded = false }) => {
    const c = BALL[b.kind] || BALL.run;
    return (
      <View style={[styles.ball, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg, opacity: faded ? 0.55 : 1 }, latest && styles.ballLatest]}>
        <Text style={{ color: c.fg, fontSize: b.label.length > 2 ? size * 0.3 : size * 0.4, fontWeight: '500' }}>{b.label}</Text>
      </View>
    );
  };

  // "Recent balls": last deliveries (newest on the right), this over and the one before, batters and bowler
  const renderRecentBalls = (lv) => {
    if (!lv || !(lv.balls || []).length) return null;
    const overs = (lv.overs || []).slice().reverse(); // newest over first
    const cur = overs[0];
    const prev = overs[1];
    const over6 = (o) => (o.balls || []).slice(-8);
    return (
      <View style={[styles.rbWrap, { borderTopColor: P.border }]}>
        <View style={styles.rbHead}>
          <Text style={[styles.rbTitle, { color: P.sub }]}>RECENT BALLS</Text>
          <View style={{ flex: 1 }} />
          {lv.runRate ? <Text style={[styles.rbRate, { color: P.sub }]}>Run rate {Number(lv.runRate).toFixed(2)}</Text> : null}
        </View>

        <View style={styles.rbRow}>
          {lv.balls.map((b, i) => (
            <BallChip key={i} b={b} size={30} latest={i === lv.balls.length - 1} faded={i < lv.balls.length - 6} />
          ))}
        </View>

        {cur ? (
          <View style={[styles.rbOver, { backgroundColor: P.cardAlt }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: P.text, fontSize: 13, fontWeight: '500' }}>Over {cur.over}</Text>
              <Text style={{ color: P.sub, fontSize: 11.5, marginTop: 2 }}>{cur.runs} run{cur.runs === 1 ? '' : 's'}{cur.wickets ? ' · ' + cur.wickets + ' wkt' : ''}</Text>
            </View>
            <View style={styles.rbOverBalls}>{over6(cur).map((b, i) => <BallChip key={i} b={b} size={26} />)}</View>
          </View>
        ) : null}
        {prev ? (
          <View style={[styles.rbOver, { backgroundColor: 'transparent', paddingVertical: 4 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: P.sub, fontSize: 12 }}>Over {prev.over} · {prev.runs} run{prev.runs === 1 ? '' : 's'}{prev.wickets ? ' · ' + prev.wickets + ' wkt' : ''}</Text>
            </View>
            <View style={styles.rbOverBalls}>{over6(prev).map((b, i) => <BallChip key={i} b={b} size={22} faded />)}</View>
          </View>
        ) : null}

        {(lv.batters || []).length || lv.bowler ? (
          <View style={styles.rbPlayers}>
            {(lv.batters || []).map((b, i) => (
              <View key={i} style={styles.rbPlayer}>
                <Ionicons name="baseball" size={12} color={P.sub} />
                <Text style={[styles.rbPName, { color: P.text }]} numberOfLines={1}>{b.name}</Text>
                <Text style={{ color: P.text, fontSize: 13, fontWeight: '500' }}>{b.runs}<Text style={{ color: P.sub, fontWeight: '400' }}> ({b.faced})</Text></Text>
              </View>
            ))}
            {lv.bowler ? (
              <View style={styles.rbPlayer}>
                <Ionicons name="radio-button-on" size={12} color="#EF4444" />
                <Text style={[styles.rbPName, { color: P.text }]} numberOfLines={1}>{lv.bowler.name}</Text>
                <Text style={{ color: P.text, fontSize: 13, fontWeight: '500' }}>{lv.bowler.wickets}-{lv.bowler.runs}<Text style={{ color: P.sub, fontWeight: '400' }}> ({lv.bowler.overs})</Text></Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {lv.lastText ? <Text style={[styles.rbLast, { color: P.sub }]} numberOfLines={2}>Last ball: {lv.lastText}</Text> : null}
      </View>
    );
  };

  // Cricket scoreboard: a clean card in the page body (not in the header)
  const renderScoreboard = () => {
    const anyWinner = !!(d && (d.teams || []).some((x) => x.winner));
    const accent = live ? '#EF4444' : final ? '#10B981' : '#F59E0B';
    return (
      <Rise i={0}>
        <View style={[styles.sbCard, { backgroundColor: P.card, borderColor: live ? 'rgba(239,68,68,0.4)' : P.border }]}>
          <View style={styles.sbHead}>
            {live ? <PulseDot /> : <Ionicons name={final ? 'checkmark-circle' : 'time'} size={15} color={accent} style={{ marginRight: 6 }} />}
            <Text style={[styles.sbHeadText, { color: accent }]}>{live ? 'LIVE SCORE' : final ? 'FINAL SCORE' : 'SCOREBOARD'}</Text>
            <View style={{ flex: 1 }} />
            {live && updated ? <Text style={{ color: P.sub, fontSize: 11 }}>Updated {bdClock(updated)}</Text> : null}
          </View>

          {[home, away].map((t, k) => {
            const [main, extra] = splitScore(t.score);
            const [title, sub] = nameParts(t);
            const win = final && t.winner;
            const dim = final && anyWinner && !t.winner;
            // second line: "57.2 ov · target 295" (brackets removed); the full club name takes its place only when the name was shortened
            const detail = extra ? extra.replace(/^\(|\)$/g, '').replace(/,\s*/g, ' · ') : (sub || '');
            return (
              <View key={k} style={[styles.sbRow, k > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }, win && { backgroundColor: 'rgba(16,185,129,0.07)' }]}>
                <TeamBadge name={t.name} logo={t.logo} size={40} />
                <View style={styles.sbMid}>
                  <View style={styles.sbNameRow}>
                    <Text style={[styles.sbName, { color: P.text, opacity: dim ? 0.55 : 1 }]} numberOfLines={1}>{title}</Text>
                    {win ? <Ionicons name="trophy" size={13} color="#10B981" style={{ marginLeft: 6 }} /> : null}
                  </View>
                  {detail ? <Text style={[styles.sbExtra, { color: P.sub }]} numberOfLines={1}>{detail}</Text> : null}
                </View>
                <Pop value={main || (live || final ? '—' : 'Yet to bat')} style={main ? [styles.sbScore, { color: P.text, opacity: dim ? 0.55 : 1 }] : { color: P.sub, fontSize: 13.5 }} />
              </View>
            );
          })}

          {live ? renderRecentBalls(d?.live) : null}

          {live || final || d?.summary ? (
            <View style={[styles.sbFoot, { backgroundColor: accent + '14' }]}>
              <Ionicons name={final ? 'trophy' : 'radio'} size={14} color={accent} />
              <Text style={[styles.sbFootText, { color: P.text }]} numberOfLines={3}>{final ? (d?.summary || 'Match finished') : (d?.summary || d?.status || mt.status || 'Match in progress')}</Text>
            </View>
          ) : null}
        </View>
      </Rise>
    );
  };

  const Block = ({ icon, color, title, right, children, i = 0 }) => (
    <Rise i={i}>
      <View style={styles.secHead}>
        <View style={[styles.secIcon, { backgroundColor: color + '22' }]}><Ionicons name={icon} size={14} color={color} /></View>
        <Text style={[styles.secTitle, { color: P.text }]}>{title}</Text>
        {right ? <Text style={{ color: P.sub, fontSize: 12 }}>{right}</Text> : null}
      </View>
      {children}
    </Rise>
  );

  // ── football ──
  const renderEvents = () => {
    const ev = d?.events || [];
    if (!ev.length) return null;
    const homeId = d?.teams?.[0]?.id;
    return (
      <Block icon="time" color="#10B981" title="Match timeline" right={ev.length + ' events'} i={1}>
        <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
          {ev.map((e, i) => {
            const [icon, c] = EVENT_ICON[e.kind] || ['ellipse', '#8E9099'];
            const left = e.teamId === homeId;
            return (
              <View key={i} style={[styles.evRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
                <View style={[styles.evSide, { alignItems: 'flex-end' }]}>{left ? <Text style={[styles.evText, { color: P.text, fontWeight: e.goal ? '600' : '400' }]} numberOfLines={2}>{e.who || e.text}</Text> : null}</View>
                <View style={styles.evMid}>
                  <Text style={{ color: P.sub, fontSize: 11 }}>{e.min}</Text>
                  <View style={[styles.evDot, { backgroundColor: c + '26' }]}><Ionicons name={icon} size={e.kind.includes('card') ? 11 : 13} color={c} /></View>
                </View>
                <View style={styles.evSide}>{!left ? <Text style={[styles.evText, { color: P.text, fontWeight: e.goal ? '600' : '400' }]} numberOfLines={2}>{e.who || e.text}</Text> : null}</View>
              </View>
            );
          })}
        </View>
      </Block>
    );
  };

  const renderStats = () => {
    const st = d?.stats || [];
    if (!st.length) return null;
    return (
      <Block icon="stats-chart" color="#0EA5E9" title="Team stats" i={2}>
        <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border, paddingVertical: 14 }]}>
          {st.map((s, i) => {
            const tot = (s.home + s.away) || 1;
            const hw = Math.max(4, Math.round((s.home / tot) * 100));
            return (
              <View key={s.label} style={{ marginTop: i ? 14 : 0 }}>
                <View style={styles.statTop}>
                  <Text style={[styles.statNum, { color: P.text, fontWeight: s.home > s.away ? '600' : '400' }]}>{s.home}{s.unit}</Text>
                  <Text style={{ color: P.sub, fontSize: 12 }}>{s.label}</Text>
                  <Text style={[styles.statNum, { color: P.text, fontWeight: s.away > s.home ? '600' : '400' }]}>{s.away}{s.unit}</Text>
                </View>
                <View style={[styles.bar, { backgroundColor: P.cardAlt }]}>
                  <View style={{ width: hw + '%', backgroundColor: '#10B981', borderRadius: 4 }} />
                  <View style={{ flex: 1, backgroundColor: '#0EA5E9', borderRadius: 4, marginLeft: 3 }} />
                </View>
              </View>
            );
          })}
        </View>
      </Block>
    );
  };

  const renderLineups = () => {
    const lu = d?.lineups || [];
    if (!lu.length || !lu.some((l) => l.starters.length)) return null;
    const t = lu[Math.min(lineTeam, lu.length - 1)];
    return (
      <Block icon="people" color="#8B5CF6" title="Line-ups" right={t.formation} i={3}>
        <View style={styles.tabs2}>
          {lu.map((l, k) => (
            <TouchableOpacity key={k} activeOpacity={0.8} onPress={() => setLineTeam(k)} style={[styles.tab2, { backgroundColor: lineTeam === k ? '#8B5CF6' : P.cardAlt }]}>
              <Text style={{ color: lineTeam === k ? '#FFF' : P.text, fontSize: 12.5, fontWeight: '500' }} numberOfLines={1}>{l.team}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border, marginTop: 10 }]}>
          {t.starters.map((p, i) => (
            <View key={i} style={[styles.pRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
              <Text style={[styles.pNum, { color: P.sub }]}>{p.n}</Text>
              <Text style={{ flex: 1, color: P.text, fontSize: 14 }} numberOfLines={1}>{p.name}</Text>
              <Text style={{ color: P.sub, fontSize: 11.5 }}>{p.pos}</Text>
            </View>
          ))}
          {t.subs.length ? (
            <>
              <Text style={[styles.subHead, { color: P.sub }]}>SUBSTITUTES</Text>
              {t.subs.map((p, i) => (
                <View key={'s' + i} style={styles.pRow}>
                  <Text style={[styles.pNum, { color: P.sub }]}>{p.n}</Text>
                  <Text style={{ flex: 1, color: P.sub, fontSize: 13.5 }} numberOfLines={1}>{p.name}</Text>
                  <Text style={{ color: P.sub, fontSize: 11.5 }}>{p.pos}</Text>
                </View>
              ))}
            </>
          ) : null}
        </View>
      </Block>
    );
  };

  const renderCommentary = () => {
    const cm = d?.commentary || [];
    if (!cm.length) return null;
    return (
      <Block icon="chatbubbles" color="#F59E0B" title={live ? 'Live commentary' : 'Commentary'} i={4}>
        <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
          {cm.slice(0, 20).map((c, i) => (
            <View key={i} style={[styles.cmRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
              <Text style={[styles.cmMin, { color: '#F59E0B' }]}>{c.min}</Text>
              <Text style={{ flex: 1, color: P.text, fontSize: 13.5, lineHeight: 19 }}>{c.text}</Text>
            </View>
          ))}
        </View>
      </Block>
    );
  };

  // ── cricket ──
  // Cricket commentary: every delivery as a line, newest first (shows up for matches that have ball-by-ball data)
  const renderCricketCommentary = () => {
    const cm = (d?.live?.comm || []).slice(0, 3); // just the latest three; the list refreshes with the live data
    if (!cm.length) return null;
    return (
      <Block icon="chatbubbles" color="#F59E0B" title={live ? 'Live commentary' : 'Commentary'} i={1}>
        <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
          {cm.map((c, i) => (
            <View key={i} style={[styles.cmRow, { alignItems: 'flex-start' }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
              <View style={{ width: 50, alignItems: 'center' }}>
                <BallChip b={c} size={28} />
                <Text style={{ color: P.sub, fontSize: 10.5, marginTop: 4 }}>{c.o}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={{ color: P.text, fontSize: 13.5, lineHeight: 19, fontWeight: c.kind === 'wicket' || c.kind === 'four' || c.kind === 'six' ? '500' : '400' }}>{c.text}</Text>
                {c.detail && c.kind === 'wicket' ? <Text style={{ color: P.sub, fontSize: 12, lineHeight: 17, marginTop: 3 }}>{c.detail}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      </Block>
    );
  };

  const renderCricketInfo = () => {
    const inf = d?.info;
    if (!inf) return null;
    const rows = [
      d?.summary && final ? ['trophy', 'Result', d.summary] : null,
      inf.toss ? ['disc', 'Toss', inf.toss] : null,
      inf.days ? ['calendar', 'Dates', inf.days] : null,
      inf.hours ? ['time', 'Hours of play', inf.hours] : null,
      inf.points ? ['ribbon', 'Points', inf.points] : null,
    ].filter(Boolean);
    if (!rows.length) return null;
    return (
      <Block icon="information-circle" color="#F59E0B" title="Match info" i={1}>
        <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
          {rows.map(([icon, k, v], i) => (
            <View key={k} style={[styles.infoRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
              <Ionicons name={icon} size={16} color="#F59E0B" style={{ marginTop: 1 }} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: P.sub, fontSize: 11.5 }}>{k}</Text>
                <Text style={{ color: P.text, fontSize: 14, marginTop: 2, lineHeight: 19 }}>{v}</Text>
              </View>
            </View>
          ))}
        </View>
      </Block>
    );
  };

  const renderScorecards = () => {
    const cards = d?.cards || [];
    if (!cards.length) return null;
    const idx = Math.min(card, cards.length - 1);
    const c = cards[idx];
    const bat = c.kind === 'Batting';
    return (
      <Block icon="list" color="#0EA5E9" title="Scorecard" i={2}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          {cards.map((x, k) => (
            <TouchableOpacity key={k} activeOpacity={0.8} onPress={() => setCard(k)} style={[styles.tab2, { backgroundColor: idx === k ? '#0EA5E9' : P.cardAlt, marginRight: 8, flex: 0, paddingHorizontal: 14 }]}>
              <Text style={{ color: idx === k ? '#FFF' : P.text, fontSize: 12.5, fontWeight: '500' }}>{x.team} · {x.kind}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
          <View style={[styles.sRow, { paddingBottom: 6 }]}>
            <Text style={[styles.sName, { color: P.sub, fontSize: 11 }]}>{bat ? 'BATTER' : 'BOWLER'}</Text>
            {(bat ? ['R', 'B', '4s', '6s'] : ['O', 'M', 'R', 'W']).map((h) => <Text key={h} style={[styles.sNum, { color: P.sub, fontSize: 11 }]}>{h}</Text>)}
          </View>
          {c.rows.map((r, i) => (
            <View key={i} style={[styles.sRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
              <View style={styles.sName}>
                <Text style={{ color: P.text, fontSize: 13.5 }} numberOfLines={1}>{r.name}</Text>
                {bat && r.how ? <Text style={{ color: P.sub, fontSize: 10.5, marginTop: 1 }} numberOfLines={1}>{r.how}</Text> : null}
              </View>
              {(bat ? [r.r, r.b, r.f, r.s] : [r.o, r.m, r.r, r.w]).map((v, k) => (
                <Text key={k} style={[styles.sNum, { color: P.text, fontWeight: (bat ? k === 0 : k === 3) ? '600' : '400' }]}>{v}</Text>
              ))}
            </View>
          ))}
          {c.total || c.extras ? (
            <View style={[styles.sRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
              <Text style={{ flex: 1, color: P.sub, fontSize: 12 }}>{c.runs ? `Total ${c.runs} ${c.total}` : c.total}{c.extras ? `  ·  Extras ${c.extras}` : ''}</Text>
            </View>
          ) : null}
        </View>
      </Block>
    );
  };

  const renderCloses = () => {
    const cl = d?.info?.closes || [];
    if (!cl.length) return null;
    return (
      <Block icon="moon" color="#8B5CF6" title="Day by day" i={3}>
        <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
          {cl.map((t, i) => (
            <Text key={i} style={{ color: P.text, fontSize: 13, lineHeight: 19, paddingVertical: 9, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: P.border }}>{t}</Text>
          ))}
        </View>
      </Block>
    );
  };

  const sec = (n) => n;
  void sec;

  return (
    <View style={[styles.container, { backgroundColor: P.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F59E0B" colors={['#F59E0B']} progressViewOffset={40} />}
      >
        {renderHero()}

        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          {live || soon ? (
            <View style={styles.syncRow}>
              <PulseDot />
              <Text style={{ color: P.sub, fontSize: 11.5 }}>{live ? 'Updating live' : 'Starting soon'}{updated ? ' · ' + bdClock(updated) : ''}</Text>
            </View>
          ) : null}

          {isCricket ? renderScoreboard() : null}

          {!d && !error && canLoad ? (
            <View style={{ gap: 12, marginTop: 20 }}>
              <Skeleton dark={dark} style={{ height: 150 }} />
              <Skeleton dark={dark} style={{ height: 220 }} />
            </View>
          ) : null}

          {!canLoad ? (
            <View style={styles.empty}>
              <Ionicons name="information-circle-outline" size={30} color={P.sub} />
              <Text style={[styles.emptySub, { color: P.sub }]}>More details are not available for this match.</Text>
            </View>
          ) : null}

          {error && !d ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: P.cardAlt }]}><Ionicons name="cloud-offline" size={30} color={P.sub} /></View>
              <Text style={[styles.emptyTitle, { color: P.text }]}>Couldn't load this match</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => { setError(false); load(); }}>
                <LinearGradient colors={['#F59E0B', '#EA580C']} style={styles.retry}><Text style={styles.retryText}>Try again</Text></LinearGradient>
              </TouchableOpacity>
            </View>
          ) : null}

          {d && !isCricket ? (<>{renderEvents()}{renderStats()}{renderLineups()}{renderCommentary()}</>) : null}
          {d && isCricket ? (<>{renderCricketCommentary()}{renderCricketInfo()}{renderScorecards()}{renderCloses()}</>) : null}

          {d && !isCricket && !(d.events || []).length && !(d.stats || []).length && state === 'upcoming' ? (
            <View style={styles.empty}>
              <Ionicons name="alarm-outline" size={30} color={P.sub} />
              <Text style={[styles.emptyTitle, { color: P.text, marginTop: 10 }]}>Kick-off {whenDay.toLowerCase()} at {when}</Text>
              <Text style={[styles.emptySub, { color: P.sub }]}>Line-ups, stats and live commentary appear here once the match gets going.</Text>
            </View>
          ) : null}

          <Text style={[styles.credit, { color: P.sub }]}>Data from ESPN{d?.attendance ? ' · attendance ' + Number(d.attendance).toLocaleString() : ''}. Pull down to refresh.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function upcomingText(live, final) { return live || final ? '—' : ''; }

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { paddingTop: 52, paddingHorizontal: 18, paddingBottom: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  orb: { position: 'absolute', top: -100, right: -70, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.1)' },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  league: { flex: 1, color: 'rgba(255,255,255,0.92)', fontSize: 13.5, fontWeight: '400' },
  livePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.3)' },
  livePillText: { color: '#FFF', fontSize: 11.5, fontWeight: '500', letterSpacing: 0.8 },
  board: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 24 },
  teamCol: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  winTag: { flexDirection: 'row', alignItems: 'center', marginTop: 7, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.25)' },
  winTagText: { color: '#FDE68A', fontSize: 10.5, fontWeight: '500', marginLeft: 4, letterSpacing: 0.3 },
  scoreGlass: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.22)' },
  scoreDash: { color: 'rgba(255,255,255,0.6)', fontSize: 34, fontWeight: '300', marginHorizontal: 8, marginTop: -4 },
  bigDay: { color: 'rgba(255,255,255,0.8)', fontSize: 12.5, marginTop: 4 },
  orb2: { position: 'absolute', bottom: -90, left: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)' },
  cCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.2)', marginBottom: 10 },
  cCardWin: { backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(253,230,138,0.55)' },
  cExtra: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 3, lineHeight: 16 },
  cScoreEmpty: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  statusLive: { backgroundColor: 'rgba(239,68,68,0.28)' },
  badgeWrap: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  teamName: { color: '#FFF', fontSize: 14.5, fontWeight: '500', marginTop: 11, textAlign: 'center', lineHeight: 20 },
  mid: { minWidth: 112, alignItems: 'center', paddingTop: 16 },
  bigScore: { color: '#FFF', fontSize: 46, fontWeight: '400', letterSpacing: -1, minWidth: 26, textAlign: 'center' },
  bigTime: { color: '#FFF', fontSize: 28, fontWeight: '300' },
  statusPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginTop: 22, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.25)' },
  statusText: { color: '#FFF', fontSize: 13, fontWeight: '500', textAlign: 'center' },
  venueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  venue: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginLeft: 5, maxWidth: '86%' },
  cRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  cName: { color: '#FFF', fontSize: 16.5, fontWeight: '600', lineHeight: 21 },
  cScore: { color: '#FFF', fontSize: 24, fontWeight: '500', letterSpacing: -0.4, textAlign: 'right' },
  vsRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 22 },
  vsTeam: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  vsBadge: { width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  vsName: { color: '#FFF', fontSize: 14, fontWeight: '500', marginTop: 9, textAlign: 'center', lineHeight: 19, paddingHorizontal: 4 },
  vsMid: { width: 52, alignItems: 'center', paddingTop: 20 },
  vsText: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, fontWeight: '500', letterSpacing: 1.5 },
  sbCard: { borderRadius: 24, borderWidth: 1, overflow: 'hidden', marginTop: 16 },
  sbHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  sbHeadText: { fontSize: 11.5, fontWeight: '600', letterSpacing: 1 },
  sbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 16 },
  sbMid: { flex: 1, marginLeft: 12, marginRight: 10 },
  sbNameRow: { flexDirection: 'row', alignItems: 'center' },
  sbBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginRight: 10, marginVertical: -4 },
  sbName: { flexShrink: 1, fontSize: 15, fontWeight: '500', lineHeight: 20 },
  sbFull: { fontSize: 11.5, marginTop: 2 },
  sbWon: { color: '#10B981', fontSize: 11.5, fontWeight: '500', marginTop: 3 },
  sbExtra: { fontSize: 12, marginTop: 3, lineHeight: 16 },
  sbScore: { fontSize: 22, fontWeight: '500', letterSpacing: -0.2, fontVariant: ['tabular-nums'], textAlign: 'right' },
  ball: { alignItems: 'center', justifyContent: 'center', marginRight: 6, marginBottom: 6 },
  ballLatest: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  rbWrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  rbHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rbTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  rbRate: { fontSize: 11.5 },
  rbRow: { flexDirection: 'row', flexWrap: 'wrap' },
  rbOver: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12, marginTop: 4 },
  rbOverBalls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '62%' },
  rbPlayers: { marginTop: 10 },
  rbPlayer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  rbPName: { flex: 1, fontSize: 13.5, marginLeft: 8, marginRight: 8 },
  rbLast: { fontSize: 12, marginTop: 8, lineHeight: 17 },
  sbFoot: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  sbFootText: { flex: 1, fontSize: 13.5, fontWeight: '500', marginLeft: 9, lineHeight: 19 },
  syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  secHead: { flexDirection: 'row', alignItems: 'center', marginTop: 26, marginBottom: 12 },
  secIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secTitle: { flex: 1, fontSize: 16.5, fontWeight: '500', letterSpacing: -0.2, marginLeft: 10 },
  card: { borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6 },
  evRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  evSide: { flex: 1, paddingHorizontal: 8 },
  evText: { fontSize: 13 },
  evMid: { width: 50, alignItems: 'center' },
  evDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  statNum: { fontSize: 14, minWidth: 44 },
  bar: { flexDirection: 'row', height: 7, borderRadius: 4, overflow: 'hidden' },
  tabs2: { flexDirection: 'row', gap: 8 },
  tab2: { flex: 1, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 16, alignItems: 'center' },
  pRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  pNum: { width: 30, fontSize: 13, fontWeight: '500' },
  subHead: { fontSize: 10.5, letterSpacing: 0.8, marginTop: 14, marginBottom: 2 },
  cmRow: { flexDirection: 'row', paddingVertical: 11 },
  cmMin: { width: 54, fontSize: 12.5, fontWeight: '500' },
  infoRow: { flexDirection: 'row', paddingVertical: 12 },
  sRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  sName: { flex: 1 },
  sNum: { width: 38, textAlign: 'right', fontSize: 13.5 },
  empty: { alignItems: 'center', paddingHorizontal: 30, paddingTop: 36 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptySub: { fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  retry: { paddingHorizontal: 24, paddingVertical: 11, borderRadius: 20, marginTop: 16 },
  retryText: { color: '#FFF', fontWeight: '600' },
  credit: { fontSize: 11, textAlign: 'center', marginTop: 28, opacity: 0.8 },
});
