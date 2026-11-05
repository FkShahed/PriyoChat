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
    if (kind === 'ayah' || kind === 'dua') return ['📖 ' + item.surah + ' ' + item.ref, item.arabic, item.bangla, item.english].join(NL + NL);
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
