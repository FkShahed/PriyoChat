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
    const handleUrl = (url: string | null) => {
      if (!url) return;
      if (url.includes('call')) {
        try {
          const queryString = url.split('?')[1] || '';
          const params = new URLSearchParams(queryString);
          const callId = params.get('callId') || '';
          const callerName = params.get('callerName') || 'PriyoChat User';
          const callType = (params.get('callType') || 'audio') as 'audio' | 'video';
          const from = params.get('from') || '';

          if (callId || from) {
            useCallStore.getState().setIncomingCall({
              callId,
              from,
              callerName,
              caller: { _id: from, name: callerName },
              callType,
            });
          }
        } catch (e: any) {
          console.warn('[App] Error parsing deep link call url:', e.message);
        }

        // Proactively trigger socket connection immediately so socket is ready when CallScreen mounts
        try {
          useSocketStore.getState().connect();
        } catch (e) {}

        const navigateToCall = () => {
          if (navigationRef.isReady()) {
            (navigationRef as any).navigate('IncomingCall');
          } else {
            setTimeout(navigateToCall, 200);
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
