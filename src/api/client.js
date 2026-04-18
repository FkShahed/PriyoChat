import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Platform, NativeModules } from 'react-native';

// Dynamically get the IP address from the Metro bundler (works on physical devices & emulators)
let localIp = '192.168.1.104'; // fallback
if (__DEV__ && Platform.OS !== 'web') {
  const scriptURL = NativeModules.SourceCode?.scriptURL;
  if (scriptURL) {
    const match = scriptURL.match(/^https?:\/\/([^:]+)/);
    if (match && match[1]) localIp = match[1];
  }
}

export const API_BASE_URL = Platform.OS === 'web' 
  ? 'http://localhost:4444/api'
  : `http://${localIp}:4444/api`;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach JWT token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle 401 globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
    }
    return Promise.reject(error);
  }
);

export default api;
