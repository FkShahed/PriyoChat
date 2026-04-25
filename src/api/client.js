import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Platform, NativeModules } from 'react-native';



// Central source for backend URLs
const IS_LOCAL = false; // Set to true for local development, false for production

export const BASE_URL = IS_LOCAL
  ? 'http://192.168.1.104:4444'
  : 'https://priyochat.onrender.com';

export const API_BASE_URL = `${BASE_URL}/api`;
export const SOCKET_URL = BASE_URL;

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
