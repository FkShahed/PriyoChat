import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  SafeAreaView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import useCallStore from '../store/useCallStore';
import useSocketStore from '../store/useSocketStore';
import { navigationRef } from '../navigation/navigationRef';
import NotificationService from '../services/NotificationService';
import { getInitials } from '../utils/helpers';
import useThemeStore from '../store/useThemeStore';

function formatDuration(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function OngoingCallBanner() {
  if (Platform.OS === 'web') return null;
  const callState = useCallStore((s) => s.callState);
  const remoteUser = useCallStore((s) => s.remoteUser);
  const callType = useCallStore((s) => s.callType);
  const setIsMinimized = useCallStore((s) => s.setIsMinimized);
  const endCall = useCallStore((s) => s.endCall);
  const resetCall = useCallStore((s) => s.resetCall);
  const { emit } = useSocketStore();
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const isDark = resolvedTheme === 'dark';

  const isMinimized = useCallStore((s) => s.isMinimized);
  const slideAnim = useRef(new Animated.Value(160)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const isCallActive =
    (callState === 'active' || callState === 'calling' || callState === 'connecting' || callState === 'ringing') &&
    Boolean(remoteUser);
  const shouldShow = Boolean(isMinimized) && isCallActive;

  // Animate slide up from bottom when minimized / outside Call screen
  useEffect(() => {
    if (shouldShow) {
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 80,
        friction: 10,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 160,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  }, [shouldShow]);

  // Subtle pulsing animation on green live indicator
  useEffect(() => {
    let loop;
    if (shouldShow) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 800, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: Platform.OS !== 'web' }),
        ])
      );
      loop.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => loop?.stop();
  }, [shouldShow]);

  // Sync ongoing notification ONLY when minimized
  useEffect(() => {
    if (shouldShow && callState === 'active' && remoteUser) {
      NotificationService.showOngoingCallNotification({
        remoteUser,
        callType: callType || 'audio',
        duration: bannerSecs,
      });
    } else {
      NotificationService.dismissOngoingCallNotification();
    }
  }, [shouldShow, callState, remoteUser, bannerSecs, callType]);

  const handleReturnToCall = () => {
    setIsMinimized(false);
    if (navigationRef.isReady()) {
      navigationRef.navigate('Call', {
        otherUser: remoteUser,
        callType: callType || 'audio',
      });
    }
  };

  const handleEndCall = (e) => {
    e?.stopPropagation?.();
    const targetUserId =
      (typeof remoteUser === 'string' ? remoteUser : (remoteUser?._id || remoteUser?.id)) ||
      useCallStore.getState().remoteUserId;

    if (targetUserId) {
      emit('call_end', {
        to: targetUserId,
        callType: callType || 'audio',
        duration: bannerSecs,
      });
    }
    NotificationService.dismissOngoingCallNotification();
    endCall('ended');
    resetCall();
  };

  const [bannerSecs, setBannerSecs] = useState(0);
  useEffect(() => {
    let interval = null;
    if (shouldShow && callState === 'active') {
      // Sync immediately from the authoritative callStartTime so the banner
      // shows the correct elapsed time with no delay or zero-reset.
      const syncTime = () => {
        const t = useCallStore.getState().callStartTime;
        if (t) {
          setBannerSecs(Math.floor((Date.now() - t) / 1000));
        } else {
          setBannerSecs((s) => s + 1);
        }
      };
      syncTime(); // instant sync on show
      interval = setInterval(syncTime, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [shouldShow, callState]);

  if (Platform.OS === 'web' || !shouldShow) return null;

  const callerName = remoteUser?.name || 'PriyoChat User';
  const durationText =
    callState === 'active'
      ? formatDuration(bannerSecs)
      : (callState === 'calling' ? 'Calling...' : 'Connecting...');

  return (
    <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.container,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleReturnToCall}
          style={[styles.cardTouchable, isDark ? styles.cardDark : styles.cardLight]}
        >
          <LinearGradient
            colors={isDark ? ['#1F2937', '#111827'] : ['#FFFFFF', '#EEF4FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardInner}
          >
            {/* green accent strip on the left: the call is live */}
            <View style={styles.accent} />

            {/* Avatar with a softly pulsing green ring and a call-type badge */}
            <View style={styles.avatarWrapper}>
              <Animated.View style={[styles.ring, { transform: [{ scale: pulseAnim }] }]} />
              {remoteUser?.avatar ? (
                <Image source={{ uri: remoteUser.avatar }} style={styles.avatarImg} />
              ) : (
                <View style={[styles.avatarFallback, isDark ? styles.avatarFallbackDark : styles.avatarFallbackLight]}>
                  <Text style={[styles.initialsText, isDark ? styles.initialsDark : styles.initialsLight]}>
                    {getInitials(callerName)}
                  </Text>
                </View>
              )}
              <View style={styles.typeBadge}>
                <Ionicons name={callType === 'video' ? 'videocam' : 'call'} size={10} color="#FFFFFF" />
              </View>
            </View>

            {/* Name, then the running time and a hint that the whole card returns to the call */}
            <View style={styles.infoCol}>
              <Text style={[styles.nameText, isDark ? styles.textLight : styles.textDark]} numberOfLines={1}>
                {callerName}
              </Text>
              <View style={styles.statusRow}>
                <View style={styles.timePill}>
                  <View style={styles.greenDot} />
                  <Text style={styles.durationText}>{durationText}</Text>
                </View>
                <Text style={[styles.subText, isDark ? styles.subDark : styles.subLight]} numberOfLines={1}>
                  Tap to return
                </Text>
                <Ionicons name="chevron-forward" size={12} color={isDark ? '#9CA3AF' : '#6B7280'} />
              </View>
            </View>

            {/* Red hang-up button */}
            <TouchableOpacity
              onPress={handleEndCall}
              activeOpacity={0.75}
              style={styles.endBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="call" size={18} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // the floating tab bar is 58 high and sits 14 (Android) / 22 (iOS) from the bottom; keep a clear gap above it
  safeArea: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 92 : 84,
    left: 0,
    right: 0,
    zIndex: 99999,
  },
  container: {
    paddingHorizontal: 14,
    paddingBottom: 2,
  },
  cardTouchable: {
    borderRadius: 22,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 10,
  },
  cardDark: {
    borderColor: 'rgba(16, 185, 129, 0.35)',
    shadowColor: '#000',
  },
  cardLight: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
    shadowColor: '#0B3B2A',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: 21,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#10B981',
  },
  avatarWrapper: {
    position: 'relative',
    width: 46,
    height: 46,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: 'rgba(16, 185, 129, 0.45)',
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E5EA',
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackLight: {
    backgroundColor: '#DCEBFF',
  },
  avatarFallbackDark: {
    backgroundColor: '#2A364F',
  },
  initialsText: {
    fontSize: 14,
    fontWeight: '700',
  },
  initialsLight: {
    color: '#0084FF',
  },
  initialsDark: {
    color: '#60A5FA',
  },
  typeBadge: {
    position: 'absolute',
    bottom: -1,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  nameText: {
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  textLight: {
    color: '#F9FAFB',
  },
  textDark: {
    color: '#111827',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    marginRight: 8,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 5,
  },
  durationText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
    fontVariant: ['tabular-nums'],
  },
  subText: {
    fontSize: 11.5,
    fontWeight: '500',
    marginRight: 2,
  },
  subDark: {
    color: '#9CA3AF',
  },
  subLight: {
    color: '#6B7280',
  },
  endBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
});
