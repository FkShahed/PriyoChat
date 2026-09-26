import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, userApi, configApi } from '../api/services';
import { signOutFromGoogle } from '../services/googleAuthService';

const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  // Restore session from storage
  restoreSession: async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const userStr = await AsyncStorage.getItem('auth_user');

      // Fetch global config in background
      configApi.getGlobal().then(({ data: config }) => {
        if (config?.defaultRingtoneUrl) {
          AsyncStorage.setItem('global_ringtone_uri', config.defaultRingtoneUrl);
        } else {
          AsyncStorage.removeItem('global_ringtone_uri');
        }
      }).catch(e => console.warn('Failed to fetch global config', e));

      if (token && userStr) {
        let user = null;
        try { user = JSON.parse(userStr); } catch (e) {}
        set({ user, token, isAuthenticated: true, isLoading: false });

        try {
          require('./useSocketStore').default.getState().connect();
          require('../services/NotificationService').default.initialize();
        } catch (e) {
          console.warn('[useAuthStore] restoreSession auto-connect error:', e);
        }

        // Refresh user data in background
        userApi.getMe().then(({ data }) => {
          set({ user: data });
          AsyncStorage.setItem('auth_user', JSON.stringify(data));
        }).catch(err => {
          if (err.response?.status === 403) {
            const msg = err.response.data?.message?.toLowerCase() || '';
            const isBanned = msg.includes('ban') || msg.includes('block');
            const isSuspended = msg.includes('suspended');
            if (isBanned || isSuspended) {
              set((state) => ({
                user: { ...state.user, isBlocked: isBanned, isSuspended, moderationReason: err.response.data?.reason || '' }
              }));
            }
          }
        });
      } else {
        set({ isLoading: false });
      }
    } catch (err) {
      set({ isLoading: false });
    }
  },

  login: async (email, password) => {
    const { data } = await authApi.login({ email, password });
    await AsyncStorage.setItem('auth_token', data.token);
    await AsyncStorage.setItem('auth_user', JSON.stringify(data.user));
    set({ user: data.user, token: data.token, isAuthenticated: true });
    return data;
  },

  signup: async (name, email, password) => {
    const { data } = await authApi.signup({ name, email, password });
    await AsyncStorage.setItem('auth_token', data.token);
    await AsyncStorage.setItem('auth_user', JSON.stringify(data.user));
    set({ user: data.user, token: data.token, isAuthenticated: true });
    return data;
  },

  loginWithGoogle: async (idToken) => {
    const { data } = await authApi.googleLogin(idToken);
    await AsyncStorage.setItem('auth_token', data.token);
    await AsyncStorage.setItem('auth_user', JSON.stringify(data.user));
    set({ user: data.user, token: data.token, isAuthenticated: true });
    return data;
  },

  updateUser: async (updatedUser) => {
    await AsyncStorage.setItem('auth_user', JSON.stringify(updatedUser));
    set({ user: updatedUser });
  },

  logout: async () => {
    await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
    signOutFromGoogle().catch(() => {});
    set({ user: null, token: null, isAuthenticated: false });
  },
}));

export default useAuthStore;
