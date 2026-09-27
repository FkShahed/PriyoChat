import React, { useRef } from 'react';
import {
  View,
  Text,
  Animated,
  PanResponder,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const ACTION_WIDTH = 70;
const TOTAL_ACTIONS_WIDTH = ACTION_WIDTH * 3; // 210

export default function SwipeableChatRow({
  children,
  isArchived = false,
  isMuted = false,
  onArchive,
  onMute,
  onDelete,
  onPress,
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const close = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start(() => {
      isOpen.current = false;
    });
  };

  const open = () => {
    Animated.spring(translateX, {
      toValue: -TOTAL_ACTIONS_WIDTH,
      useNativeDriver: true,
      bounciness: 4,
    }).start(() => {
      isOpen.current = true;
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only trigger horizontal pan if dx is horizontal and user is swiping left or closing
        return (
          Math.abs(gestureState.dx) > 10 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5
        );
      },
      onPanResponderGrant: () => {
        translateX.extractOffset();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(gestureState.dx);
        } else if (isOpen.current) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        translateX.flattenOffset();
        const currentVal = translateX._value || 0;

        if (gestureState.dx < -50 || currentVal < -TOTAL_ACTIONS_WIDTH / 2) {
          open();
        } else {
          close();
        }
      },
      onPanResponderTerminate: () => {
        translateX.flattenOffset();
        close();
      },
    })
  ).current;

  // Actions opacity interpolation — only visible when swiped left
  const actionsOpacity = translateX.interpolate({
    inputRange: [-TOTAL_ACTIONS_WIDTH, -20, 0, 50],
    outputRange: [1, 0.8, 0, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* ── Background Action Buttons (Revealed ONLY on Swipe) ── */}
      <Animated.View style={[styles.actionsContainer, { opacity: actionsOpacity }]}>
        {/* Archive Action */}
        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.8}
          onPress={() => {
            close();
            onArchive?.();
          }}
        >
          <LinearGradient
            colors={isArchived ? ['#10B981', '#059669'] : ['#6366F1', '#4F46E5']}
            style={styles.actionGradient}
          >
            <Ionicons
              name={isArchived ? 'file-tray-outline' : 'archive-outline'}
              size={20}
              color="#FFF"
            />
            <Text style={styles.actionText}>{isArchived ? 'Unarchive' : 'Archive'}</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Mute Action */}
        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.8}
          onPress={() => {
            close();
            onMute?.();
          }}
        >
          <LinearGradient
            colors={isMuted ? ['#8B5CF6', '#7C3AED'] : ['#F59E0B', '#D97706']}
            style={styles.actionGradient}
          >
            <Ionicons
              name={isMuted ? 'volume-high-outline' : 'volume-mute-outline'}
              size={20}
              color="#FFF"
            />
            <Text style={styles.actionText}>{isMuted ? 'Unmute' : 'Mute'}</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Delete Action */}
        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.8}
          onPress={() => {
            close();
            onDelete?.();
          }}
        >
          <LinearGradient
            colors={['#EF4444', '#DC2626']}
            style={styles.actionGradient}
          >
            <Ionicons name="trash-outline" size={20} color="#FFF" />
            <Text style={styles.actionText}>Delete</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Foreground Swipeable Row Content ── */}
      <Animated.View
        style={[
          styles.foreground,
          {
            transform: [
              {
                translateX: translateX.interpolate({
                  inputRange: [-TOTAL_ACTIONS_WIDTH - 50, -TOTAL_ACTIONS_WIDTH, 0, 50],
                  outputRange: [-TOTAL_ACTIONS_WIDTH - 20, -TOTAL_ACTIONS_WIDTH, 0, 0],
                  extrapolate: 'clamp',
                }),
              },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            if (isOpen.current) {
              close();
            } else {
              onPress?.();
            }
          }}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginVertical: 3,
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionsContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: TOTAL_ACTIONS_WIDTH,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionBtn: {
    width: ACTION_WIDTH,
    height: '100%',
  },
  actionGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
  },
  foreground: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
});
