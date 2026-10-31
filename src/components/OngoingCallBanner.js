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
  const slideAnim = useRef(new Animated.Value(100)).current;
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
        toValue: 100,
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
          activeOpacity={0.88}
          onPress={handleReturnToCall}
          style={[
            styles.cardTouchable,
            isDark ? styles.cardDark : styles.cardLight,
          ]}
        >
          {/* Avatar with call type mini badge */}
          <View style={styles.avatarWrapper}>
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
              <Ionicons
                name={callType === 'video' ? 'videocam' : 'call'}
                size={9}
                color="#FFFFFF"
              />
            </View>
          </View>

          {/* Simple, gentle eye-pleasing text column */}
          <View style={styles.infoCol}>
            <Text
              style={[styles.nameText, isDark ? styles.textLight : styles.textDark]}
              numberOfLines={1}
            >
              {callerName}
            </Text>
            <View style={styles.statusRow}>
              <View style={styles.indicatorContainer}>
                <Animated.View
                  style={[
                    styles.pulseDot,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                />
                <View style={styles.greenDot} />
              </View>
              <Text style={styles.durationText}>{durationText}</Text>
              <Text style={[styles.subText, isDark ? styles.subDark : styles.subLight]}>
                • In call
              </Text>
            </View>
          </View>

          {/* Clean minimal red circular hangup button */}
          <TouchableOpacity
            onPress={handleEndCall}
            activeOpacity={0.7}
            style={styles.endBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="call"
              size={15}
              color="#FFFFFF"
              style={{ transform: [{ rotate: '135deg' }] }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    bottom: 66,
    left: 0,
    right: 0,
    zIndex: 99999,
  },
  container: {
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  cardTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 24,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  cardDark: {
    backgroundColor: '#1E232E',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0, 0, 0, 0.06)',
    shadowColor: '#000',
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  avatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E5EA',
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackLight: {
    backgroundColor: '#EBF4FF',
  },
  avatarFallbackDark: {
    backgroundColor: '#2A364F',
  },
  initialsText: {
    fontSize: 12,
    fontWeight: '600',
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
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0084FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  nameText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  textLight: {
    color: '#F3F4F6',
  },
  textDark: {
    color: '#1F2937',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  indicatorContainer: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
    position: 'relative',
  },
  pulseDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.35)',
  },
  greenDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  durationText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#10B981',
  },
  subText: {
    fontSize: 11,
    fontWeight: '400',
    marginLeft: 4,
  },
  subDark: {
    color: '#9CA3AF',
  },
  subLight: {
    color: '#6B7280',
  },
  endBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
