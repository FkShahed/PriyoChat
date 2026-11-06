import axios from 'axios';

const api = axios.create({
  // Always the Oracle VPS backend (not overridable by a stale build env var)
  baseURL: import.meta.env.DEV && import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL : 'https://138.2.92.182.nip.io/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
