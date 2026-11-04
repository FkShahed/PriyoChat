import React, { useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * Image with pinch-to-zoom, drag-to-pan (while zoomed) and double-tap zoom. Works on Android and
 * iOS (uses gesture-handler, not ScrollView zoom which is iOS-only).
 * Must be rendered inside a GestureHandlerRootView (inside a <Modal> add its own — see viewers).
 * `onTap` fires on a single tap (used to close the viewer).
 */
export default function ZoomableImage({ uri, width, height, onTap }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;

  // Last committed values (plain numbers, so we never read from Animated.Value)
  const saved = useRef({ scale: 1, tx: 0, ty: 0 }).current;

  const clampPan = (s, x, y) => {
    const maxX = ((s - 1) * width) / 2;
    const maxY = ((s - 1) * height) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const animateTo = (s, x, y) => {
    saved.scale = s; saved.tx = x; saved.ty = y;
    Animated.parallel([
      Animated.timing(scale, { toValue: s, duration: 200, useNativeDriver: true }),
      Animated.timing(tx, { toValue: x, duration: 200, useNativeDriver: true }),
      Animated.timing(ty, { toValue: y, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onUpdate((e) => {
      const s = Math.max(0.8, Math.min(MAX_SCALE, saved.scale * e.scale));
      scale.setValue(s);
    })
    .onEnd((e) => {
      let s = Math.max(1, Math.min(MAX_SCALE, saved.scale * e.scale));
      if (s <= 1.02) {
        animateTo(1, 0, 0);
        return;
      }
      const p = clampPan(s, saved.tx, saved.ty);
      animateTo(s, p.x, p.y);
    });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((e) => {
      if (saved.scale <= 1) return;
      const p = clampPan(saved.scale, saved.tx + e.translationX, saved.ty + e.translationY);
      tx.setValue(p.x);
      ty.setValue(p.y);
    })
    .onEnd((e) => {
      if (saved.scale <= 1) return;
      const p = clampPan(saved.scale, saved.tx + e.translationX, saved.ty + e.translationY);
      saved.tx = p.x;
      saved.ty = p.y;
    });

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((e, success) => {
      if (!success) return;
      if (saved.scale > 1.05) {
        animateTo(1, 0, 0);
      } else {
        // Zoom into the tapped point
        const fx = e.x - width / 2;
        const fy = e.y - height / 2;
        const p = clampPan(
          DOUBLE_TAP_SCALE,
          -fx * (DOUBLE_TAP_SCALE - 1),
          -fy * (DOUBLE_TAP_SCALE - 1)
        );
        animateTo(DOUBLE_TAP_SCALE, p.x, p.y);
      }
    });

  const singleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd((e, success) => {
      if (success && onTap) onTap();
    });

  const taps = Gesture.Exclusive(doubleTap, singleTap);
  const composed = Gesture.Simultaneous(pinch, pan, taps);

  return (
    <GestureDetector gesture={composed}>
      <View style={[styles.box, { width, height }]} collapsable={false}>
        <Animated.Image
          source={{ uri }}
          resizeMode="contain"
          style={{
            width,
            height,
            transform: [{ translateX: tx }, { translateY: ty }, { scale }],
          }}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
