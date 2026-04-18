import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Image, Alert,
} from 'react-native';
import { conversationApi } from '../../api/services';
import { THEMES } from '../../themes/themes';

const THEME_KEYS = Object.keys(THEMES);

export default function ThemeSelectorScreen({ route, navigation }) {
  const { conversationId, currentTheme } = route.params;
  const [selected, setSelected] = useState(currentTheme);
  const [loading, setLoading] = useState(false);

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Chat Theme</Text>
        <TouchableOpacity onPress={handleApply} disabled={loading}>
          <Text style={styles.apply}>{loading ? 'Saving...' : 'Apply'}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={THEME_KEYS}
        keyExtractor={(k) => k}
        contentContainerStyle={styles.list}
        renderItem={({ item: key }) => {
          const theme = THEMES[key];
          const isSelected = key === selected;
          return (
            <TouchableOpacity
              style={[styles.themeCard, isSelected && styles.themeCardSelected]}
              onPress={() => setSelected(key)}
              activeOpacity={0.8}
            >
              {/* Preview bubbles */}
              <View style={[styles.preview, { backgroundColor: theme.background }]}>
                <View style={[styles.receivedBubble, { backgroundColor: theme.receivedBubble }]}>
                  <Text style={{ color: theme.receivedText, fontSize: 12 }}>Hello! 👋</Text>
                </View>
                <View style={[styles.sentBubble, { backgroundColor: theme.sentBubble }]}>
                  <Text style={{ color: theme.sentText, fontSize: 12 }}>Hi there! 😊</Text>
                </View>
              </View>
              <View style={styles.themeInfo}>
                <View style={[styles.previewDot, { backgroundColor: theme.preview }]} />
                <Text style={styles.themeName}>{theme.name}</Text>
                {isSelected && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#FFF',
    borderBottomWidth: 0.5, borderBottomColor: '#EEEEEE',
  },
  back: { color: '#0084FF', fontSize: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  apply: { color: '#0084FF', fontSize: 16, fontWeight: '700' },
  list: { padding: 16, gap: 12 },
  themeCard: {
    borderRadius: 16, overflow: 'hidden', borderWidth: 2.5, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, backgroundColor: '#FFF',
  },
  themeCardSelected: { borderColor: '#0084FF' },
  preview: { padding: 16, gap: 8 },
  receivedBubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  sentBubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-end' },
  themeInfo: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 0.5, borderTopColor: '#EEEEEE', gap: 10,
  },
  previewDot: { width: 16, height: 16, borderRadius: 8 },
  themeName: { fontSize: 15, fontWeight: '600', color: '#1C1C1E', flex: 1 },
  checkmark: { fontSize: 18, color: '#0084FF', fontWeight: '700' },
});
