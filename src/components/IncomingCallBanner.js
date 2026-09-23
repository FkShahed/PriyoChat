import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
  Platform,
  SafeAreaView,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useCallStore from '../store/useCallStore';
import useSocketStore from '../store/useSocketStore';
import { navigationRef } from '../navigation/navigationRef';
import { getInitials } from '../utils/helpers';

export default function IncomingCallBanner() {
  const { callState, remoteUser, callType, isReceiver, setCallAccepted, endCall } = useCallStore();
  const { emit } = useSocketStore();

  const slideAnim = useRef(new Animated.Value(-220)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [currentRoute, setCurrentRoute] = useState(null);

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
  const isVisible = callState === 'incoming' && isReceiver && !!remoteUser && !isOnCallScreen;

  // Gentle pulse animation for avatar
  useEffect(() => {
    let loop;
    if (isVisible) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.12,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();

      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 45,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      pulseAnim.setValue(1);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -220,
          duration: 200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
    return () => loop?.stop();
  }, [isVisible]);

  if (!isVisible) return null;

  const handleAccept = () => {
    setCallAccepted();
    if (navigationRef.isReady()) {
      navigationRef.navigate('Call', {
        otherUser: remoteUser,
        callType,
      });
    }
  };

  const handleDecline = () => {
    if (remoteUser?._id) {
      emit('call_reject', { to: remoteUser._id });
    }
    endCall('rejected');
  };

  const handleOpenFull = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('IncomingCall');
    }
  };

  return (
    <SafeAreaView style={styles.safeAreaPointerEvents} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.container,
          {
            opacity: opacityAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.94}
          onPress={handleOpenFull}
          style={styles.touchableCard}
        >
          <LinearGradient
            colors={['#0B0F19', '#141D2E', '#0F172A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGradient}
          >
            {/* Top Glow Accent Bar */}
            <LinearGradient
              colors={['#0084FF', '#00C6FF', '#30D158']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.topAccentBar}
            />

            {/* TOP ROW: Caller Avatar & Info */}
            <View style={styles.topInfoRow}>
              <View style={styles.avatarWrapper}>
                <Animated.View
                  style={[
                    styles.avatarPulseRing,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                />
                {remoteUser?.avatar ? (
                  <Image source={{ uri: remoteUser.avatar }} style={styles.avatarImage} />
                ) : (
                  <LinearGradient
                    colors={['#0084FF', '#00C6FF']}
                    style={styles.avatarFallback}
                  >
                    <Text style={styles.initialsText}>{getInitials(remoteUser?.name)}</Text>
                  </LinearGradient>
                )}
              </View>

              <View style={styles.callerTextContainer}>
                <Text style={styles.callerNameText} numberOfLines={1}>
                  {remoteUser?.name || 'PriyoChat User'}
                </Text>
                <View style={styles.callTypeCapsule}>
                  <View style={styles.liveGreenDot} />
                  <Ionicons
                    name={callType === 'video' ? 'videocam' : 'call'}
                    size={13}
                    color="#00C6FF"
                  />
                  <Text style={styles.callTypeText}>
                    {callType === 'video' ? 'Incoming Video Call...' : 'Incoming Audio Call...'}
                  </Text>
                </View>
              </View>
            </View>

            {/* BOTTOM ROW: Spacious Action Buttons at the Bottom */}
            <View style={styles.bottomButtonsRow}>
              {/* Decline Button (Left) */}
              <TouchableOpacity
                style={[styles.actionButtonTouch, styles.declineMargin]}
                onPress={handleDecline}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#FF453A', '#D7261E']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}
                >
                  <Ionicons
                    name="call"
                    size={18}
                    color="#FFF"
                    style={{ transform: [{ rotate: '135deg' }] }}
                  />
                  <Text style={styles.buttonText}>Decline</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Answer Button (Right) */}
              <TouchableOpacity
                style={[styles.actionButtonTouch, styles.acceptMargin]}
                onPress={handleAccept}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#34C759', '#24B24B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}
                >
                  <Ionicons
                    name={callType === 'video' ? 'videocam' : 'call'}
                    size={18}
                    color="#FFF"
                  />
                  <Text style={styles.buttonText}>Answer</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaPointerEvents: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 10 : 34,
    left: 0,
    right: 0,
    zIndex: 99999,
    elevation: 99999,
  },
  container: {
    paddingHorizontal: 12,
  },
  touchableCard: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 198, 255, 0.25)',
  },
  cardGradient: {
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    position: 'relative',
  },
  topAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  topInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarPulseRing: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(0, 198, 255, 0.5)',
    backgroundColor: 'rgba(0, 198, 255, 0.1)',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#00C6FF',
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: '#FFF',
    fontSize: 19,
    fontWeight: '800',
  },
  callerTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  callerNameText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  callTypeCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveGreenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#30D158',
  },
  callTypeText: {
    color: '#00C6FF',
    fontSize: 12,
    fontWeight: '600',
  },

  /* BOTTOM BUTTONS ROW */
  bottomButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionButtonTouch: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
  },
  declineMargin: {
    marginRight: 7,
  },
  acceptMargin: {
    marginLeft: 7,
  },
  buttonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
