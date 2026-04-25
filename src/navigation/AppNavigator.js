import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator, TouchableOpacity } from 'react-native';
import useAuthStore from '../store/useAuthStore';
import useThemeStore, { useColors } from '../store/useThemeStore';
import { navigationRef } from './navigationRef';

import { Ionicons } from '@expo/vector-icons';

// Auth Screens
import SplashScreen from '../screens/auth/SplashScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import ProfileSetupScreen from '../screens/auth/ProfileSetupScreen';

// Main Screens
import ChatListScreen from '../screens/chat/ChatListScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import ThemeSelectorScreen from '../screens/chat/ThemeSelectorScreen';
import UserProfileScreen from '../screens/chat/UserProfileScreen';
import SharedMediaScreen from '../screens/chat/SharedMediaScreen';
import SearchUsersScreen from '../screens/friends/SearchUsersScreen';
import FriendRequestsScreen from '../screens/friends/FriendRequestsScreen';
import FriendsListScreen from '../screens/friends/FriendsListScreen';
import CallsListScreen from '../screens/calls/CallsListScreen';
import CallScreen from '../screens/calls/CallScreen';
import IncomingCallScreen from '../screens/calls/IncomingCallScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import WarningDetailsScreen from '../screens/settings/WarningDetailsScreen';
import ReportBugScreen from '../screens/settings/ReportBugScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ name, focused, C }) {
  let iconName;
  if (name === 'Chats') iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
  else if (name === 'Calls') iconName = focused ? 'call' : 'call-outline';
  else if (name === 'Requests') iconName = focused ? 'person-add' : 'person-add-outline';
  else if (name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';

  return <Ionicons name={iconName} size={24} color={focused ? '#0084FF' : C.textSecondary} />;
}

function MainTabs() {
  const C = useColors();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} C={C} />,
        tabBarActiveTintColor: '#0084FF',
        tabBarInactiveTintColor: C.textSecondary,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopWidth: 0.5,
          borderTopColor: C.border,
          paddingBottom: 8,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      })}
    >
      <Tab.Screen name="Chats" component={ChatListScreen} />
      <Tab.Screen name="Calls" component={CallsListScreen} />
      <Tab.Screen name="Requests" component={FriendRequestsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

import useCallStore from '../store/useCallStore';

// Watches callState and navigates to IncomingCall screen when a call arrives.
// Uses navigationRef directly because these components are NOT inside a Navigator
// screen — useNavigation() would throw/fail in this position.
function CallObserver() {
  const callState = useCallStore((s) => s.callState);
  const isReceiver = useCallStore((s) => s.isReceiver);

  React.useEffect(() => {
    if (callState === 'incoming' && isReceiver) {
      if (navigationRef.isReady()) {
        navigationRef.navigate('IncomingCall');
      }
    }
  }, [callState, isReceiver]);

  return null;
}

// Watches isAuthenticated and resets to Splash on logout
function LogoutObserver() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const hasNavigated = React.useRef(false);

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated && !hasNavigated.current) {
      hasNavigated.current = true;
      if (navigationRef.isReady()) {
        navigationRef.reset({ index: 0, routes: [{ name: 'Splash' }] });
      }
    }
    if (isAuthenticated) {
      hasNavigated.current = false; // reset so next logout works
    }
  }, [isAuthenticated, isLoading]);

  return null;
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const { init: initTheme, resolvedTheme } = useThemeStore();

  // Init theme store once
  React.useEffect(() => { initTheme(); }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0084FF' }}>
        <ActivityIndicator size="large" color="#FFF" />
      </View>
    );
  }

  let initialRoute = 'Splash';
  if (isAuthenticated) {
    initialRoute = user?.profileSetup ? 'MainTabs' : 'ProfileSetup';
  }

  if (isAuthenticated && (user?.isBlocked || user?.isSuspended)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', padding: 20 }}>
        <Ionicons name="lock-closed" size={80} color="#FF3B30" />
        <Text style={{ color: '#FFF', fontSize: 24, fontWeight: '700', marginTop: 20 }}>Account Restricted</Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 12 }}>
          {user?.isBlocked ? 'Your account has been permanently banned.' : 'Your account is temporarily suspended.'}
        </Text>
        {user?.moderationReason ? (
          <Text style={{ color: '#FF3B30', marginTop: 20, fontWeight: '600', textAlign: 'center' }}>
            Reason: {user.moderationReason}
          </Text>
        ) : null}
        <TouchableOpacity 
          style={{ marginTop: 40, paddingHorizontal: 30, paddingVertical: 12, backgroundColor: '#FFF', borderRadius: 8 }}
          onPress={() => useAuthStore.getState().logout()}
        >
          <Text style={{ color: '#000', fontWeight: '700' }}>Logout</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <CallObserver />
      <LogoutObserver />
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
          {/* Auth Flow */}
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />

          {/* Main App */}
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="ThemeSelector" component={ThemeSelectorScreen} />
          <Stack.Screen name="UserProfile" component={UserProfileScreen} />
          <Stack.Screen name="SharedMedia" component={SharedMediaScreen} />
          <Stack.Screen name="SearchUsers" component={SearchUsersScreen} />
          <Stack.Screen name="FriendsList" component={FriendsListScreen} />
          <Stack.Screen name="Call" component={CallScreen} />
          <Stack.Screen name="IncomingCall" component={IncomingCallScreen} />
          <Stack.Screen name="WarningDetails" component={WarningDetailsScreen} />
          <Stack.Screen name="ReportBug" component={ReportBugScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
