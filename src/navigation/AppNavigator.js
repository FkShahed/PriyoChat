import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator, TouchableOpacity, Platform, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useAuthStore from '../store/useAuthStore';
import useThemeStore, { useColors } from '../store/useThemeStore';
import { navigationRef } from './navigationRef';

import { Ionicons } from '@expo/vector-icons';
// Warm up all icon fonts in the background at app start so icons never pop in late
import '../utils/preloadIcons';

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
import ArchivedChatsScreen from '../screens/chat/ArchivedChatsScreen';
import SearchChatScreen from '../screens/chat/SearchChatScreen';
import SearchUsersScreen from '../screens/friends/SearchUsersScreen';
import FriendRequestsScreen from '../screens/friends/FriendRequestsScreen';
import FriendsListScreen from '../screens/friends/FriendsListScreen';
import CallsListScreen from '../screens/calls/CallsListScreen';
import CallScreen from '../screens/calls/CallScreen';
import IncomingCallScreen from '../screens/calls/IncomingCallScreen';
import CallErrorBoundary from '../components/CallErrorBoundary';
import SettingsScreen from '../screens/settings/SettingsScreen';
import WarningDetailsScreen from '../screens/settings/WarningDetailsScreen';
import ReportBugScreen from '../screens/settings/ReportBugScreen';
import InfoScreen from '../screens/settings/InfoScreen';
import FeedScreen from '../screens/settings/FeedScreen';
import useTabBarStore from '../store/useTabBarStore';

const Stack = createStackNavigator();

// App-wide page transition: a soft fade with a very slight zoom, instead of the old
// side-slide. Visual only — navigation behaviour/gestures are unchanged.
const forSoftFadeScale = ({ current, next }) => {
  const progress = current.progress;
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1], extrapolate: 'clamp' });
  // Screen being covered: fade back slightly so the incoming one feels layered on top
  const coveredOpacity = next
    ? next.progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85], extrapolate: 'clamp' })
    : 1;
  return {
    cardStyle: {
      opacity: next ? coveredOpacity : opacity,
      transform: [{ scale }],
    },
  };
};

const softTransitionSpec = {
  animation: 'timing',
  config: { duration: 220 },
};

const STACK_TRANSITION = {
  cardStyleInterpolator: forSoftFadeScale,
  transitionSpec: { open: softTransitionSpec, close: softTransitionSpec },
};
const Tab = createBottomTabNavigator();

function TabIcon({ name, focused, C, isDark }) {
  let iconName;
  if (name === 'Chats') iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
  else if (name === 'Calls') iconName = focused ? 'call' : 'call-outline';
  else if (name === 'Friends') iconName = focused ? 'people' : 'people-outline';
  else if (name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';

  if (!iconName) return null;

  return (
    <View
      style={{
        width: 42,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,132,255,0.16)') : 'transparent',
      }}
    >
      <Ionicons name={iconName} size={21} color={focused ? (isDark ? '#FFFFFF' : '#0084FF') : (isDark ? '#7C7C82' : C.textSecondary)} />
    </View>
  );
}

function GlossyTabBarBackground({ isDark }) {
  return (
    // Shadow lives HERE (on the solid, rounded pill), not on the outer transparent tab-bar
    // container — Android draws elevation/shadow as a square when the elevated view itself has a
    // transparent background, which is what made the bar look like it was touching the edges.
    <View
      style={{
        flex: 1,
        borderRadius: 24,
        backgroundColor: isDark ? 'rgba(20,20,22,0.94)' : 'rgba(255,255,255,0.88)',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.7)',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: isDark ? 0.5 : 0.12,
        shadowRadius: 14,
      }}
    >
      <View style={{ flex: 1, borderRadius: 24, overflow: 'hidden' }}>
        {/* Glossy sheen highlight across the top of the pill (light mode only; none in dark mode) */}
        {!isDark && (
          <LinearGradient
            colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%' }}
          />
        )}
      </View>
    </View>
  );
}

// Wraps the normal tab bar so it can slide down out of view (Feed hides it while scrolling down)
function AutoHideTabBar(props) {
  const hidden = useTabBarStore((st) => st.hidden);
  const y = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(y, { toValue: hidden ? 110 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [hidden, y]);
  return (
    <Animated.View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, transform: [{ translateY: y }] }}>
      <BottomTabBar {...props} />
    </Animated.View>
  );
}

function MainTabs() {
  const C = useColors();
  const isDark = useThemeStore((s) => s.resolvedTheme === 'dark');
  return (
    <Tab.Navigator
      tabBar={(props) => <AutoHideTabBar {...props} />}
      screenOptions={({ route, navigation }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => {
          // Feed lives under Settings, so keep the Settings tab lit while Feed is open
          const onFeed = route.name === 'Settings' && navigation.getState()?.routes?.[navigation.getState()?.index]?.name === 'Feed';
          return <TabIcon name={route.name} focused={focused || onFeed} C={C} isDark={isDark} />;
        },
        tabBarActiveTintColor: '#0084FF',
        tabBarInactiveTintColor: C.textSecondary,
        tabBarStyle: {
          position: 'absolute',
          // react-navigation's own base style sets start/end: 0 (RTL-aware), which otherwise wins
          // over left/right after RN flattens the style array and pins the bar to the screen
          // edges. Override start/end directly (left/right kept too, for safety).
          start: 14,
          end: 14,
          left: 14,
          right: 14,
          bottom: Platform.OS === 'ios' ? 22 : 14,
          height: 58,
          borderRadius: 24,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarBackground: () => <GlossyTabBarBackground isDark={isDark} />,
        // The rounded pill is drawn by TabIcon; stop the navigator adding its own square highlight behind the whole item
        tabBarActiveBackgroundColor: 'transparent',
        tabBarInactiveBackgroundColor: 'transparent',
        tabBarVariant: 'uikit',
        tabBarItemStyle: { paddingTop: 4 },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600', marginTop: 1 },
      })}
    >
      <Tab.Screen name="Chats" component={ChatListScreen} />
      <Tab.Screen name="Calls" component={CallsListScreen} />
      <Tab.Screen name="Friends" component={FriendsListScreen} />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={({ navigation }) => {
          const onFeed = navigation.getState()?.routes?.[navigation.getState()?.index]?.name === 'Feed';
          return {
            tabBarLabel: ({ focused }) => (
              <Text style={{ fontSize: 10.5, fontWeight: '600', marginTop: 1, color: (focused || onFeed) ? '#0084FF' : C.textSecondary }}>Settings</Text>
            ),
          };
        }}
      />
      {/* Feed is opened from Settings. It sits inside the tabs so the bottom bar stays available; its own tab slot is hidden. */}
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          tabBarButton: () => null,
          tabBarIcon: () => null,
          tabBarLabel: () => null,
          tabBarItemStyle: { display: 'none', width: 0, height: 0, padding: 0, margin: 0 },
        }}
      />
    </Tab.Navigator>
  );
}

import useCallStore from '../store/useCallStore';

// Watches callState and navigates to IncomingCall screen when a call arrives.
// Uses navigationRef directly because these components are NOT inside a Navigator
// screen  useNavigation() would throw/fail in this position.
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

import NotificationService from '../services/NotificationService';
import useSocketStore from '../store/useSocketStore';

// Watches isAuthenticated and initializes notifications & socket when logged in
function NotificationObserver() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  React.useEffect(() => {
    if (isAuthenticated) {
      useSocketStore.getState().connect();
      NotificationService.initialize();
    }
  }, [isAuthenticated]);

  return null;
}

// Watches isAuthenticated and resets to Login on logout
function LogoutObserver() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      if (navigationRef.isReady()) {
        const currentRoute = navigationRef.getCurrentRoute()?.name;
        if (currentRoute && currentRoute !== 'Login' && currentRoute !== 'Splash' && currentRoute !== 'Signup') {
          navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
      }
    }
  }, [isAuthenticated, isLoading]);

  return null;
}

import IncomingCallBanner from '../components/IncomingCallBanner';
import OngoingCallBanner from '../components/OngoingCallBanner';

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
      <NotificationObserver />
      <CallObserver />
      <LogoutObserver />
      <IncomingCallBanner />
      <OngoingCallBanner />
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator 
          screenOptions={{ headerShown: false, ...STACK_TRANSITION }}
          initialRouteName={initialRoute}
        >
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
          <Stack.Screen name="SearchChat" component={SearchChatScreen} />
          <Stack.Screen name="ArchivedChats" component={ArchivedChatsScreen} />
          <Stack.Screen name="SearchUsers" component={SearchUsersScreen} />
          <Stack.Screen name="FriendRequests" component={FriendRequestsScreen} />
          <Stack.Screen name="Call" options={{ gestureEnabled: false }}>{(props) => <CallErrorBoundary navigation={props.navigation}><CallScreen {...props} /></CallErrorBoundary>}</Stack.Screen>
          <Stack.Screen name="IncomingCall" component={IncomingCallScreen} options={{ gestureEnabled: false }} />
          <Stack.Screen name="WarningDetails" component={WarningDetailsScreen} />
          <Stack.Screen name="ReportBug" component={ReportBugScreen} />
          <Stack.Screen name="Info" component={InfoScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
