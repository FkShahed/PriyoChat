import { Platform, PermissionsAndroid } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Universal Permission Manager for PriyoChat
 * Proactively verifies and requests all critical permissions:
 * - Notification (Android 13+ POST_NOTIFICATIONS)
 * - Microphone (RECORD_AUDIO for voice notes & calls)
 * - Camera (CAMERA for video calls & photos)
 */
export async function ensureAppPermissions() {
  if (Platform.OS !== 'android') return true;

  try {
    const permissionsToRequest = [];

    // 1. Microphone (Audio Calls / Voice notes)
    const hasMic = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (!hasMic) {
      permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    }

    // 2. Camera (Video Calls / Photo capture)
    const hasCamera = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    if (!hasCamera) {
      permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    }

    // 3. Android 13+ (API 33+) Push Notifications
    if (Platform.Version >= 33) {
      const hasPostNotif = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (!hasPostNotif) {
        permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
    }

    // If any permissions are missing, proactively request them directly
    if (permissionsToRequest.length > 0) {
      const results = await PermissionsAndroid.requestMultiple(permissionsToRequest);
      
      const denied = Object.entries(results).filter(
        ([_, status]) => status !== PermissionsAndroid.RESULTS.GRANTED
      );

      if (denied.length > 0) {
        console.warn('[Permissions] Some permissions were not granted:', denied);
      }
    }

    // Also verify Expo Notifications permission status
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        await Notifications.requestPermissionsAsync();
      }
      // Proactively initialize and sync Push token immediately upon granting permission!
      const NotificationService = require('../services/NotificationService').default;
      NotificationService.initialize();
    } catch (e) {}

    return true;
  } catch (err) {
    console.warn('[Permissions] Check error:', err.message);
    return false;
  }
}
