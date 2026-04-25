import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Platform, NativeModules } from 'react-native';



export const API_BASE_URL = 'http://192.168.1.104:4444/api';
// export const API_BASE_URL = 'https://priyochat.onrender.com/api';

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
