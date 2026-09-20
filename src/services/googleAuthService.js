import { Platform, Alert } from 'react-native';

// Google Web Client ID from environment variables (.env)
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

// Fallback placeholder check
export const isConfiguredClientId = () => {
  return (
    Boolean(GOOGLE_WEB_CLIENT_ID) &&
    !GOOGLE_WEB_CLIENT_ID.includes('ad727065-625e') &&
    GOOGLE_WEB_CLIENT_ID.includes('.apps.googleusercontent.com')
  );
};

let GoogleSigninModule = null;
let statusCodes = {};
let isConfigured = false;

// Dynamically load native Google Sign-in on mobile
if (Platform.OS !== 'web') {
  try {
    const RNGoogleSignin = require('@react-native-google-signin/google-signin');
    GoogleSigninModule = RNGoogleSignin.GoogleSignin;
    statusCodes = RNGoogleSignin.statusCodes || {};
  } catch (err) {
    console.warn('[GoogleSignIn] Could not import @react-native-google-signin/google-signin:', err?.message);
  }
}

export const initGoogleSignIn = (customClientId) => {
  if (Platform.OS === 'web') return;

  const webClientId = customClientId || GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    console.warn('[GoogleSignIn] Client ID not available yet');
    return;
  }
  if (isConfigured) return;

  if (!GoogleSigninModule) {
    console.warn('[GoogleSignIn] Native module not available');
    return;
  }

  try {
    GoogleSigninModule.configure({
      webClientId,
      offlineAccess: false,
      forceCodeForRefreshToken: false,
      scopes: ['profile', 'email'],
    });
    isConfigured = true;
    console.log('[GoogleSignIn] Configured with webClientId:', `${webClientId.substring(0, 15)}...`);
  } catch (err) {
    console.warn('[GoogleSignIn] Configuration error:', err?.message);
  }
};

/**
 * Sign in on Web using Google Identity Services (GIS)
 */
const signInOnWeb = async (clientId) => {
  if (typeof window === 'undefined') {
    throw new Error('Web environment not detected');
  }

  if (!clientId) {
    throw new Error(
      'Google Web Client ID is not configured. Please set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env'
    );
  }

  // Load Google Identity Services script if not already loaded
  if (!window.google?.accounts?.id) {
    await new Promise((resolve, reject) => {
      const existing = document.getElementById('google-gsi-client');
      if (existing) {
        existing.onload = resolve;
        existing.onerror = reject;
        return;
      }
      const script = document.createElement('script');
      script.id = 'google-gsi-client';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });
  }

  return new Promise((resolve, reject) => {
    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response?.credential) {
            resolve({ idToken: response.credential });
          } else {
            reject(new Error('No credential returned from Google'));
          }
        },
      });

      // Prompt Google One Tap or Sign-in
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          console.warn('[GoogleSignIn Web] One Tap skipped or not displayed');
        }
      });
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Main sign-in function for both Native and Web
 */
export const performGoogleSignIn = async () => {
  // Web Platform
  if (Platform.OS === 'web') {
    try {
      if (!isConfiguredClientId()) {
        const msg =
          'Google Web Client ID is not configured.\nPlease add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your .env file.';
        alert(msg);
        return { error: msg };
      }
      return await signInOnWeb(GOOGLE_WEB_CLIENT_ID);
    } catch (error) {
      console.error('[GoogleSignIn Web] Error:', error);
      alert('Google Sign-In failed: ' + (error?.message || 'Unknown error'));
      return { error: error?.message };
    }
  }

  // Native Mobile Platform (Android / iOS)
  if (!GoogleSigninModule) {
    Alert.alert(
      'Rebuild Required',
      'Google Sign-In native module was added. Please rebuild your Android app with "npm run android" to enable Google Sign-In.'
    );
    return { error: 'Native module missing' };
  }

  try {
    initGoogleSignIn();

    // Check configuration
    if (!isConfiguredClientId()) {
      Alert.alert(
        'Setup Required',
        'Please configure EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your .env file with your OAuth 2.0 Web Client ID from Firebase / Google Cloud Console.'
      );
      return { error: 'Client ID missing' };
    }

    // Ensure Play Services are available (Android)
    if (Platform.OS === 'android') {
      await GoogleSigninModule.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    // Trigger Google Sign-In sheet
    const response = await GoogleSigninModule.signIn();

    // Check for cancellation in newer versions
    if (response?.type === 'cancelled') {
      return { cancelled: true };
    }

    // Extract idToken
    const idToken = response?.data?.idToken || response?.idToken;

    if (!idToken) {
      throw new Error(
        'No ID token returned from Google. Make sure EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is set to a Web Client ID (not Android client ID).'
      );
    }

    return { idToken, user: response?.data?.user || response?.user };
  } catch (error) {
    if (error.code === statusCodes?.SIGN_IN_CANCELLED) {
      return { cancelled: true };
    }

    if (error.code === statusCodes?.IN_PROGRESS) {
      return { inProgress: true };
    }

    if (error.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
      Alert.alert('Google Play Services', 'Google Play Services is not available or needs to be updated.');
      return { error: 'Play Services unavailable' };
    }

    if (error.code === statusCodes?.DEVELOPER_ERROR || String(error.code) === '10') {
      Alert.alert(
        'Google Sign-In Config Error',
        'Developer Error (Code 10):\n\n1. Ensure Google provider is enabled in Firebase Console under Authentication > Sign-in method.\n2. Ensure your SHA-1 fingerprint (5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25) is added in Firebase.\n3. Ensure EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env matches the Web Client ID.'
      );
      return { error: 'DEVELOPER_ERROR' };
    }

    // Missing native module
    if (error.message?.includes('RNGoogleSignin') || error.message?.includes('null')) {
      Alert.alert(
        'Rebuild Required',
        'Google Sign-In native module was added. Please rebuild your Android app with "npm run android" to enable Google Sign-In.'
      );
      return { error: 'Native module missing - Rebuild required' };
    }

    console.error('[GoogleSignIn] Error:', error);
    throw error;
  }
};

export const signOutFromGoogle = async () => {
  try {
    if (Platform.OS !== 'web' && GoogleSigninModule) {
      await GoogleSigninModule.signOut();
    }
  } catch (e) {
    console.warn('[GoogleSignIn] signOut error:', e?.message);
  }
};
