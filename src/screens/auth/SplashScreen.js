import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Dimensions, Animated, Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import useAuthStore from '../../store/useAuthStore';

const { width, height } = Dimensions.get('window');

export default function SplashScreen({ navigation }) {
  const { isAuthenticated, user, isLoading } = useAuthStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (user?.profileSetup) {
        navigation.replace('MainTabs');
      } else {
        navigation.replace('ProfileSetup');
      }
    }
  }, [isAuthenticated, isLoading, user]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── Background Deep Glossy Gradient ─────────────────────────────── */}
      <LinearGradient
        colors={['#070B19', '#0D1A3A', '#060A17']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Decorative Glossy Ambient Glowing Orbs ───────────────────────── */}
      <View style={styles.ambientOrbTop} />
      <View style={styles.ambientOrbBottom} />

      {/* ── Main Content Showcase ────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.contentContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
          },
        ]}
      >
        {/* Glossy Logo Badge Container */}
        <View style={styles.logoBadgeOuter}>
          <View style={styles.logoBadgeInner}>
            <Image
              source={require('../../../assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Brand Name & Tagline */}
        <Text style={styles.appName}>PriyoChat</Text>
        <Text style={styles.tagline}>Connect. Chat. Belong.</Text>

        {/* Feature Pills */}
        <View style={styles.featuresRow}>
          <View style={styles.featurePill}>
            <Ionicons name="flash-outline" size={13} color="#00C6FF" style={{ marginRight: 4 }} />
            <Text style={styles.featurePillText}>Fast</Text>
          </View>
          <View style={styles.featureDot} />
          <View style={styles.featurePill}>
            <Ionicons name="shield-checkmark-outline" size={13} color="#00C6FF" style={{ marginRight: 4 }} />
            <Text style={styles.featurePillText}>Secure</Text>
          </View>
          <View style={styles.featureDot} />
          <View style={styles.featurePill}>
            <Ionicons name="heart-outline" size={13} color="#00C6FF" style={{ marginRight: 4 }} />
            <Text style={styles.featurePillText}>Personal</Text>
          </View>
        </View>
      </Animated.View>

      {/* ── Glossy Bottom Action Buttons ─────────────────────────────────── */}
      <Animated.View
        style={[
          styles.bottomContainer,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Primary Action Button: Get Started / Create Account */}
        <TouchableOpacity
          style={styles.primaryBtnWrapper}
          onPress={() => navigation.navigate('Signup')}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#0099FF', '#0066FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Get Started</Text>
            <View style={styles.btnIconCircle}>
              <Ionicons name="arrow-forward" size={18} color="#0066FF" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Secondary Glassmorphic Button: Log In */}
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryBtnText}>
            Already have an account? <Text style={styles.loginHighlightText}>Log In</Text>
          </Text>
        </TouchableOpacity>

        {/* Footer Security Badge */}
        <View style={styles.securityBadgeRow}>
          <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.4)" style={{ marginRight: 5 }} />
          <Text style={styles.securityBadgeText}>End-to-end encrypted messaging</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: height * 0.22,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  ambientOrbTop: {
    position: 'absolute',
    top: -height * 0.1,
    right: -width * 0.2,
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: (width * 0.9) / 2,
    backgroundColor: 'rgba(0, 132, 255, 0.18)',
  },
  ambientOrbBottom: {
    position: 'absolute',
    bottom: -height * 0.15,
    left: -width * 0.2,
    width: width * 1.0,
    height: width * 1.0,
    borderRadius: (width * 1.0) / 2,
    backgroundColor: 'rgba(0, 198, 255, 0.12)',
  },

  // ── Content Styles ───────────────────────────────────────────────────
  contentContainer: {
    alignItems: 'center',
    width: '100%',
  },
  logoBadgeOuter: {
    width: 124,
    height: 124,
    borderRadius: 36,
    padding: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    marginBottom: 24,
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  logoBadgeInner: {
    flex: 1,
    borderRadius: 33,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 108,
    height: 108,
    borderRadius: 28,
  },
  appName: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 0.3,
    marginBottom: 20,
  },
  featuresRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featurePillText: {
    color: '#E4E6EB',
    fontSize: 12,
    fontWeight: '500',
  },
  featureDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 10,
  },

  // ── Bottom Section Styles ─────────────────────────────────────────────
  bottomContainer: {
    width: '100%',
    alignItems: 'center',
  },
  primaryBtnWrapper: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    paddingHorizontal: 24,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginRight: 10,
  },
  btnIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  secondaryBtnText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 15,
    fontWeight: '500',
  },
  loginHighlightText: {
    color: '#00C6FF',
    fontWeight: '700',
  },
  securityBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  securityBadgeText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    fontWeight: '400',
  },
});
