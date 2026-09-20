import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { performGoogleSignIn } from '../../services/googleAuthService';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';

export default function GoogleSignInButton({
  navigation,
  title = 'Continue with Google',
  style,
  onSuccess,
}) {
  const [loading, setLoading] = useState(false);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const connect = useSocketStore((s) => s.connect);

  const handlePress = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const result = await performGoogleSignIn();

      if (result?.cancelled || result?.inProgress || result?.error) {
        setLoading(false);
        return;
      }

      if (result?.idToken) {
        const data = await loginWithGoogle(result.idToken);

        // Connect real-time socket
        connect().catch((e) => console.warn('[Socket] Connect error after Google auth:', e?.message));

        if (onSuccess) {
          onSuccess(data);
        } else if (navigation) {
          if (!data?.user?.profileSetup) {
            navigation.replace('ProfileSetup');
          } else {
            navigation.replace('MainTabs');
          }
        }
      }
    } catch (err) {
      console.error('[GoogleSignInButton] Failed:', err);
      if (err.response?.status === 403) {
        const reason = err.response.data?.reason;
        const msg = reason
          ? `${err.response.data.message}\nReason: ${reason}`
          : err.response.data?.message || 'Account restricted';
        Alert.alert('Account Restricted', msg);
      } else {
        Alert.alert(
          'Google Sign-In Failed',
          err.response?.data?.message || err.message || 'Could not complete Google authentication.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={handlePress}
      disabled={loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color="#4285F4" size="small" />
      ) : (
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="logo-google" size={20} color="#EA4335" />
          </View>
          <Text style={styles.text}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    minHeight: 52,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: 10,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
});
