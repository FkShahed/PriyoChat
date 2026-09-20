import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  ActivityIndicator, Animated, StatusBar, Dimensions, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import LogoSVG from '../../components/common/LogoSVG';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import GoogleSignInButton from '../../components/common/GoogleSignInButton';

const { width, height } = Dimensions.get('window');

export default function SignupScreen({ navigation }) {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPw, setShowPw]     = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const signup  = useAuthStore((s) => s.signup);
  const connect = useSocketStore((s) => s.connect);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
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

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password) return showAlert('Error', 'All fields required');
    if (password.length < 6) return showAlert('Error', 'Password must be at least 6 characters');
    setLoading(true);
    try {
      await signup(name.trim(), email.trim().toLowerCase(), password);
      connect().catch((e) => console.log('[Socket] connect error:', e?.message));
      navigation.replace('ProfileSetup');
    } catch (err) {
      showAlert('Signup Failed', err.response?.data?.message || err.message || 'Please try again');
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
          scrollEnabled={false}
        >
          <Animated.View
            style={[
              styles.content,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] },
            ]}
          >
            {/* ── Header (same layout as Login) ── */}
            <View style={styles.header}>
              <View style={styles.logoImg}>
                <LogoSVG size={84} />
              </View>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Join PriyoChat for free</Text>
            </View>

            {/* ── Form Card ── */}
            <View style={styles.card}>

              {/* Full Name */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Full Name</Text>
                <View style={[styles.inputWrap, focusedField === 'name' && styles.inputWrapFocused]}>
                  <Ionicons
                    name="person-outline" size={17}
                    color={focusedField === 'name' ? '#00C6FF' : 'rgba(255,255,255,0.35)'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your full name"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    autoCapitalize="words"
                    onFocus={() => setFocusedField('name')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email</Text>
                <View style={[styles.inputWrap, focusedField === 'email' && styles.inputWrapFocused]}>
                  <Ionicons
                    name="mail-outline" size={17}
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
                    name="lock-closed-outline" size={17}
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
                      size={17} color="rgba(255,255,255,0.4)"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Create Account Button */}
              <TouchableOpacity
                style={styles.primaryBtnWrap}
                onPress={handleSignup}
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
                        <Text style={styles.primaryBtnText}>Create Account</Text>
                        <View style={styles.btnIconCircle}>
                          <Ionicons name="arrow-forward" size={15} color="#0066FF" />
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

              <GoogleSignInButton navigation={navigation} title="Sign up with Google" />
            </View>

            {/* Switch to Login */}
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              style={styles.switchLink}
              activeOpacity={0.75}
            >
              <Text style={styles.switchText}>
                Already have an account?{'  '}
                <Text style={styles.switchHighlight}>Sign in</Text>
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
    paddingVertical: 24,
  },
  content: { width: '100%' },

  // ── Header — same visual as Login, just tighter margin ────────────────
  header: { alignItems: 'center', marginBottom: 20 },
  logoImg: {
    width: 84, height: 84,
    marginBottom: 14,
  },
  title: {
    fontSize: 24, fontWeight: '800', color: '#FFFFFF',
    letterSpacing: -0.5, marginBottom: 4,
  },
  subtitle: {
    fontSize: 13, fontWeight: '400',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.2,
  },

  // ── Glass Card — same as Login, slightly tighter ───────────────────────
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    gap: 12,
  },

  // ── Fields ────────────────────────────────────────────────────────────
  fieldGroup: { gap: 6 },
  fieldLabel: {
    fontSize: 11, fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 13, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 13,
    paddingVertical: Platform.OS === 'ios' ? 12 : 0,
  },
  inputWrapFocused: {
    borderColor: 'rgba(0,198,255,0.55)',
    backgroundColor: 'rgba(0,198,255,0.06)',
  },
  inputIcon: { marginRight: 9 },
  input: {
    flex: 1, fontSize: 14, color: '#FFFFFF',
    paddingVertical: Platform.OS === 'android' ? 11 : 0,
  },
  eyeBtn: { paddingHorizontal: 4, paddingVertical: 4 },

  // ── Primary Button ────────────────────────────────────────────────────
  primaryBtnWrap: {
    borderRadius: 12, overflow: 'hidden',
    marginTop: 2, elevation: 0,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, paddingHorizontal: 24,
  },
  primaryBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700', marginRight: 9 },
  btnIconCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center',
  },

  // ── Divider ───────────────────────────────────────────────────────────
  dividerRow: { flexDirection: 'row', alignItems: 'center' },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: {
    marginHorizontal: 12, color: 'rgba(255,255,255,0.35)',
    fontSize: 11, fontWeight: '600',
  },

  // ── Switch Link ───────────────────────────────────────────────────────
  switchLink: { alignItems: 'center', paddingVertical: 8, marginTop: 16 },
  switchText: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },
  switchHighlight: { color: '#00C6FF', fontWeight: '700' },
});
