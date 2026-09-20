import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert,
  ActivityIndicator, Animated, StatusBar, Dimensions, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
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

  const fields = [
    { key: 'name',     label: 'Full Name', value: name,     setter: setName,     placeholder: 'Your full name',    icon: 'person-outline',      keyboard: 'default',       capitalize: 'words', secure: false },
    { key: 'email',    label: 'Email',     value: email,    setter: setEmail,    placeholder: 'you@example.com',   icon: 'mail-outline',        keyboard: 'email-address', capitalize: 'none',  secure: false },
    { key: 'password', label: 'Password',  value: password, setter: setPassword, placeholder: '••••••••',          icon: 'lock-closed-outline', keyboard: 'default',       capitalize: 'none',  secure: true  },
  ];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <LinearGradient
        colors={['#070B19', '#0D1A3A', '#060A17']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.orbTopRight} />
      <View style={styles.orbBottomLeft} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <Animated.View
          style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          {/* ── Compact inline header ── */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Image source={require('../../../assets/logo.png')} style={styles.logoImg} resizeMode="contain" />
            </View>
            <View>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Join PriyoChat for free</Text>
            </View>
          </View>

          {/* ── Glass card ── */}
          <View style={styles.card}>
            {fields.map(({ key, label, value, setter, placeholder, icon, keyboard, capitalize, secure }) => (
              <View key={key} style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <View style={[styles.inputWrap, focusedField === key && styles.inputWrapFocused]}>
                  <Ionicons
                    name={icon} size={16}
                    color={focusedField === key ? '#00C6FF' : 'rgba(255,255,255,0.35)'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, secure && { flex: 1 }]}
                    value={value}
                    onChangeText={setter}
                    placeholder={placeholder}
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType={keyboard}
                    autoCapitalize={capitalize}
                    secureTextEntry={secure && !showPw}
                    onFocus={() => setFocusedField(key)}
                    onBlur={() => setFocusedField(null)}
                  />
                  {secure && (
                    <TouchableOpacity onPress={() => setShowPw((s) => !s)} style={styles.eyeBtn}>
                      <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={16} color="rgba(255,255,255,0.4)" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            {/* Button */}
            <TouchableOpacity style={styles.primaryBtnWrap} onPress={handleSignup} disabled={loading} activeOpacity={0.85}>
              <LinearGradient colors={['#0099FF', '#0066FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
                {loading
                  ? <ActivityIndicator color="#FFF" />
                  : (
                    <>
                      <Text style={styles.primaryBtnText}>Create Account</Text>
                      <View style={styles.btnIconCircle}>
                        <Ionicons name="arrow-forward" size={14} color="#0066FF" />
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

          {/* Switch to login */}
          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.switchLink} activeOpacity={0.75}>
            <Text style={styles.switchText}>
              Already have an account?{'  '}
              <Text style={styles.switchHighlight}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  kav:  { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },

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

  content: { width: '100%' },

  // ── Compact header ────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 14,
  },
  logoBadge: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    elevation: 0,
  },
  logoImg: { width: 42, height: 42, borderRadius: 10 },
  title: {
    fontSize: 22, fontWeight: '800', color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 2,
  },

  // ── Glass card ────────────────────────────────────────────────────────
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 18,
    gap: 12,
  },

  // ── Fields ────────────────────────────────────────────────────────────
  fieldGroup: { gap: 5 },
  fieldLabel: {
    fontSize: 11, fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 0,
  },
  inputWrapFocused: {
    borderColor: 'rgba(0,198,255,0.55)',
    backgroundColor: 'rgba(0,198,255,0.06)',
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1, fontSize: 14, color: '#FFFFFF',
    paddingVertical: Platform.OS === 'android' ? 11 : 0,
  },
  eyeBtn: { padding: 4 },

  // ── Button ────────────────────────────────────────────────────────────
  primaryBtnWrap: {
    borderRadius: 14, overflow: 'hidden', marginTop: 2,
    elevation: 0,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, paddingHorizontal: 20,
  },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700', marginRight: 8 },
  btnIconCircle: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center',
  },

  // ── Divider ───────────────────────────────────────────────────────────
  dividerRow: { flexDirection: 'row', alignItems: 'center' },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: {
    marginHorizontal: 12, color: 'rgba(255,255,255,0.35)',
    fontSize: 11, fontWeight: '600',
  },

  // ── Switch link ───────────────────────────────────────────────────────
  switchLink: { alignItems: 'center', paddingVertical: 8, marginTop: 16 },
  switchText: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },
  switchHighlight: { color: '#00C6FF', fontWeight: '700' },
});
