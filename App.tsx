import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import useAuthStore from './src/store/useAuthStore';
import useSocketStore from './src/store/useSocketStore';
import useCallStore from './src/store/useCallStore';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  const { isLoading, isAuthenticated, restoreSession } = useAuthStore();
  const { connect } = useSocketStore();
  const callState = useCallStore((s) => s.callState);

  useEffect(() => {
    restoreSession().then(() => {
      if (useAuthStore.getState().isAuthenticated) connect();
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
