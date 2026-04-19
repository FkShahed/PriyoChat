import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ImageBackground, StatusBar, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { conversationApi } from '../../api/services';
import { THEMES } from '../../themes/themes';
import { useColors } from '../../store/useThemeStore';

const THEME_KEYS = Object.keys(THEMES);

// Group themes into pairs for 2-column grid
function groupInPairs(arr) {
  const pairs = [];
  for (let i = 0; i < arr.length; i += 2) {
    pairs.push(arr.slice(i, i + 2));
  }
  return pairs;
}

export default function ThemeSelectorScreen({ route, navigation }) {
  const { conversationId, currentTheme } = route.params;
  const [selected, setSelected] = useState(currentTheme);
  const [loading, setLoading] = useState(false);
  const C = useColors();

  const handleApply = async () => {
    if (selected === currentTheme) return navigation.goBack();
    setLoading(true);
    try {
      await conversationApi.updateTheme(conversationId, selected);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', 'Failed to change theme');
    } finally {
      setLoading(false);
    }
  };

  const pairs = groupInPairs(THEME_KEYS);

  const renderPair = ({ item: pair }) => (
    <View style={styles.row}>
      {pair.map((key) => {
        const theme = THEMES[key];
        const isSelected = key === selected;
        const BgComp = theme.bgImage ? ImageBackground : View;
        const bgProps = theme.bgImage
          ? { source: theme.bgImage, resizeMode: 'cover' }
          : {};

        return (
          <TouchableOpacity
            key={key}
            style={[
              styles.card,
              { backgroundColor: C.surface, borderColor: isSelected ? '#0084FF' : 'transparent' },
            ]}
            onPress={() => setSelected(key)}
            activeOpacity={0.8}
          >
            {/* Preview area with background */}
            <BgComp style={[styles.preview, { backgroundColor: theme.background }]} {...bgProps}>
              {/* Gradient header strip */}
              <View style={[styles.headerStrip, { backgroundColor: theme.gradient?.[0] || theme.headerBg }]} />

              {/* Bubbles */}
              <View style={styles.bubblesArea}>
                <View style={[styles.receivedBubble, { backgroundColor: theme.receivedBubble }]}>
                  <Text style={{ color: theme.receivedText, fontSize: 10 }}>Hello! 👋</Text>
                </View>
                <View style={[styles.sentBubble, { backgroundColor: theme.sentBubble }]}>
                  <Text style={{ color: theme.sentText, fontSize: 10 }}>Hi there! 😊</Text>
                </View>
              </View>

              {/* Selected overlay */}
              {isSelected && (
                <View style={styles.selectedOverlay}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={18} color="#FFF" />
                  </View>
                </View>
              )}
            </BgComp>

            {/* Label row */}
            <View style={[styles.labelRow, { borderTopColor: C.border }]}>
              <View style={[styles.dot, { backgroundColor: theme.preview }]} />
              <Text style={[styles.themeName, { color: C.text }]} numberOfLines={1}>{theme.name}</Text>
              {isSelected && <Ionicons name="checkmark-circle" size={18} color="#0084FF" />}
            </View>
          </TouchableOpacity>
        );
      })}
      {/* Pad odd item at end */}
      {pair.length < 2 && <View style={styles.cardPlaceholder} />}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={C.bg === '#121212' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#0084FF" />
          <Text style={styles.headerBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: C.text }]}>Chat Theme</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={handleApply} disabled={loading}>
          <Text style={[styles.applyText, loading && { opacity: 0.5 }]}>
            {loading ? 'Saving…' : 'Apply'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Theme grid — scrollable FlatList */}
      <FlatList
        data={pairs}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderPair}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 0.5,
  },
  headerBtn: { flexDirection: 'row', alignItems: 'center', minWidth: 64 },
  headerBtnText: { color: '#0084FF', fontSize: 16, marginLeft: 2 },
  title: { fontSize: 17, fontWeight: '700' },
  applyText: { color: '#0084FF', fontSize: 16, fontWeight: '700' },

  list: { padding: 12, paddingBottom: 32 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },

  card: {
    flex: 1, borderRadius: 18, overflow: 'hidden',
    borderWidth: 2.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  cardPlaceholder: { flex: 1 },

  preview: {
    height: 130,
    overflow: 'hidden',
  },
  headerStrip: { height: 22, width: '100%' },
  bubblesArea: { flex: 1, paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  receivedBubble: {
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
    alignSelf: 'flex-start', maxWidth: '70%',
  },
  sentBubble: {
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
    alignSelf: 'flex-end', maxWidth: '70%',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,132,255,0.12)',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    padding: 8,
  },
  checkCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#0084FF',
    alignItems: 'center', justifyContent: 'center',
  },

  labelRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 0.5, gap: 8,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  themeName: { flex: 1, fontSize: 13, fontWeight: '600' },
});
