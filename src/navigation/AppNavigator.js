import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator } from 'react-native';
import useAuthStore from '../store/useAuthStore';

// Auth Screens
import SplashScreen from '../screens/auth/SplashScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import ProfileSetupScreen from '../screens/auth/ProfileSetupScreen';

// Main Screens
import ChatListScreen from '../screens/chat/ChatListScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import ThemeSelectorScreen from '../screens/chat/ThemeSelectorScreen';
import SearchUsersScreen from '../screens/friends/SearchUsersScreen';
import FriendRequestsScreen from '../screens/friends/FriendRequestsScreen';
import CallScreen from '../screens/calls/CallScreen';
import IncomingCallScreen from '../screens/calls/IncomingCallScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ name, focused }) {
  const icons = {
    Chats: focused ? '💬' : '🗨️',
    Requests: focused ? '🔔' : '🔕',
    Settings: focused ? '⚙️' : '⚙️',
  };
  return <Text style={{ fontSize: 22 }}>{icons[name] || '•'}</Text>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: '#0084FF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          borderTopWidth: 0.5,
          borderTopColor: '#EEEEEE',
          paddingBottom: 8,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      })}
    >
      <Tab.Screen name="Chats" component={ChatListScreen} />
      <Tab.Screen name="Requests" component={FriendRequestsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

import { useNavigation } from '@react-navigation/native';
import useCallStore from '../store/useCallStore';

function CallObserver() {
  const navigation = useNavigation();
  const callState = useCallStore((s) => s.callState);
  const isReceiver = useCallStore((s) => s.isReceiver);

  React.useEffect(() => {
    // Only the receiver (not the caller) is routed to IncomingCall screen
    if (callState === 'incoming' && isReceiver) {
      navigation.navigate('IncomingCall');
    }
  }, [callState, isReceiver, navigation]);

  return null;
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuthStore();

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

  return (
    <NavigationContainer>
      <CallObserver />
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
        <Stack.Screen name="SearchUsers" component={SearchUsersScreen} />
        <Stack.Screen name="Call" component={CallScreen} />
        <Stack.Screen name="IncomingCall" component={IncomingCallScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
