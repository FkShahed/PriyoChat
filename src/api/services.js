import api from './client';

export const authApi = {
  signup: (data) => api.post('/auth/signup', data),
  login: (data) => api.post('/auth/login', data),
};

export const userApi = {
  getMe: () => api.get('/users/me'),
  search: (q) => api.get(`/users/search?q=${encodeURIComponent(q)}`),
  getById: (id) => api.get(`/users/${id}`),
  updateProfile: (formData) =>
    api.put('/users/profile', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  updateFcmToken: (fcmToken) => api.put('/users/fcm-token', { fcmToken }),
};

export const requestApi = {
  send: (to) => api.post('/requests/send', { to }),
  accept: (id) => api.post(`/requests/accept/${id}`),
  reject: (id) => api.post(`/requests/reject/${id}`),
  getPending: () => api.get('/requests'),
  getSent: () => api.get('/requests/sent'),
};

export const conversationApi = {
  getAll: () => api.get('/conversations'),
  getMessages: (id, page = 1) => api.get(`/conversations/${id}/messages?page=${page}`),
  searchMessages: (id, q) => api.get(`/conversations/${id}/search?q=${q}`),
  updateTheme: (id, theme) => api.put(`/conversations/${id}/theme`, { theme }),
  deleteMessage: (msgId) => api.delete(`/conversations/messages/${msgId}`),
  reactToMessage: (msgId, emoji) =>
    api.post(`/conversations/messages/${msgId}/react`, { emoji }),
  reportMessage: (msgId, reason, details) =>
    api.post(`/conversations/messages/${msgId}/report`, { reason, details }),
  blockUser: (userId) => api.put(`/conversations/users/${userId}/block`),
};

export const mediaApi = {
  upload: (formData) =>
    api.post('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

export const callApi = {
  getAll: () => api.get('/calls'),
  delete: (id) => api.delete(`/calls/${id}`),
  clearAll: () => api.delete('/calls/clear/all'),
};
