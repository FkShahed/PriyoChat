import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useCallStore from '../store/useCallStore';
import useSocketStore from '../store/useSocketStore';
import { navigationRef } from '../navigation/navigationRef';
import NotificationService from '../services/NotificationService';

function formatDuration(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function OngoingCallBanner() {
  const {
    callState,
    remoteUser,
    callType,
    callDuration,
    setIsMinimized,
    endCall,
    resetCall,
  } = useCallStore();
  const { emit } = useSocketStore();

  const [currentRoute, setCurrentRoute] = useState(null);
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Track active navigation route
  useEffect(() => {
    const updateRoute = () => {
      if (navigationRef.isReady()) {
        const route = navigationRef.getCurrentRoute()?.name;
        setCurrentRoute(route);
      }
    };
    updateRoute();
    const interval = setInterval(updateRoute, 300);
    return () => clearInterval(interval);
  }, []);

  const isOnCallScreen = currentRoute === 'Call' || currentRoute === 'IncomingCall';
  const isCallActive =
    (callState === 'active' || callState === 'calling' || callState === 'connecting' || callState === 'ringing') &&
    !!remoteUser;
  // Banner is visible whenever in call and NOT on the full Call screen!
  const shouldShow = isCallActive && !isOnCallScreen;

  // Animate slide down when minimized / outside Call screen
  useEffect(() => {
    if (shouldShow) {
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [shouldShow]);

  // Subtle pulsing animation on green live indicator
  useEffect(() => {
    let loop;
    if (shouldShow) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      loop.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => loop?.stop();
  }, [shouldShow]);

  // Sync ongoing notification with caller name, duration, and End Call action
  useEffect(() => {
    if (callState === 'active' && remoteUser) {
      NotificationService.showOngoingCallNotification({
        remoteUser,
        callType: callType || 'audio',
        duration: callDuration,
      });
    } else if (callState === 'idle' || callState === 'ended') {
      NotificationService.dismissOngoingCallNotification();
    }
  }, [callState, remoteUser, callDuration, callType]);

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
        duration: callDuration,
      });
    }
    NotificationService.dismissOngoingCallNotification();
    endCall('ended');
    resetCall();
  };

  if (!shouldShow) return null;

  const callerName = remoteUser?.name || 'PriyoChat User';
  const durationText =
    callState === 'active'
      ? formatDuration(callDuration)
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
          style={styles.pillTouchable}
        >
          <LinearGradient
            colors={['#10B981', '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.pillGradient}
          >
            {/* Live Indicator Dot */}
            <View style={styles.indicatorContainer}>
              <Animated.View
                style={[
                  styles.pulseCircle,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              />
              <Ionicons
                name={callType === 'video' ? 'videocam' : 'call'}
                size={16}
                color="#FFFFFF"
              />
            </View>

            {/* Middle Section: Name & Duration */}
            <View style={styles.infoCol}>
              <Text style={styles.nameText} numberOfLines={1}>
                {callerName}
              </Text>
              <Text style={styles.statusText}>
                {callType === 'video' ? 'Video Call  ' : 'Audio Call  '}
                <Text style={styles.durationBold}>{durationText}</Text>
                {' (Tap to return)'}
              </Text>
            </View>

            {/* End Call Button right in the banner */}
            <TouchableOpacity
              onPress={handleEndCall}
              activeOpacity={0.8}
              style={styles.endBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <LinearGradient
                colors={['#EF4444', '#DC2626']}
                style={styles.endBtnGradient}
              >
                <Ionicons name="call" size={16} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
  },
  container: {
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 8,
  },
  pillTouchable: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  },
  pillGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  indicatorContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    position: 'relative',
  },
  pulseCircle: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  nameText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  statusText: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  durationBold: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  endBtn: {
    marginLeft: 8,
    borderRadius: 17,
    overflow: 'hidden',
  },
  endBtnGradient: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
