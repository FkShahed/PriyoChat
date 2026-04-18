import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const login = useAuthStore((s) => s.login);
  const connect = useSocketStore((s) => s.connect);

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleLogin = async () => {
    console.log('[Login] btn pressed, email:', email, 'pass length:', password.length);
    if (!email.trim() || !password) return showAlert('Error', 'All fields required');
    setLoading(true);
    try {
      console.log('[Login] calling login API...');
      const data = await login(email.trim().toLowerCase(), password);
      console.log('[Login] success, user:', data?.user?._id, 'profileSetup:', data?.user?.profileSetup);
      connect().catch((e) => console.log('[Socket] connect error:', e?.message));
      if (!data.user.profileSetup) {
        console.log('[Login] navigating to ProfileSetup');
        navigation.replace('ProfileSetup');
      } else {
        console.log('[Login] navigating to MainTabs');
        navigation.replace('MainTabs');
      }
    } catch (err) {
      console.log('[Login] error:', err?.message, 'response:', JSON.stringify(err?.response?.data));
      showAlert('Login Failed', err.response?.data?.message || err.message || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#F0F7FF', '#FFFFFF']} style={styles.gradient}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(600)} style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.emoji}>💬</Text>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>Sign in to PriyoChat</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#AAAAAA"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor="#AAAAAA"
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword((s) => !s)} style={styles.eyeBtn}>
                    <Text>{showPassword ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.loginBtn}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                <LinearGradient colors={['#0084FF', '#0060CC']} style={styles.loginGradient}>
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.loginBtnText}>Sign In</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => navigation.navigate('Signup')} style={styles.signupLink}>
                <Text style={styles.signupText}>
                  Don't have an account? <Text style={styles.signupBold}>Sign up</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 28,
    shadowColor: '#0084FF', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 20, elevation: 8,
  },
  header: { alignItems: 'center', marginBottom: 28 },
  emoji: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: '#1C1C1E', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#8E8E93' },
  form: { gap: 16 },
  inputWrapper: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#3A3A3C' },
  input: {
    backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 14, fontSize: 15, color: '#1C1C1E',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  eyeBtn: { position: 'absolute', right: 14, padding: 4 },
  loginBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  loginGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
  loginBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  signupLink: { alignItems: 'center', paddingVertical: 8 },
  signupText: { color: '#8E8E93', fontSize: 14 },
  signupBold: { color: '#0084FF', fontWeight: '700' },
});
