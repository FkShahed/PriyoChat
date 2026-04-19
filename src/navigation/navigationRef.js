import { createNavigationContainerRef } from '@react-navigation/native';

// Global navigation ref — allows navigation from outside React components
// (e.g. NotificationService, socket store, etc.)
export const navigationRef = createNavigationContainerRef();
