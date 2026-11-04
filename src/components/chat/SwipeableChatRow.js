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

  // Buttons grow slightly as they are revealed
  const actionsScale = translateX.interpolate({
    inputRange: [-TOTAL_ACTIONS_WIDTH, -20, 0],
    outputRange: [1, 0.85, 0.7],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* ── Background Action Buttons (Revealed ONLY on Swipe) ── */}
      <Animated.View
        style={[styles.actionsContainer, { opacity: actionsOpacity, transform: [{ scale: actionsScale }] }]}
      >
        {/* Archive Action */}
        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.7}
          onPress={() => {
            close();
            onArchive?.();
          }}
        >
          <LinearGradient
            colors={isArchived ? ['#34D399', '#10B981'] : ['#818CF8', '#6366F1']}
            style={styles.actionCircle}
          >
            <Ionicons name={isArchived ? 'file-tray' : 'archive'} size={21} color="#FFF" />
          </LinearGradient>
          <Text style={[styles.actionText, { color: isArchived ? '#10B981' : '#6366F1' }]}>
            {isArchived ? 'Unarchive' : 'Archive'}
          </Text>
        </TouchableOpacity>

        {/* Mute Action */}
        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.7}
          onPress={() => {
            close();
            onMute?.();
          }}
        >
          <LinearGradient
            colors={isMuted ? ['#A78BFA', '#8B5CF6'] : ['#FBBF24', '#F59E0B']}
            style={styles.actionCircle}
          >
            <Ionicons name={isMuted ? 'notifications' : 'notifications-off'} size={21} color="#FFF" />
          </LinearGradient>
          <Text style={[styles.actionText, { color: isMuted ? '#8B5CF6' : '#F59E0B' }]}>
            {isMuted ? 'Unmute' : 'Mute'}
          </Text>
        </TouchableOpacity>

        {/* Delete Action */}
        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.7}
          onPress={() => {
            close();
            onDelete?.();
          }}
        >
          <LinearGradient colors={['#F87171', '#EF4444']} style={styles.actionCircle}>
            <Ionicons name="trash" size={21} color="#FFF" />
          </LinearGradient>
          <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete</Text>
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
    borderRadius: 18,
    overflow: 'hidden',
  },
  actionsContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: TOTAL_ACTIONS_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionBtn: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'center',
  },
  foreground: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
  },
});
