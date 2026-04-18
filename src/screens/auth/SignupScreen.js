import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';

export default function SignupScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const signup = useAuthStore((s) => s.signup);
  const connect = useSocketStore((s) => s.connect);

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSignup = async () => {
    console.log('[Signup] btn pressed, email:', email, 'pass length:', password.length);
    if (!name.trim() || !email.trim() || !password) {
      console.log('[Signup] missing fields');
      return showAlert('Error', 'All fields required');
    }
    if (password.length < 6) {
      console.log('[Signup] password too short');
      return showAlert('Error', 'Password must be at least 6 characters');
    }
    setLoading(true);
    try {
      console.log('[Signup] calling signup API...');
      await signup(name.trim(), email.trim().toLowerCase(), password);
      console.log('[Signup] success, connecting socket...');
      // Connect socket in background — don't await so navigation isn't blocked
      connect().catch((e) => console.log('[Socket] connect error:', e?.message));
      console.log('[Signup] navigating to ProfileSetup');
      navigation.replace('ProfileSetup');
    } catch (err) {
      console.log('[Signup] error:', err?.message, 'response:', JSON.stringify(err?.response?.data));
      showAlert('Signup Failed', err.response?.data?.message || err.message || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#F5F0FF', '#FFFFFF']} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.emoji}>🎉</Text>
              <Text style={styles.title}>Join PriyoChat</Text>
              <Text style={styles.subtitle}>Create your free account</Text>
            </View>

            {[
              { label: 'Full Name', value: name, setter: setName, placeholder: 'Your name', keyboard: 'default' },
              { label: 'Email', value: email, setter: setEmail, placeholder: 'you@example.com', keyboard: 'email-address' },
              { label: 'Password', value: password, setter: setPassword, placeholder: '••••••••', secure: true },
            ].map(({ label, value, setter, placeholder, keyboard, secure }) => (
              <View key={label} style={styles.inputWrapper}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={setter}
                  placeholder={placeholder}
                  placeholderTextColor="#AAAAAA"
                  keyboardType={keyboard || 'default'}
                  autoCapitalize={keyboard === 'email-address' ? 'none' : 'words'}
                  secureTextEntry={secure}
                />
              </View>
            ))}

            <TouchableOpacity
              style={styles.btn} onPress={handleSignup} disabled={loading} activeOpacity={0.85}
            >
              <LinearGradient colors={['#A855F7', '#7C3AED']} style={styles.btnGrad}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Create Account</Text>}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.loginLink}>
              <Text style={styles.loginText}>
                Already have an account? <Text style={styles.loginBold}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 28,
    shadowColor: '#A855F7', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 20, elevation: 8, gap: 14,
  },
  header: { alignItems: 'center', marginBottom: 8 },
  emoji: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: '#1C1C1E', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#8E8E93' },
  inputWrapper: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#3A3A3C' },
  input: {
    backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 14, fontSize: 15, color: '#1C1C1E',
  },
  btn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  btnGrad: { paddingVertical: 16, alignItems: 'center' },
  btnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  loginLink: { alignItems: 'center', paddingVertical: 8 },
  loginText: { color: '#8E8E93', fontSize: 14 },
  loginBold: { color: '#A855F7', fontWeight: '700' },
});
