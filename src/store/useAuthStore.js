import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, userApi } from '../api/services';

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
      if (token && userStr) {
        const user = JSON.parse(userStr);
        set({ user, token, isAuthenticated: true, isLoading: false });
        // Refresh user data
        const { data } = await userApi.getMe();
        set({ user: data });
        await AsyncStorage.setItem('auth_user', JSON.stringify(data));
      } else {
        set({ isLoading: false });
      }
    } catch {
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

  updateUser: async (updatedUser) => {
    await AsyncStorage.setItem('auth_user', JSON.stringify(updatedUser));
    set({ user: updatedUser });
  },

  logout: async () => {
    await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
    set({ user: null, token: null, isAuthenticated: false });
  },
}));

export default useAuthStore;
