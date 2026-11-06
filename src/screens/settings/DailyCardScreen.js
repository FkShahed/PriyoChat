import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Share, ActivityIndicator, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useThemeStore from '../../store/useThemeStore';
import ArticleReader from '../../components/common/ArticleReader';
import { feedApi } from '../../api/services';

// Dedicated page for one Daily card (ayah, dua, word, quote, fun fact, joke): the whole text, laid out to be read.
// route.params: { kind, item, colors, icon, label, shareTitle, shareText }

export default function DailyCardScreen({ navigation, route }) {
  const { kind, item: firstItem, colors = ['#4F46E5', '#7C3AED'], icon = 'sparkles', label = '', shareTitle = '' } = route.params || {};
  const dark = useThemeStore((s) => s.resolvedTheme === 'dark');
  const P = useMemo(() => ({
    bg: dark ? '#0C0D10' : '#F4F6FB',
    card: dark ? '#16181D' : '#FFFFFF',
    cardAlt: dark ? '#20232A' : '#EEF1F8',
    text: dark ? '#F2F2F5' : '#14171F',
    sub: dark ? '#8E9099' : '#6B7280',
    border: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)',
  }), [dark]);
  const accent = colors[0];
  const [reader, setReader] = useState(null);

  // "show me another one": the page keeps its own current item
  const [item, setItem] = useState(firstItem);
  const [loadingNext, setLoadingNext] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  const fade = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => () => { alive.current = false; }, []);

  // Tafsir of the verse on screen (Bengali + English), fetched when the page opens and whenever another verse is shown
  const isVerse = kind === 'ayah' || kind === 'dua';
  const [tafsir, setTafsir] = useState(null);
  const [tafBusy, setTafBusy] = useState(false);
  const [tafFailed, setTafFailed] = useState(false);
  const [tafLang, setTafLang] = useState('bn');
  const [tafOpen, setTafOpen] = useState(false);
  const loadTafsir = async (ref) => {
    if (!ref) return;
    setTafBusy(true);
    setTafFailed(false);
    try {
      const { data } = await feedApi.getTafsir(ref);
      if (!alive.current) return;
      setTafsir(data);
      if (!data?.bn && data?.en) setTafLang('en');
    } catch (e) {
      if (alive.current) setTafFailed(true);
    } finally {
      if (alive.current) setTafBusy(false);
    }
  };
  useEffect(() => {
    if (!isVerse || !item?.ref) return;
    setTafsir(null);
    setTafOpen(false);
    loadTafsir(item.ref);
  }, [item?.ref]); // eslint-disable-line react-hooks/exhaustive-deps

  const avoidOf = (it) => (!it ? '' : (kind === 'ayah' || kind === 'dua') ? it.ref : kind === 'word' ? it.word : it.text);
  const loadAnother = async () => {
    if (loadingNext) return;
    setLoadingNext(true);
    setFailed(false);
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    try {
      const { data } = await feedApi.getDailyAnother(kind, avoidOf(item));
      if (!alive.current) return;
      if (data?.item) {
        Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
          if (!alive.current) return;
          setItem(data.item);
          Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
        });
      } else setFailed(true);
    } catch (e) {
      if (alive.current) setFailed(true);
    } finally {
      if (alive.current) setLoadingNext(false);
    }
  };

  const shareBody = () => {
    if (!item) return '';
    const NL = String.fromCharCode(10);
    if (kind === 'ayah' || kind === 'dua') return ['📖 ' + item.surah + ' ' + item.ref, item.arabic, item.bangla, item.english].concat(item.info && item.info.why ? [item.info.title + NL + item.info.why] : []).join(NL + NL);
    if (kind === 'word') return '🔤 ' + item.word + (item.pos ? ' (' + item.pos + ')' : '') + NL + item.definition + (item.example ? NL + '"' + item.example + '"' : '');
    if (kind === 'quote') return '“' + item.text + '”' + NL + '— ' + item.author;
    return (kind === 'fact' ? '💡 ' : '😄 ') + item.text;
  };
  const doShare = () => { Share.share({ message: shareBody(), title: shareTitle }).catch(() => {}); };

  const Block = ({ title, children, style }) => (
    <View style={[styles.block, { backgroundColor: P.card, borderColor: P.border }, style]}>
      {title ? <Text style={[styles.blockTitle, { color: accent }]}>{title}</Text> : null}
      {children}
    </View>
  );

  // long paragraphs are cut into shorter ones (at the end of a sentence) so the tafsir is easy to read
  const splitParas = (text) => {
    const out = [];
    String(text || '').split(/\n\s*\n/).forEach((p) => {
      const t = p.trim();
      if (!t) return;
      if (t.length <= 520) { out.push(t); return; }
      // (no look-behind in the pattern: a marker character is added after each sentence end instead)
      const sentences = t.replace(/([।.!?])\s+/g, '$1\u0001').split('\u0001');
      let cur = '';
      sentences.forEach((sn) => {
        if (cur && (cur + ' ' + sn).length > 460) { out.push(cur); cur = sn; } else cur = cur ? cur + ' ' + sn : sn;
      });
      if (cur) out.push(cur);
    });
    return out;
  };

  const renderTafsir = () => {
    if (!isVerse) return null;
    const cur = tafsir ? tafsir[tafLang] : null;
    const paras = cur?.text ? splitParas(cur.text) : [];
    const total = paras.join(' ').length;
    const LIMIT = 1100;
    let shown = paras;
    if (!tafOpen && total > LIMIT) {
      shown = [];
      let used = 0;
      for (const p of paras) {
        if (used >= LIMIT) break;
        shown.push(p);
        used += p.length;
      }
    }
    const more = !tafOpen && shown.length < paras.length;
    return (
      <Block title="Tafsir · তাফসীর">
        {tafsir?.bn && tafsir?.en ? (
          <View style={styles.tafTabs}>
            {[['bn', 'বাংলা'], ['en', 'English']].map(([k, label]) => (
              <TouchableOpacity key={k} activeOpacity={0.8} onPress={() => { setTafLang(k); setTafOpen(false); }} style={[styles.tafTab, { backgroundColor: tafLang === k ? accent : P.cardAlt }]}>
                <Text style={{ color: tafLang === k ? '#FFF' : P.text, fontSize: 12.5, fontWeight: '500' }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {tafBusy && !tafsir ? (
          <View style={{ paddingVertical: 22, alignItems: 'center' }}>
            <ActivityIndicator color={accent} />
            <Text style={{ color: P.sub, fontSize: 12.5, marginTop: 8 }}>Loading tafsir…</Text>
          </View>
        ) : null}

        {tafFailed && !tafsir ? (
          <View style={{ paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ color: P.sub, fontSize: 13.5, textAlign: 'center' }}>Tafsir is not available right now.</Text>
            <TouchableOpacity activeOpacity={0.8} onPress={() => loadTafsir(item?.ref)} style={[styles.tafRetry, { borderColor: accent }]}>
              <Text style={{ color: accent, fontSize: 13, fontWeight: '500' }}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {cur ? (
          <>
            {shown.map((p, i) => (
              <Text key={i} style={[styles.tafText, { color: P.text, fontSize: tafLang === 'bn' ? 16 : 15.5 }, i === 0 && paras.length > 1 && paras[0].length < 90 && { fontWeight: '500', color: accent }]}>{p}</Text>
            ))}
            {more ? (
              <TouchableOpacity activeOpacity={0.8} onPress={() => setTafOpen(true)} style={[styles.tafMore, { borderColor: accent }]}>
                <Text style={{ color: accent, fontSize: 13.5, fontWeight: '500' }}>Read full tafsir</Text>
                <Ionicons name="chevron-down" size={15} color={accent} />
              </TouchableOpacity>
            ) : null}
            {tafOpen && total > LIMIT ? (
              <TouchableOpacity activeOpacity={0.8} onPress={() => setTafOpen(false)} style={[styles.tafMore, { borderColor: accent }]}>
                <Text style={{ color: accent, fontSize: 13.5, fontWeight: '500' }}>Show less</Text>
                <Ionicons name="chevron-up" size={15} color={accent} />
              </TouchableOpacity>
            ) : null}
            <Text style={[styles.tafCredit, { color: P.sub }]}>{cur.name} · {cur.source} · via Quran.com. Explanation of the verse and the verses around it.</Text>
          </>
        ) : null}
      </Block>
    );
  };

  const renderBody = () => {
    if (!item) return <Block><Text style={{ color: P.sub, fontSize: 14 }}>Nothing to show right now.</Text></Block>;

    if (kind === 'ayah' || kind === 'dua') {
      return (
        <>
          <Block>
            <Text style={[styles.arabic, { color: P.text }]}>{item.arabic}</Text>
            <View style={[styles.refChip, { backgroundColor: accent + '1F' }]}>
              <Ionicons name="bookmark-outline" size={13} color={accent} />
              <Text style={[styles.refText, { color: accent }]}>{item.surah} · {item.ref}</Text>
            </View>
          </Block>
          {item.bangla ? <Block title="বাংলা অনুবাদ"><Text style={[styles.body, { color: P.text }]}>{item.bangla}</Text></Block> : null}
          {item.english ? <Block title="English"><Text style={[styles.body, { color: P.text }]}>{item.english}</Text></Block> : null}
          {(item.info || item.revelation) ? (
            <>
              <Block title={kind === 'dua' ? 'About this dua' : 'About this ayah'}>
                {item.info?.title ? <Text style={[styles.infoTitle, { color: P.text }]}>{item.info.title}</Text> : null}
                {item.revelation ? (
                  <View style={styles.factRow}>
                    {[
                      item.revelation === 'Meccan' ? 'Revealed in Makkah' : item.revelation === 'Medinan' ? 'Revealed in Madinah' : item.revelation,
                      item.meaning ? 'Surah ' + item.surah + ' · "' + item.meaning + '"' : 'Surah ' + item.surah,
                      item.surahAyahs ? item.surahAyahs + ' verses' : null,
                      item.juz ? 'Juz ' + item.juz : null,
                    ].filter(Boolean).map((t) => (
                      <View key={t} style={[styles.factChip, { backgroundColor: accent + '1A' }]}><Text style={[styles.factText, { color: accent }]}>{t}</Text></View>
                    ))}
                  </View>
                ) : null}
                {(kind === 'dua'
                  ? [['person', 'Who made this dua', item.info?.who], ['time', 'When it was said', item.info?.when], ['star', 'Why it matters', item.info?.why], ['repeat', 'When to recite it', item.info?.use]]
                  : [['location', 'Where it comes from', item.info?.context], ['star', 'Why it matters', item.info?.why], ['repeat', 'How to apply it', item.info?.apply]]
                ).filter(([, , text]) => !!text).map(([icon, label, text], i) => (
                  <View key={label} style={[styles.infoRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border }]}>
                    <View style={[styles.infoIcon, { backgroundColor: accent + '1F' }]}><Ionicons name={icon} size={15} color={accent} /></View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.infoLabel, { color: P.sub }]}>{label}</Text>
                      <Text style={[styles.infoText, { color: P.text }]}>{text}</Text>
                    </View>
                  </View>
                ))}
              </Block>
              {item.info?.whyBn ? <Block title="কেন গুরুত্বপূর্ণ"><Text style={[styles.body, { color: P.text }]}>{item.info.whyBn}</Text></Block> : null}
            </>
          ) : null}
          {renderTafsir()}
          {item.translator ? <Text style={[styles.credit, { color: P.sub }]}>Translation: {item.translator}</Text> : null}
        </>
      );
    }

    if (kind === 'word') {
      return (
        <>
          <Block>
            <Text style={[styles.word, { color: P.text }]}>{item.word}</Text>
            {(item.pron || item.pos) ? (
              <View style={styles.metaRow}>
                {item.pron ? <Text style={[styles.metaText, { color: P.sub }]}>/{item.pron}/</Text> : null}
                {item.pos ? <View style={[styles.refChip, { backgroundColor: accent + '1F', marginTop: 0, marginLeft: item.pron ? 10 : 0 }]}><Text style={[styles.refText, { color: accent, marginLeft: 0 }]}>{item.pos}</Text></View> : null}
              </View>
            ) : null}
          </Block>
          {item.definition ? <Block title="Meaning"><Text style={[styles.body, { color: P.text }]}>{item.definition}</Text></Block> : null}
          {item.example ? <Block title="Example"><Text style={[styles.body, { color: P.text, fontStyle: 'italic' }]}>“{item.example}”</Text></Block> : null}
          {item.url ? (
            <TouchableOpacity activeOpacity={0.85} onPress={() => setReader({ url: item.url, title: item.word, source: 'Merriam-Webster' })} style={[styles.linkBtn, { borderColor: accent }]}>
              <Text style={[styles.linkText, { color: accent }]}>Read more at Merriam-Webster</Text>
              <Ionicons name="chevron-forward" size={15} color={accent} />
            </TouchableOpacity>
          ) : null}
          <Text style={[styles.credit, { color: P.sub }]}>Source: Merriam-Webster</Text>
        </>
      );
    }

    if (kind === 'quote') {
      return (
        <>
          <Block>
            <Text style={[styles.quoteMark, { color: accent }]}>“</Text>
            <Text style={[styles.quote, { color: P.text }]}>{item.text}</Text>
            <View style={[styles.authorLine, { borderTopColor: P.border }]}>
              <View style={[styles.authorBar, { backgroundColor: accent }]} />
              <Text style={[styles.author, { color: P.text }]}>{item.author}</Text>
            </View>
          </Block>
          {item.credit ? <Text style={[styles.credit, { color: P.sub }]}>{item.credit}</Text> : null}
        </>
      );
    }

    // fact / joke
    return (
      <>
        <Block><Text style={[styles.bigText, { color: P.text }]}>{item.text}</Text></Block>
        {item.source ? <Text style={[styles.credit, { color: P.sub }]}>Source: {item.source}</Text> : null}
      </>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: P.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          {dark ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} /> : null}
          <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0.6 }} style={StyleSheet.absoluteFill} />
          <Ionicons name={icon} size={150} color="#FFF" style={styles.heroMark} pointerEvents="none" />
          <View style={styles.heroTop}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.roundBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={20} color="#FFF" />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity onPress={loadAnother} disabled={loadingNext} style={[styles.roundBtn, { marginRight: 10 }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {loadingNext ? <ActivityIndicator size="small" color="#FFF" /> : (
                  <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
                    <Ionicons name="refresh" size={18} color="#FFF" />
                  </Animated.View>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={doShare} style={styles.roundBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="share-outline" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.heroLabelRow}>
            <View style={styles.heroDot}><Ionicons name={icon} size={16} color="#FFF" /></View>
            <Text style={styles.heroLabel}>{label}</Text>
          </View>
        </LinearGradient>

        <Animated.View style={[styles.sheet, { opacity: fade }]}>
          {renderBody()}
          {failed ? <Text style={[styles.credit, { color: '#DC2626', marginBottom: 6 }]}>Couldn't load another one right now. Please try again.</Text> : null}
        </Animated.View>
      </ScrollView>
      <ArticleReader data={reader} onClose={() => setReader(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { paddingTop: 50, paddingHorizontal: 18, paddingBottom: 56, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden' },
  heroMark: { position: 'absolute', right: -14, bottom: -24, opacity: 0.1, transform: [{ rotate: '-16deg' }] },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roundBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22 },
  heroDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  heroLabel: { color: '#FFF', fontSize: 17, fontWeight: '500', marginLeft: 10, flexShrink: 1 },
  sheet: { paddingHorizontal: 16, marginTop: -34 },
  block: { borderRadius: 22, borderWidth: 1, padding: 18, marginBottom: 12 },
  blockTitle: { fontSize: 12, fontWeight: '500', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' },
  factRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  factChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, marginRight: 6, marginBottom: 6 },
  factText: { fontSize: 11.5, fontWeight: '500' },
  tafTabs: { flexDirection: 'row', marginBottom: 12 },
  tafTab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 16, marginRight: 8 },
  tafText: { lineHeight: 27, marginBottom: 12 },
  tafMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.2, borderRadius: 16, paddingVertical: 10, marginTop: 2 },
  tafRetry: { borderWidth: 1.2, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 8, marginTop: 10 },
  tafCredit: { fontSize: 11, lineHeight: 16, marginTop: 14, textAlign: 'center' },
  infoTitle: { fontSize: 17, fontWeight: '500', marginBottom: 8, lineHeight: 24 },
  infoRow: { flexDirection: 'row', paddingVertical: 12 },
  infoIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  infoLabel: { fontSize: 11.5, fontWeight: '500', letterSpacing: 0.3, marginBottom: 3 },
  infoText: { fontSize: 14.5, lineHeight: 22, fontWeight: '400' },
  arabic: { fontSize: 28, lineHeight: 54, textAlign: 'right', writingDirection: 'rtl' },
  refChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, marginTop: 12 },
  refText: { fontSize: 12.5, fontWeight: '500', marginLeft: 5 },
  body: { fontSize: 16, lineHeight: 27, fontWeight: '400' },
  word: { fontSize: 36, fontWeight: '600', letterSpacing: -0.6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  metaText: { fontSize: 15, fontStyle: 'italic' },
  quoteMark: { fontSize: 60, lineHeight: 60, fontWeight: '600', opacity: 0.5, marginBottom: -14 },
  quote: { fontSize: 21, lineHeight: 33, fontWeight: '400', fontStyle: 'italic' },
  authorLine: { flexDirection: 'row', alignItems: 'center', marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  authorBar: { width: 3, height: 18, borderRadius: 2, marginRight: 10 },
  author: { fontSize: 15, fontWeight: '500' },
  bigText: { fontSize: 19, lineHeight: 30, fontWeight: '400' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.2, borderRadius: 18, paddingVertical: 12, marginTop: 2, marginBottom: 10 },
  linkText: { fontSize: 14, fontWeight: '500', marginRight: 4 },
  anotherBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 20, paddingVertical: 13, marginTop: 6 },
  anotherText: { color: '#FFF', fontSize: 14.5, fontWeight: '500', marginLeft: 8 },
  credit: { fontSize: 12, textAlign: 'center', marginTop: 6 },
});
