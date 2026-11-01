import React, { useEffect } from 'react';
import { StatusBar, AppState, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import useAuthStore from './src/store/useAuthStore';
import useSocketStore from './src/store/useSocketStore';
import useCallStore from './src/store/useCallStore';
import NotificationService from './src/services/NotificationService';
import { ensureAppPermissions } from './src/utils/permissionHelper';
import { navigationRef } from './src/navigation/navigationRef';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  const { isLoading, isAuthenticated, restoreSession } = useAuthStore();
  const { connect } = useSocketStore();
  const callState = useCallStore((s) => s.callState);

  // Deep linking listener for full-screen incoming call intent
  useEffect(() => {
    const handleUrl = (url) => {
      if (!url) return;
      if (url.includes('call')) {
        const navigateToCall = () => {
          if (navigationRef.isReady()) {
            navigationRef.navigate('IncomingCall');
          } else {
            setTimeout(navigateToCall, 300);
          }
        };
        navigateToCall();
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  // Proactively check and enforce permissions on launch and whenever user re-enters the app
  useEffect(() => {
    ensureAppPermissions();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        ensureAppPermissions();
      }
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    restoreSession().then(() => {
      if (useAuthStore.getState().isAuthenticated) {
        connect();
        NotificationService.initialize(); // register push token
      }
    });
    return () => NotificationService.cleanup();
  }, []);

  // Dismiss call notification when call is accepted or ended
  useEffect(() => {
    if (callState === 'active' || callState === 'idle' || callState === 'ended') {
      NotificationService.dismissCallNotification();
    }
  }, [callState]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
