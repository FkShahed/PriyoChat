import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

export default function SplashScreen({ navigation }) {
  return (
    <LinearGradient colors={['#0084FF', '#0040CC', '#001A80']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <Animated.View entering={FadeInUp.delay(200).duration(800)} style={styles.logoContainer}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoEmoji}>💬</Text>
        </View>
        <Text style={styles.appName}>PriyoChat</Text>
        <Text style={styles.tagline}>Connect. Chat. Share.</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(600).duration(800)} style={styles.buttons}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Get Started</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('Signup')}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>Create Account</Text>
        </TouchableOpacity>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 80 },
  logoContainer: { alignItems: 'center', marginTop: 60 },
  logoCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },
  logoEmoji: { fontSize: 60 },
  appName: {
    fontSize: 42, fontWeight: '800', color: '#FFF',
    letterSpacing: 1, marginBottom: 8,
  },
  tagline: { fontSize: 16, color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5 },
  buttons: { width: '100%', paddingHorizontal: 32, gap: 12 },
  primaryBtn: {
    backgroundColor: '#FFF', borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 5,
  },
  primaryBtnText: { color: '#0084FF', fontSize: 17, fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  secondaryBtnText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
});
