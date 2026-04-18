export const formatTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export const formatMessageTime = (dateString) => {
  return new Date(dateString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatLastSeen = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (mins < 2) return 'Online now';
  if (mins < 60) return `Last seen ${mins}m ago`;
  if (hours < 24) return `Last seen ${hours}h ago`;
  return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
};

export const getInitials = (name) => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const COLORS = {
  primary: '#0084FF',
  primaryDark: '#0060CC',
  success: '#25D366',
  danger: '#FF3B30',
  warning: '#FF9500',
  dark: '#1C1C1E',
  gray: '#8E8E93',
  lightGray: '#F2F2F7',
  white: '#FFFFFF',
  black: '#000000',
};

export const FONTS = {
  regular: 'System',
  bold: 'System',
};
