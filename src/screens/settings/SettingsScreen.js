import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, ScrollView,
  Alert, ActivityIndicator, TextInput, Platform, Linking, Switch, PermissionsAndroid, AppState
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants, { AppOwnership } from 'expo-constants';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import useThemeStore, { useColors } from '../../store/useThemeStore';
import { userApi } from '../../api/services';
import { getInitials } from '../../utils/helpers';

const THEME_OPTIONS = [
  { key: 'light', label: 'Light', desc: 'Always light', icon: 'sunny-outline' },
  { key: 'dark', label: 'Dark', desc: 'Always dark', icon: 'moon-outline' },
  { key: 'auto', label: 'Auto', desc: 'Follow system', icon: 'phone-portrait-outline' },
];

export default function SettingsScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const disconnect = useSocketStore((s) => s.disconnect);
  const { appTheme, setAppTheme } = useThemeStore();
  const C = useColors();

  const [name, setName] = useState(user?.name || '');
  const [status, setStatus] = useState(user?.status || '');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const [perms, setPerms] = useState({ 
    notifications: false, 
    camera: false, 
    microphone: false,
    calendar: false,
    contacts: false,
    location: false,
    phone: false,
    storage: false,
  });
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadUri, setDownloadUri] = useState(null);

  const getAndroidPerms = (type) => {
    switch (type) {
      case 'camera': return [PermissionsAndroid.PERMISSIONS.CAMERA];
      case 'microphone': return [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
      case 'calendar': return [PermissionsAndroid.PERMISSIONS.READ_CALENDAR, PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR];
      case 'contacts': return [PermissionsAndroid.PERMISSIONS.READ_CONTACTS];
      case 'location': return [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      case 'phone': return [PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE];
      case 'storage':
        if (Platform.Version >= 33) return [PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES, PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO];
        return [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];
      default: return [];
    }
  };

  const checkPermissions = async () => {
    let newPerms = { ...perms };
    try {
      const { status } = await Notifications.getPermissionsAsync();
      newPerms.notifications = status === 'granted';
      if (Platform.OS === 'android') {
        const types = ['camera', 'microphone', 'calendar', 'contacts', 'location', 'phone', 'storage'];
        for (let t of types) {
          const required = getAndroidPerms(t);
          let allGranted = true;
          for (let p of required) {
            const isGranted = await PermissionsAndroid.check(p);
            if (!isGranted) allGranted = false;
          }
          newPerms[t] = allGranted;
        }
      } else if (Platform.OS === 'web') {
        Object.keys(newPerms).forEach(k => newPerms[k] = true);
      }
      setPerms(newPerms);
    } catch (e) {
      console.warn('Error checking perms', e);
    }
  };

  useEffect(() => {
    checkPermissions();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPermissions();
    });
    return () => sub.remove();
  }, []);

  // Cleanup downloaded APK when user returns to app after installation
  useEffect(() => {
    const listener = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && downloadUri) {
        try {
          const info = await FileSystem.getInfoAsync(downloadUri);
          if (info.exists) {
            await FileSystem.deleteAsync(downloadUri, { idempotent: true });
            console.log('[APKCleanup] Removed APK after returning to app:', downloadUri);
          }
        } catch (err) {
          console.warn('[APKCleanup] Failed to clean up APK on resume:', err);
        }
        setDownloadUri(null);
      }
    });
    return () => listener.remove();
  }, [downloadUri]);

  const togglePermission = async (type) => {
    if (perms[type]) {
      Alert.alert('Revoke Permission', `To disable ${type} access, please go to your Device Settings.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() }
      ]);
      return;
    }

    let granted = false;
    try {
      if (type === 'notifications') {
        const { status } = await Notifications.requestPermissionsAsync();
        granted = status === 'granted';
      } else if (Platform.OS === 'android') {
        const required = getAndroidPerms(type);
        const results = await PermissionsAndroid.requestMultiple(required);
        granted = required.every(r => results[r] === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        granted = true; // web fallback
      }
    } catch (e) {
      console.warn('Error requesting perm', e);
    }

    if (granted) {
      setPerms((p) => ({ ...p, [type]: true }));
    } else {
      Alert.alert('Permission Denied', `We couldn't get permission. You may need to enable it manually in Device Settings.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() }
      ]);
    }
  };

  const grantAllPermissions = async () => {
    let updatedPerms = { ...perms };
    try {
      if (!perms.notifications) {
        const { status } = await Notifications.requestPermissionsAsync();
        updatedPerms.notifications = status === 'granted';
      }
      
      if (Platform.OS === 'android') {
        const types = ['camera', 'microphone', 'calendar', 'contacts', 'location', 'phone', 'storage'];
        let toRequest = [];
        for (let t of types) {
          if (!perms[t]) toRequest.push(...getAndroidPerms(t));
        }
        
        if (toRequest.length > 0) {
          const results = await PermissionsAndroid.requestMultiple(toRequest);
          for (let t of types) {
             const required = getAndroidPerms(t);
             updatedPerms[t] = required.every(r => results[r] === PermissionsAndroid.RESULTS.GRANTED || results[r] === true);
          }
        }
      } else if (Platform.OS === 'web') {
        Object.keys(updatedPerms).forEach(k => updatedPerms[k] = true);
      }
      
      setPerms(updatedPerms);
    } catch (e) {
      console.warn('Error requesting all perms', e);
    }
  };

  const handleLogout = async () => {
    const performLogout = async () => {
      disconnect();
      await logout();
      // AppNavigator watches isAuthenticated and navigates to Splash automatically
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to logout?')) performLogout();
    } else {
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: performLogout },
      ]);
    }
  };
  
  const compareVersions = (a, b) => {
    if (!a || !b) return 0;
    const normalize = (v) => String(v).split('.').map((part) => parseInt(part, 10) || 0);
    const [aParts, bParts] = [normalize(a), normalize(b)];
    const len = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < len; i += 1) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal > bVal) return 1;
      if (aVal < bVal) return -1;
    }
    return 0;
  };

  const cleanupApk = async (uri) => {
    if (!uri) return;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
        console.log('[APKCleanup] Removed file:', uri);
      }
    } catch (err) {
      console.warn('[APKCleanup] Failed to remove file:', err);
    }
    if (uri === downloadUri) setDownloadUri(null);
  };

  const downloadAndInstallApk = async (url, version) => {
    const fileName = `PriyoChat-${version}.apk`;
    const destUri = FileSystem.cacheDirectory + fileName;

    setCheckingUpdate(true);
    try {
      // Clean up any stale leftover APK first
      await cleanupApk(destUri);

      console.log('[APKDownload] Downloading from:', url);

      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        destUri,
        {},
        (progress) => {
          if (progress.totalBytesExpectedToWrite > 0) {
            const pct = Math.round(
              (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100
            );
            console.log(`[APKDownload] Progress: ${pct}%`);
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result?.uri) throw new Error('Download returned no file URI.');

      const localUri = result.uri;
      setDownloadUri(localUri);
      console.log('[APKDownload] Saved to:', localUri);

      // Get a content:// URI that the Android package installer can accept
      const contentUri = await FileSystem.getContentUriAsync(localUri);
      console.log('[APKDownload] Content URI:', contentUri);

      Alert.alert(
        'Download Complete',
        `PriyoChat v${version} downloaded. Install it now?`,
        [
          {
            text: 'Install',
            onPress: async () => {
              try {
                await IntentLauncher.startActivityAsync(
                  'android.intent.action.VIEW',
                  {
                    data: contentUri,
                    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
                    type: 'application/vnd.android.package-archive',
                  }
                );
                // AppState listener will delete the file once the user returns to the app
              } catch (installErr) {
                console.error('[APKInstall] Error:', installErr);
                Alert.alert(
                  'Install Failed',
                  `Could not open the APK installer.\n\nError: ${installErr.message || 'Unknown'}\n\nMake sure "Install from unknown sources" is enabled for this app in your device settings.`
                );
                await cleanupApk(localUri);
              }
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => cleanupApk(localUri),
          },
        ]
      );
    } catch (downloadError) {
      console.error('[APKDownload] Error:', downloadError);
      Alert.alert(
        'Download Failed',
        `Could not download the APK.\n\nError: ${downloadError.message || 'Unknown error'}\n\nCheck that the APK URL is accessible from your network.`
      );
      await cleanupApk(destUri);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const onUpdateCheck = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Supported', 'Updates are managed by the browser on web.');
      return;
    }

    if (Platform.OS !== 'android') {
      Alert.alert('Unsupported Platform', 'APK download and install is only supported on Android builds.');
      return;
    }

    setCheckingUpdate(true);

    try {
      // Get current version from various possible sources
      const currentVersion = 
        Constants.expoConfig?.version || 
        Constants.manifest2?.extra?.expoClient?.version ||
        Constants.nativeAppVersion || 
        '0.0.0';
      
      console.log('[UpdateCheck] Current Version:', currentVersion);
      
      const { data } = await userApi.getAppUpdate();
      console.log('[UpdateCheck] Server Data:', data);

      const latestVersion = data?.version || '';
      const apkUrl = data?.apkUrl || '';
      const releaseNotes = data?.releaseNotes || '';

      if (!latestVersion || !apkUrl) {
        Alert.alert('Update Info Missing', 'The server has not been configured with the latest APK details yet.');
        return;
      }

      const comparison = compareVersions(latestVersion, currentVersion);
      console.log(`[UpdateCheck] Comparison Result: ${comparison} (Latest: ${latestVersion} vs Current: ${currentVersion})`);

      if (comparison <= 0) {
        Alert.alert('Up to Date', `You are running the latest version (${currentVersion}).`);
        return;
      }

      Alert.alert(
        'Update Available',
        `A new update is available (${latestVersion}).\n\nRelease notes:\n${releaseNotes || 'No release notes provided.'}`,
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Download & Install',
            onPress: () => downloadAndInstallApk(apkUrl, latestVersion),
          },
        ]
      );
    } catch (err) {
      console.error('[UpdateCheck] Error:', err);
      const errMsg = err.response?.data?.message || err.message || 'Failed to check for updates.';
      Alert.alert('Update Check Failed', errMsg);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('status', status.trim());
      const { data } = await userApi.updateProfile(formData);
      await updateUser(data);
      setEditing(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    setLoading(true);
    try {
      const asset = result.assets[0];
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        formData.append('avatar', blob, asset.fileName || 'avatar.jpg');
      } else {
        formData.append('avatar', { uri: asset.uri, type: asset.mimeType || 'image/jpeg', name: asset.fileName || 'avatar.jpg' });
      }
      const { data } = await userApi.updateProfile(formData);
      await updateUser(data);
    } catch {
      Alert.alert('Error', 'Failed to update avatar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: C.bg }]}>
      {/* ── Profile header ──────────────────────────────────────── */}
      <LinearGradient colors={['#0084FF', '#0060CC']} style={styles.headerGrad}>
        <TouchableOpacity onPress={pickAvatar} style={styles.avatarWrapper}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 36 }}>{getInitials(user?.name)}</Text>
            </View>
          )}
          <View style={styles.cameraOverlay}>
            {loading ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="camera" size={16} color="#FFF" />}
          </View>
        </TouchableOpacity>
        <Text style={styles.headerName}>{user?.name}</Text>
        <Text style={styles.headerEmail}>{user?.email}</Text>
      </LinearGradient>

      {/* ── Profile section ─────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: C.surface }]}>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>Profile</Text>

        {editing ? (
          <>
            <TextInput
              style={[styles.editInput, { backgroundColor: C.surfaceAlt, color: C.text }]}
              value={name}
              onChangeText={setName}
              placeholder="Display Name"
              placeholderTextColor={C.textSecondary}
            />
            <TextInput
              style={[styles.editInput, { backgroundColor: C.surfaceAlt, color: C.text }]}
              value={status}
              onChangeText={setStatus}
              placeholder="Status message"
              placeholderTextColor={C.textSecondary}
              maxLength={150}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={[styles.actionBtn, { flex: 1 }]} onPress={handleSave} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.actionBtnText}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { flex: 1, backgroundColor: C.surfaceAlt }]}
                onPress={() => setEditing(false)}
              >
                <Text style={[styles.actionBtnText, { color: C.text }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: C.textSecondary }]}>Name</Text>
              <Text style={[styles.infoValue, { color: C.text }]}>{user?.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: C.textSecondary }]}>Status</Text>
              <Text style={[styles.infoValue, { color: C.text }]} numberOfLines={2}>
                {user?.status || 'No status set'}
              </Text>
            </View>
            <TouchableOpacity style={[styles.actionBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]} onPress={() => setEditing(true)}>
              <Ionicons name="pencil" size={16} color="#FFF" />
              <Text style={styles.actionBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Appearance section ──────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: C.surface }]}>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>Appearance</Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.themeBtn,
                { borderColor: C.border, backgroundColor: C.surfaceAlt },
                appTheme === opt.key && styles.themeBtnActive,
              ]}
              onPress={() => setAppTheme(opt.key)}
            >
              <Ionicons
                name={opt.icon}
                size={20}
                color={appTheme === opt.key ? '#0084FF' : C.textSecondary}
              />
              <Text style={[styles.themeBtnLabel, { color: appTheme === opt.key ? '#0084FF' : C.text }]}>{opt.label}</Text>
              <Text style={[styles.themeBtnDesc, { color: C.textSecondary }]}>{opt.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Permissions section ──────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: C.surface }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>Permissions</Text>
          <TouchableOpacity onPress={grantAllPermissions}>
            <Text style={{ color: '#0084FF', fontSize: 13, fontWeight: '600' }}>Grant All</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: C.text, fontSize: 13, marginBottom: 12, lineHeight: 18, opacity: 0.8 }}>
          Manage access to ensure all app features work properly.
        </Text>
        
        {[
          { key: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
          { key: 'camera', label: 'Camera', icon: 'camera-outline' },
          { key: 'microphone', label: 'Microphone', icon: 'mic-outline' },
          { key: 'storage', label: 'Photos & Videos', icon: 'images-outline' },
          { key: 'location', label: 'Location', icon: 'location-outline' },
          { key: 'contacts', label: 'Contacts', icon: 'people-outline' },
          { key: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
          { key: 'phone', label: 'Phone Status', icon: 'call-outline' },
        ].map((p) => (
          <View style={styles.permRow} key={p.key}>
            <View style={styles.permInfo}>
              <Ionicons name={p.icon} size={20} color={C.text} />
              <Text style={[styles.permLabel, { color: C.text }]}>{p.label}</Text>
            </View>
            <Switch
              value={perms[p.key]}
              onValueChange={() => togglePermission(p.key)}
              trackColor={{ true: '#34C759', false: C.border }}
            />
          </View>
        ))}
      </View>

      {/* ── Account section ─────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: C.surface }]}>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>Account</Text>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: C.textSecondary }]}>Email</Text>
          <Text style={[styles.infoValue, { color: C.text }]}>{user?.email}</Text>
        </View>
        <TouchableOpacity 
          style={[styles.updateBtn, { backgroundColor: C.surfaceAlt }]} 
          onPress={onUpdateCheck}
          disabled={checkingUpdate}
        >
          {checkingUpdate ? (
            <ActivityIndicator color={C.textSecondary} size="small" />
          ) : (
            <>
              <Ionicons name="cloud-download-outline" size={18} color="#0084FF" />
              <Text style={[styles.updateBtnText, { color: C.text }]}>Check for Updates</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Support section ─────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: C.surface }]}>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>Support</Text>
        <TouchableOpacity 
          style={[styles.updateBtn, { backgroundColor: C.surfaceAlt, borderColor: 'transparent' }]} 
          onPress={() => navigation.navigate('ReportBug')}
        >
          <Ionicons name="bug-outline" size={18} color="#FF9500" />
          <Text style={[styles.updateBtnText, { color: C.text }]}>Report a Bug</Text>
        </TouchableOpacity>
      </View>

      {/* ── Logout ──────────────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: C.surface }]}>
        <TouchableOpacity style={[styles.dangerBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={19} color="#FF3B30" />
          <Text style={styles.dangerBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerGrad: { alignItems: 'center', paddingTop: 64, paddingBottom: 28 },
  avatarWrapper: { position: 'relative', marginBottom: 12 },
  avatar: { width: 94, height: 94, borderRadius: 47, borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)' },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 30, height: 30, backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15, alignItems: 'center', justifyContent: 'center',
  },
  headerName: { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  headerEmail: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  section: { margin: 16, borderRadius: 16, padding: 16, gap: 14, marginBottom: 0 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  infoLabel: { fontSize: 15 },
  infoValue: { fontSize: 15, fontWeight: '500', flex: 1, textAlign: 'right', marginLeft: 12 },
  editInput: {
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  actionBtn: { backgroundColor: '#0084FF', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  actionBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  // Theme picker
  themeRow: { flexDirection: 'row', gap: 10 },
  themeBtn: {
    flex: 1, borderRadius: 12, borderWidth: 1.5,
    paddingVertical: 12, alignItems: 'center', gap: 2,
  },
  themeBtnActive: { borderColor: '#0084FF', backgroundColor: 'rgba(0,132,255,0.08)' },
  themeBtnLabel: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  themeBtnDesc: { fontSize: 11 },
  // Logout
  dangerBtn: {
    borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#FF3B30', backgroundColor: 'transparent',
  },
  dangerBtnText: { color: '#FF3B30', fontWeight: '700', fontSize: 15 },
  // Permissions
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  permInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  permLabel: { fontSize: 15, fontWeight: '500' },
  updateBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,132,255,0.2)',
  },
  updateBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
