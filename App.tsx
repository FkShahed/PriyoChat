import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import useAuthStore from './src/store/useAuthStore';
import useSocketStore from './src/store/useSocketStore';
import useCallStore from './src/store/useCallStore';
import NotificationService from './src/services/NotificationService';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  const { isLoading, isAuthenticated, restoreSession } = useAuthStore();
  const { connect } = useSocketStore();
  const callState = useCallStore((s) => s.callState);

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
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
