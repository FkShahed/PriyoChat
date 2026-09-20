import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  ActivityIndicator, Animated, StatusBar, Dimensions, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import GoogleSignInButton from '../../components/common/GoogleSignInButton';

const { width, height } = Dimensions.get('window');

export default function LoginScreen({ navigation }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPw, setShowPw]     = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const login   = useAuthStore((s) => s.login);
  const connect = useSocketStore((s) => s.connect);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const scaleAnim = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]).start();
  }, []);

  const showAlert = (title, message) => {
    Platform.OS === 'web' ? window.alert(`${title}: ${message}`) : Alert.alert(title, message);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) return showAlert('Error', 'All fields required');
    setLoading(true);
    try {
      const data = await login(email.trim().toLowerCase(), password);
      connect().catch((e) => console.log('[Socket] connect error:', e?.message));
      navigation.replace(data.user.profileSetup ? 'MainTabs' : 'ProfileSetup');
    } catch (err) {
      if (err.response?.status === 403) {
        const reason = err.response.data?.reason;
        showAlert('Account Restricted', reason
          ? `${err.response.data.message}\nReason: ${reason}`
          : (err.response.data?.message || 'Account restricted'));
      } else {
        showAlert('Login Failed', err.response?.data?.message || err.message || 'Please try again');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Background */}
      <LinearGradient
        colors={['#070B19', '#0D1A3A', '#060A17']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Ambient glow orbs */}
      <View style={styles.orbTopRight} />
      <View style={styles.orbBottomLeft} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.content,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] },
            ]}
          >
            {/* ── Header ── */}
            <View style={styles.header}>
              <View style={styles.logoBadge}>
                <Image
                  source={require('../../../assets/logo.png')}
                  style={styles.logoImg}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>Sign in to your account</Text>
            </View>

            {/* ── Form Card ── */}
            <View style={styles.card}>
              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email</Text>
                <View style={[styles.inputWrap, focusedField === 'email' && styles.inputWrapFocused]}>
                  <Ionicons
                    name="mail-outline" size={18}
                    color={focusedField === 'email' ? '#00C6FF' : 'rgba(255,255,255,0.35)'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              {/* Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Password</Text>
                <View style={[styles.inputWrap, focusedField === 'password' && styles.inputWrapFocused]}>
                  <Ionicons
                    name="lock-closed-outline" size={18}
                    color={focusedField === 'password' ? '#00C6FF' : 'rgba(255,255,255,0.35)'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    secureTextEntry={!showPw}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity onPress={() => setShowPw((s) => !s)} style={styles.eyeBtn}>
                    <Ionicons
                      name={showPw ? 'eye-off-outline' : 'eye-outline'}
                      size={18} color="rgba(255,255,255,0.4)"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sign In Button */}
              <TouchableOpacity
                style={styles.primaryBtnWrap}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#0099FF', '#0066FF']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.primaryBtn}
                >
                  {loading
                    ? <ActivityIndicator color="#FFF" />
                    : (
                      <>
                        <Text style={styles.primaryBtnText}>Sign In</Text>
                        <View style={styles.btnIconCircle}>
                          <Ionicons name="arrow-forward" size={16} color="#0066FF" />
                        </View>
                      </>
                    )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Google */}
              <GoogleSignInButton navigation={navigation} title="Continue with Google" />
            </View>

            {/* Sign Up Link */}
            <TouchableOpacity
              onPress={() => navigation.navigate('Signup')}
              style={styles.switchLink}
              activeOpacity={0.75}
            >
              <Text style={styles.switchText}>
                Don't have an account?{'  '}
                <Text style={styles.switchHighlight}>Sign up</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  orbTopRight: {
    position: 'absolute', top: -height * 0.08, right: -width * 0.2,
    width: width * 0.85, height: width * 0.85,
    borderRadius: (width * 0.85) / 2,
    backgroundColor: 'rgba(0, 132, 255, 0.16)',
  },
  orbBottomLeft: {
    position: 'absolute', bottom: -height * 0.12, left: -width * 0.25,
    width: width * 0.95, height: width * 0.95,
    borderRadius: (width * 0.95) / 2,
    backgroundColor: 'rgba(0, 198, 255, 0.10)',
  },

  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  content: { width: '100%' },

  // ── Header ────────────────────────────────────────────────────────────
  header: { alignItems: 'center', marginBottom: 32 },
  logoBadge: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 16,
    elevation: 0,
  },
  logoImg: { width: 58, height: 58, borderRadius: 14 },
  title: {
    fontSize: 28, fontWeight: '800', color: '#FFFFFF',
    letterSpacing: -0.5, marginBottom: 6,
  },
  subtitle: {
    fontSize: 14, fontWeight: '400',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.2,
  },

  // ── Glass Card ────────────────────────────────────────────────────────
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 24,
    gap: 16,
  },

  // ── Form Fields ───────────────────────────────────────────────────────
  fieldGroup: { gap: 7 },
  fieldLabel: {
    fontSize: 12, fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 15 : 2,
  },
  inputWrapFocused: {
    borderColor: 'rgba(0,198,255,0.55)',
    backgroundColor: 'rgba(0,198,255,0.06)',
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    paddingVertical: Platform.OS === 'android' ? 13 : 0,
  },
  eyeBtn: { paddingHorizontal: 4, paddingVertical: 4 },

  // ── Primary Button ────────────────────────────────────────────────────
  primaryBtnWrap: {
    borderRadius: 16, overflow: 'hidden',
    marginTop: 4,
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45, shadowRadius: 16,
    elevation: 0,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 17, paddingHorizontal: 24,
  },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700', marginRight: 10 },
  btnIconCircle: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Divider ───────────────────────────────────────────────────────────
  dividerRow: { flexDirection: 'row', alignItems: 'center' },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: {
    marginHorizontal: 12,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12, fontWeight: '600',
  },

  // ── Switch Link ───────────────────────────────────────────────────────
  switchLink: { alignItems: 'center', paddingVertical: 10, marginTop: 20 },
  switchText: { color: 'rgba(255,255,255,0.45)', fontSize: 14 },
  switchHighlight: { color: '#00C6FF', fontWeight: '700' },
});
