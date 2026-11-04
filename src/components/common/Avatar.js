import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useThemeStore from '../../store/useThemeStore';

/**
 * Profile picture with a built-in default.
 * The default picture (a neutral person silhouette) is ALWAYS drawn underneath, and the real photo
 * is layered on top of it. So when a user has no photo, the photo is still loading, or it failed to
 * load, the default shows instead of a blank circle or initials.
 *
 * Pass the same style you used for the old <Image> (width / height / borderRadius ...) — the size
 * is read from it.
 */
export default function Avatar({ uri, style, children }) {
  const isDark = useThemeStore((s) => s.resolvedTheme === 'dark');
  const [failed, setFailed] = useState(false);

  // A new photo URL deserves a fresh attempt
  useEffect(() => { setFailed(false); }, [uri]);

  const flat = StyleSheet.flatten(style) || {};
  const size = typeof flat.width === 'number' ? flat.width : 48;
  const showPhoto = !!uri && !failed;

  return (
    <View style={[style, styles.clip]}>
      <LinearGradient
        colors={isDark ? ['#3B4250', '#272C36'] : ['#CBD5E3', '#A8B6CA']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Person silhouette: head + shoulders, sitting low so it looks like a classic default avatar */}
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Ionicons
          name="person"
          size={Math.round(size * 0.62)}
          color={isDark ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.92)'}
          style={{ marginTop: Math.round(size * 0.06) }}
        />
      </View>
      {showPhoto ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
