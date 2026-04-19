import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

// 'light' | 'dark' | 'auto'
const useThemeStore = create((set, get) => ({
  appTheme: 'light', // persisted preference
  resolvedTheme: 'light', // actual applied theme

  init: async () => {
    try {
      const saved = await AsyncStorage.getItem('app_theme');
      const pref = saved || 'light';
      const systemColorScheme = Appearance.getColorScheme() || 'light';
      const resolved = pref === 'auto' ? systemColorScheme : pref;
      set({ appTheme: pref, resolvedTheme: resolved });

      // Listen for system changes when set to auto
      Appearance.addChangeListener(({ colorScheme }) => {
        if (get().appTheme === 'auto') {
          set({ resolvedTheme: colorScheme || 'light' });
        }
      });
    } catch (e) {
      set({ appTheme: 'light', resolvedTheme: 'light' });
    }
  },

  setAppTheme: async (theme) => {
    await AsyncStorage.setItem('app_theme', theme);
    const systemColorScheme = Appearance.getColorScheme() || 'light';
    const resolved = theme === 'auto' ? systemColorScheme : theme;
    set({ appTheme: theme, resolvedTheme: resolved });
  },
}));

// Colour tokens for dark/light mode
export const DARK = {
  bg: '#121212',
  surface: '#1E1E1E',
  surfaceAlt: '#2C2C2C',
  border: '#2E2E2E',
  text: '#F2F2F2',
  textSecondary: '#A0A0A0',
  accent: '#0084FF',
  danger: '#FF453A',
};

export const LIGHT = {
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F0F5',
  border: '#E5E5EA',
  text: '#1C1C1E',
  textSecondary: '#8E8E93',
  accent: '#0084FF',
  danger: '#FF3B30',
};

export function useColors() {
  const resolved = useThemeStore((s) => s.resolvedTheme);
  return resolved === 'dark' ? DARK : LIGHT;
}

export default useThemeStore;
