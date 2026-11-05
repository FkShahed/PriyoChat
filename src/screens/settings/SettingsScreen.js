import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, ScrollView,
  Alert, ActivityIndicator, TextInput, Platform, Linking, Switch, PermissionsAndroid, AppState, Modal, useWindowDimensions, Animated, Easing
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import useThemeStore, { useColors } from '../../store/useThemeStore';
import { userApi, configApi } from '../../api/services';
import { getInitials } from '../../utils/helpers';
import { navigationRef } from '../../navigation/navigationRef';
import { CHANGELOG } from '../../constants/changelog';
import Avatar from '../../components/common/Avatar';
import ZoomableImage from '../../components/common/ZoomableImage';

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
  const { appTheme, setAppTheme, resolvedTheme } = useThemeStore();
  const baseC = useColors();
  const isDark = resolvedTheme === 'dark';
  
  // Override colors for Settings to match Auth theme with Glassmorphism only if Dark Mode
  const C = isDark ? {
    ...baseC,
    bg: '#0C0D10',
    surface: '#16181D',
    surfaceAlt: '#20232A',
    text: '#F2F2F5',
    textSecondary: '#8E9099',
    border: 'rgba(255, 255, 255, 0.08)'
  } : { ...baseC, surface: '#FFFFFF', border: 'rgba(60,60,67,0.18)' };

  const [name, setName] = useState(user?.name || '');
  const [status, setStatus] = useState(user?.status || '');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const [perms, setPerms] = useState({ 
    notifications: false, 
    camera: false, 
    microphone: false,
    location: false,
    storage: false,
  });
  const [locPermGranted, setLocPermGranted] = useState(false);

  const [showChangelog, setShowChangelog] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const { width: winW } = useWindowDimensions();
  const [checkingUpdate, setCheckingUpdate] = useState(true);
  const [updateInfo, setUpdateInfo] = useState({ apkUrl: null, latestVersion: null, isLatest: true });
  
  const [customRingtoneName, setCustomRingtoneName] = useState(null);
  const [curatedRingtones, setCuratedRingtones] = useState([]);
  const [showCuratedModal, setShowCuratedModal] = useState(false);
  const [previewSound, setPreviewSound] = useState(null);
  const [playingIndex, setPlayingIndex] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const isProcessingDownload = React.useRef(false);

  const getAndroidPerms = (type) => {
    switch (type) {
      case 'camera': return [PermissionsAndroid.PERMISSIONS.CAMERA];
      case 'microphone': return [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
      case 'location': return [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION, PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      case 'storage':
        if (Platform.Version >= 33) return [PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES, PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO];
        return [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];
      default: return [];
    }
  };

  // The location module, or null when this build doesn't contain it
  const getLocationModule = () => {
    try {
      const core = require('expo-modules-core');
      if (core.requireOptionalNativeModule && core.requireOptionalNativeModule('ExpoLocation')) return require('expo-location');
    } catch (e) { /* not in this build */ }
    return null;
  };

  // Location counts as allowed if the user gave either precise or approximate access
  const isGrantedSet = (type, flags) => (type === 'location' ? flags.some(Boolean) : flags.every(Boolean));

  const checkPermissions = async () => {
    let newPerms = { ...perms };
    try {
      const { status } = await Notifications.getPermissionsAsync();
      newPerms.notifications = status === 'granted';
      if (Platform.OS === 'android') {
        const types = ['camera', 'microphone', 'storage', 'location'];
        for (let t of types) {
          const required = getAndroidPerms(t);
          const flags = [];
          for (let p of required) flags.push(await PermissionsAndroid.check(p));
          newPerms[t] = isGrantedSet(t, flags);
        }
        // Permission alone is not enough: the phone's own Location switch must be on too
        const permOk = newPerms.location;
        setLocPermGranted(permOk);
        if (permOk) {
          const Loc = getLocationModule();
          if (Loc) {
            try { if (!(await Loc.hasServicesEnabledAsync())) newPerms.location = false; } catch (e) { /* keep as is */ }
          }
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
    
    // Load custom ringtone info on mount
    const loadRingtone = async () => {
      try {
        const uri = await AsyncStorage.getItem('custom_ringtone_uri');
        const name = await AsyncStorage.getItem('custom_ringtone_name');
        if (uri && name) setCustomRingtoneName(name);

        const { data: config } = await configApi.getGlobal();
        if (config?.availableRingtones) {
          setCuratedRingtones(config.availableRingtones);
        }
      } catch (e) {
        console.warn('Error loading custom ringtone', e);
      }
    };
    loadRingtone();
    
    return () => {
      sub.remove();
      if (previewSound) previewSound.unloadAsync();
    };
  }, []);

  const togglePermission = async (type) => {
    if (type === 'location' && !perms.location && locPermGranted) {
      await ensureLocationServiceOn();
      await checkPermissions();
      return;
    }
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
        granted = isGrantedSet(type, required.map(r => results[r] === PermissionsAndroid.RESULTS.GRANTED));
      } else {
        granted = true; // web fallback
      }
    } catch (e) {
      console.warn('Error requesting perm', e);
    }

    if (granted) {
      setPerms((p) => ({ ...p, [type]: true }));
      if (type === 'location') ensureLocationServiceOn();
    } else {
      Alert.alert('Permission Denied', `We couldn't get permission. You may need to enable it manually in Device Settings.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() }
      ]);
    }
  };

  // Allowing the permission is not the same as the phone's Location (GPS) switch being on. If it is off, ask
  // Android to switch it on (system dialog); if that is not possible, offer to open the Location settings.
  const ensureLocationServiceOn = async () => {
    if (Platform.OS !== 'android') return;
    const Loc = getLocationModule();
    if (!Loc) return;
    try {
      if (await Loc.hasServicesEnabledAsync()) { checkPermissions(); return; }
      try { await Loc.enableNetworkProviderAsync(); } catch (e) { /* user declined */ }
      if (await Loc.hasServicesEnabledAsync()) { checkPermissions(); return; }
      Alert.alert('Turn on Location', "Location is switched off on your phone, so PriyoChat can't find where you are. Turn it on in your phone's Location settings.", [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Location settings', onPress: () => { Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings()); } },
      ]);
    } catch (e) { /* ignore */ }
  };

  const grantAllPermissions = async () => {
    let updatedPerms = { ...perms };
    try {
      if (!perms.notifications) {
        const { status } = await Notifications.requestPermissionsAsync();
        updatedPerms.notifications = status === 'granted';
      }
      
      if (Platform.OS === 'android') {
        const types = ['camera', 'microphone', 'storage', 'location'];
        let toRequest = [];
        for (let t of types) {
          if (!perms[t]) toRequest.push(...getAndroidPerms(t));
        }
        
        if (toRequest.length > 0) {
          const results = await PermissionsAndroid.requestMultiple(toRequest);
          for (let t of types) {
             const required = getAndroidPerms(t);
             updatedPerms[t] = isGrantedSet(t, required.map(r => results[r] === PermissionsAndroid.RESULTS.GRANTED || results[r] === true));
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
      try {
        disconnect();
        await logout();
      } catch (e) {
        console.warn('Error during logout:', e);
      } finally {
        if (navigationRef.isReady()) {
          navigationRef.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        }
      }
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
    const normalize = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
    const [ap, bp] = [normalize(a), normalize(b)];
    const len = Math.max(ap.length, bp.length);
    for (let i = 0; i < len; i++) {
      if ((ap[i] || 0) > (bp[i] || 0)) return 1;
      if ((ap[i] || 0) < (bp[i] || 0)) return -1;
    }
    return 0;
  };

  const currentVersion =
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    require('../../../package.json').version;

  const checkVersion = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const { data } = await userApi.getAppUpdate();
      const latestVersion = data?.version || '';
      const apkUrl = data?.apkUrl || '';
      const isLatest = !latestVersion || !apkUrl || compareVersions(latestVersion, currentVersion) <= 0;
      setUpdateInfo({ apkUrl, latestVersion, isLatest });
    } catch (err) {
      console.warn('[VersionCheck] Failed:', err);
      setUpdateInfo({ apkUrl: null, latestVersion: null, isLatest: true });
    } finally {
      setCheckingUpdate(false);
    }
  }, [currentVersion]);

  // Check for updates on mount
  useEffect(() => {
    checkVersion();
  }, [checkVersion]);
  const handleDownloadUpdate = async () => {
    if (!updateInfo.apkUrl || isProcessingDownload.current) return;
    
    isProcessingDownload.current = true;
    setDownloading(true);
    
    try {
      await Linking.openURL(updateInfo.apkUrl);
      // Keep it disabled for a while to prevent multiple clicks
      setTimeout(() => {
        isProcessingDownload.current = false;
        setDownloading(false);
      }, 3000);
    } catch (err) {
      isProcessingDownload.current = false;
      setDownloading(false);
      Alert.alert('Error', 'Could not open the download link. Please try again.');
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

  // Tap on the profile picture: choose between viewing the current photo or changing it
  const onAvatarPress = () => {
    if (!user?.avatar) { pickAvatar(); return; }
    sheetAnim.setValue(0);
    setShowPhotoSheet(true);
    Animated.timing(sheetAnim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  const closePhotoSheet = (after) => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      setShowPhotoSheet(false);
      if (typeof after === 'function') after();
    });
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

  const handlePickRingtone = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp3', 'audio/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        await AsyncStorage.setItem('custom_ringtone_uri', file.uri);
        await AsyncStorage.setItem('custom_ringtone_name', file.name || 'Custom Ringtone');
        setCustomRingtoneName(file.name || 'Custom Ringtone');
        Alert.alert('Success', 'Custom ringtone has been set.');
      }
    } catch (err) {
      console.warn('Error picking ringtone:', err);
      Alert.alert('Error', 'Failed to pick audio file.');
    }
  };

  const handleResetRingtone = async () => {
    try {
      await AsyncStorage.removeItem('custom_ringtone_uri');
      await AsyncStorage.removeItem('custom_ringtone_name');
      setCustomRingtoneName(null);
      Alert.alert('Success', 'Ringtone reset to default.');
    } catch (err) {
      console.warn('Error resetting ringtone:', err);
    }
  };

  const stopPreview = async () => {
    if (previewSound) {
      await previewSound.stopAsync();
      await previewSound.unloadAsync();
      setPreviewSound(null);
      setPlayingIndex(null);
    }
  };

  const handlePreviewRingtone = async (ringtone, index) => {
    try {
      await stopPreview();
      if (playingIndex === index) return; // If same clicked, just stop

      const { sound } = await Audio.Sound.createAsync(
        { uri: ringtone.url },
        { shouldPlay: true, isLooping: true }
      );
      setPreviewSound(sound);
      setPlayingIndex(index);
    } catch (err) {
      console.warn('Preview error:', err);
    }
  };

  const handleSelectCuratedRingtone = async (ringtone) => {
    try {
      await stopPreview();
      await AsyncStorage.setItem('custom_ringtone_uri', ringtone.url);
      await AsyncStorage.setItem('custom_ringtone_name', ringtone.name);
      setCustomRingtoneName(ringtone.name);
      setShowCuratedModal(false);
      Alert.alert('Success', `${ringtone.name} has been set as your ringtone.`);
    } catch (err) {
      console.warn('Select error:', err);
    }
  };

  // ── UI helpers (presentation only) ──────────────────────────────────
  const ACCENT = '#0084FF';

  const renderSection = (title, children, headerRight) => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{title}</Text>
        {headerRight || null}
      </View>
      <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
        {children}
      </View>
    </View>
  );

  const renderIcon = (icon, color) => (
    <View style={[styles.iconBox, { backgroundColor: color + '22' }]}>
      <Ionicons name={icon} size={18} color={color} />
    </View>
  );

  const renderRow = ({ icon, color, label, value, right, onPress, last, valueLines = 1 }) => {
    const content = (
      <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}>
        {icon ? renderIcon(icon, color || ACCENT) : null}
        <View style={styles.rowTextWrap}>
          <Text style={[styles.rowLabel, { color: C.text }]}>{label}</Text>
          {value ? (
            <Text style={[styles.rowValue, { color: C.textSecondary }]} numberOfLines={valueLines}>{value}</Text>
          ) : null}
        </View>
        {right || null}
      </View>
    );
    return onPress ? (
      <TouchableOpacity activeOpacity={0.6} onPress={onPress}>{content}</TouchableOpacity>
    ) : content;
  };

  const chevron = <Ionicons name="chevron-forward" size={18} color={C.textSecondary} />;

  const permItems = [
    { key: 'notifications', label: 'Notifications', icon: 'notifications', color: '#FF9500' },
    { key: 'camera', label: 'Camera', icon: 'camera', color: '#5856D6' },
    { key: 'microphone', label: 'Microphone', icon: 'mic', color: '#FF2D55' },
    { key: 'storage', label: 'Photos & Videos', icon: 'images', color: '#34C759' },
    { key: 'location', label: 'Location', icon: 'location', color: '#0EA5E9', note: (locPermGranted && !perms.location) ? 'Allowed, but Location is switched off on your phone. Tap to turn it on.' : 'Weather, prayer times & air quality in Feed' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        {/* ── Profile header ──────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.85} style={styles.avatarWrapper}>
            <View style={[styles.avatarRing, { borderColor: isDark ? 'rgba(0,132,255,0.55)' : 'rgba(0,132,255,0.35)' }]}>
              <Avatar uri={user?.avatar} style={styles.avatar} />
            </View>
            <View style={[styles.cameraOverlay, { borderColor: C.bg }]}>
              {loading ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="camera" size={14} color="#FFF" />}
            </View>
          </TouchableOpacity>
          <Text style={[styles.headerName, { color: C.text }]} numberOfLines={1}>{user?.name}</Text>
          <Text style={[styles.headerEmail, { color: C.textSecondary }]} numberOfLines={1}>{user?.email}</Text>
        </View>

        {/* ── Profile section ─────────────────────────────────────── */}
        {renderSection('Profile', editing ? (
          <View style={{ padding: 16, gap: 12 }}>
            <View style={[styles.inputWrap, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
              <Ionicons name="person-outline" size={18} color={C.textSecondary} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.editInput, { color: C.text, flex: 1 }]}
                value={name}
                onChangeText={setName}
                placeholder="Display Name"
                placeholderTextColor={C.textSecondary}
              />
            </View>
            <View style={[styles.inputWrap, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={C.textSecondary} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.editInput, { color: C.text, flex: 1 }]}
                value={status}
                onChangeText={setStatus}
                placeholder="Status message"
                placeholderTextColor={C.textSecondary}
                maxLength={150}
              />
            </View>
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
          </View>
        ) : (
          <>
            {renderRow({ icon: 'person', color: ACCENT, label: 'Display Name', value: user?.name })}
            {renderRow({
              icon: 'chatbubble-ellipses', color: '#34C759', label: 'Status',
              value: user?.status || 'No status set', valueLines: 2,
            })}
            {renderRow({
              icon: 'create', color: ACCENT, label: 'Edit Profile', last: true,
              onPress: () => setEditing(true), right: chevron,
            })}
          </>
        ))}

        {/* ── Appearance section ──────────────────────────────────── */}
        {renderSection('Appearance', (
          <View style={{ padding: 12 }}>
            <View style={[styles.segment, { backgroundColor: C.surfaceAlt }]}>
              {THEME_OPTIONS.map((opt) => {
                const active = appTheme === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    activeOpacity={0.8}
                    style={[
                      styles.segmentBtn,
                      active && { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF' },
                      active && styles.segmentBtnActive,
                    ]}
                    onPress={() => setAppTheme(opt.key)}
                  >
                    <Ionicons name={opt.icon} size={16} color={active ? ACCENT : C.textSecondary} />
                    <Text style={[styles.segmentLabel, { color: active ? C.text : C.textSecondary }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.caption, { color: C.textSecondary, marginTop: 10 }]}>
              {THEME_OPTIONS.find((o) => o.key === appTheme)?.desc}
            </Text>
          </View>
        ))}

        {/* ── Permissions section ──────────────────────────────────── */}
        {renderSection('Permissions', (
          <>
            {permItems.map((p, i) => (
              <React.Fragment key={p.key}>
                {renderRow({
                  icon: p.icon, color: p.color, label: p.label, value: p.note,
                  last: i === permItems.length - 1,
                  right: (
                    <Switch
                      value={perms[p.key]}
                      onValueChange={() => togglePermission(p.key)}
                      trackColor={{ true: '#34C759', false: C.border }}
                    />
                  ),
                })}
              </React.Fragment>
            ))}
          </>
        ), (
          <TouchableOpacity onPress={grantAllPermissions} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '600' }}>Grant All</Text>
          </TouchableOpacity>
        ))}

        {/* ── Call Settings section ───────────────────────────────── */}
        {renderSection('Call Settings', (
          <>
            {renderRow({
              icon: 'musical-notes', color: '#AF52DE', label: 'Ringtone',
              value: customRingtoneName || 'Default', last: true,
            })}
            <View style={[styles.chipRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
              {curatedRingtones.length > 0 && (
                <TouchableOpacity
                  style={[styles.chip, { backgroundColor: 'rgba(0,132,255,0.12)' }]}
                  onPress={() => setShowCuratedModal(true)}
                >
                  <Ionicons name="library-outline" size={16} color={ACCENT} />
                  <Text style={[styles.chipText, { color: ACCENT }]}>Library</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: 'rgba(0,132,255,0.12)' }]}
                onPress={handlePickRingtone}
              >
                <Ionicons name="folder-open-outline" size={16} color={ACCENT} />
                <Text style={[styles.chipText, { color: ACCENT }]}>Files</Text>
              </TouchableOpacity>
              {customRingtoneName && (
                <TouchableOpacity
                  style={[styles.chip, { backgroundColor: 'rgba(255,59,48,0.12)' }]}
                  onPress={handleResetRingtone}
                >
                  <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                  <Text style={[styles.chipText, { color: '#FF3B30' }]}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ))}

        {/* ── Account & app info ──────────────────────────────────── */}
        {renderSection('Account & App Info', (
          <>
            {renderRow({ icon: 'mail', color: ACCENT, label: 'Email Address', value: user?.email })}
            {renderRow({
              icon: updateInfo.isLatest ? 'checkmark-circle' : 'alert-circle',
              color: updateInfo.isLatest ? '#34C759' : '#FF9500',
              label: 'App Version',
              value: `PriyoChat v${currentVersion}${updateInfo.isLatest && !checkingUpdate ? '  •  Latest' : ''}`,
              last: updateInfo.isLatest && !checkingUpdate,
              onPress: () => { checkVersion(); setShowChangelog(true); },
              right: checkingUpdate ? <ActivityIndicator size="small" color={ACCENT} /> : chevron,
            })}
            {(!updateInfo.isLatest || checkingUpdate) && (
              <View style={{ padding: 12, paddingTop: 4 }}>
                <TouchableOpacity
                  style={[
                    styles.updateBtn,
                    { backgroundColor: checkingUpdate ? C.surfaceAlt : ACCENT },
                  ]}
                  onPress={handleDownloadUpdate}
                  disabled={checkingUpdate || !updateInfo.apkUrl || downloading}
                >
                  {checkingUpdate || downloading ? (
                    <ActivityIndicator color={C.textSecondary} size="small" />
                  ) : (
                    <>
                      <Ionicons name="cloud-download-outline" size={18} color="#FFF" />
                      <Text style={[styles.updateBtnText, { color: '#FFF' }]}>
                        Download v{updateInfo.latestVersion}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        ))}

        {/* ── Support section ─────────────────────────────────────── */}
        {renderSection('Support', renderRow({
          icon: 'bug', color: '#FF9500', label: 'Report a Bug', last: true,
          onPress: () => navigation.navigate('ReportBug'), right: chevron,
        }))}

        {/* ── About & legal ───────────────────────────────────────── */}
        {renderSection('About & Legal', (
          <>
            {renderRow({
              icon: 'information-circle', color: ACCENT, label: 'About PriyoChat',
              onPress: () => navigation.navigate('Info', { type: 'about' }), right: chevron,
            })}
            {renderRow({
              icon: 'document-text', color: '#5856D6', label: 'Terms & Conditions',
              onPress: () => navigation.navigate('Info', { type: 'terms' }), right: chevron,
            })}
            {renderRow({
              icon: 'shield-checkmark', color: '#34C759', label: 'Privacy Policy', last: true,
              onPress: () => navigation.navigate('Info', { type: 'privacy' }), right: chevron,
            })}
          </>
        ))}

        {/* ── Logout ──────────────────────────────────────────────── */}
        <View style={styles.sectionWrap}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.logoutBtn, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
            <Text style={styles.dangerBtnText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.footer, { color: C.textSecondary }]}>PriyoChat v{currentVersion}</Text>

        {/* Profile photo action sheet */}
        <Modal visible={showPhotoSheet} transparent animationType="none" onRequestClose={() => closePhotoSheet()} statusBarTranslucent>
          <View style={styles.sheetRoot}>
            <Animated.View style={[styles.sheetBackdrop, { opacity: sheetAnim }]}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => closePhotoSheet()} />
            </Animated.View>
            <Animated.View
              style={[
                styles.sheet,
                { backgroundColor: isDark ? '#16181D' : '#FFFFFF' },
                { transform: [{ translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [320, 0] }) }] },
              ]}
            >
              <View style={[styles.sheetHandle, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]} />
              <View style={styles.sheetProfile}>
                <View style={[styles.sheetAvatarRing, { borderColor: 'rgba(0,132,255,0.45)' }]}>
                  <Avatar uri={user?.avatar} style={styles.sheetAvatar} />
                </View>
                <Text style={[styles.sheetName, { color: C.text }]} numberOfLines={1}>{user?.name}</Text>
                <Text style={[styles.sheetSub, { color: C.textSecondary }]}>Profile photo</Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.sheetRow, { backgroundColor: isDark ? '#20232A' : '#F3F5F9' }]}
                onPress={() => closePhotoSheet(() => setShowPhoto(true))}
              >
                <LinearGradient colors={['#4DA3FF', '#0084FF']} style={styles.sheetIcon}>
                  <Ionicons name="eye" size={20} color="#FFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetRowTitle, { color: C.text }]}>View photo</Text>
                  <Text style={[styles.sheetRowSub, { color: C.textSecondary }]}>See your current picture</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.sheetRow, { backgroundColor: isDark ? '#20232A' : '#F3F5F9' }]}
                onPress={() => closePhotoSheet(pickAvatar)}
              >
                <LinearGradient colors={['#A78BFA', '#7C3AED']} style={styles.sheetIcon}>
                  <Ionicons name="images" size={20} color="#FFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetRowTitle, { color: C.text }]}>Change photo</Text>
                  <Text style={[styles.sheetRowSub, { color: C.textSecondary }]}>Choose a new one from gallery</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity activeOpacity={0.7} style={styles.sheetCancel} onPress={() => closePhotoSheet()}>
                <Text style={[styles.sheetCancelText, { color: C.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>

        {/* Current profile photo viewer */}
        <Modal visible={showPhoto} transparent animationType="fade" onRequestClose={() => setShowPhoto(false)} statusBarTranslucent>
          <GestureHandlerRootView style={styles.photoOverlay}>
            {user?.avatar ? (
              <ZoomableImage uri={user.avatar} width={winW} height={winW} onTap={() => setShowPhoto(false)} />
            ) : null}
            <View style={styles.photoTop} pointerEvents="box-none">
              <Text style={styles.photoName} numberOfLines={1}>{user?.name}</Text>
              <TouchableOpacity style={styles.photoClose} onPress={() => setShowPhoto(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#FFF" />
              </TouchableOpacity>
            </View>
          </GestureHandlerRootView>
        </Modal>

        {/* What's new popup (App Version) */}
        <Modal visible={showChangelog} transparent animationType="fade" onRequestClose={() => setShowChangelog(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.popupOverlay} onPress={() => setShowChangelog(false)}>
            <TouchableOpacity activeOpacity={1} style={[styles.popupCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <View style={styles.popupHeader}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(0,132,255,0.15)' }]}>
                  <Ionicons name="sparkles" size={18} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.popupTitle, { color: C.text }]}>What's new</Text>
                  <Text style={{ color: C.textSecondary, fontSize: 12 }}>
                    You're on v{currentVersion}
                    {!updateInfo.isLatest && updateInfo.latestVersion ? `  •  v${updateInfo.latestVersion} available` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowChangelog(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={22} color={C.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {CHANGELOG.map((rel) => (
                  <View key={rel.version} style={styles.relBlock}>
                    <View style={styles.relHead}>
                      <Text style={[styles.relVersion, { color: C.text }]}>v{rel.version}</Text>
                      {rel.version === currentVersion && (
                        <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>Current</Text></View>
                      )}
                    </View>
                    <Text style={[styles.relTitle, { color: C.textSecondary }]}>{rel.title}</Text>
                    {rel.items.map((it, i) => (
                      <View key={i} style={styles.relItem}>
                        <Ionicons name="checkmark-circle" size={16} color="#34C759" style={{ marginTop: 2 }} />
                        <Text style={[styles.relItemText, { color: C.text }]}>{it}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Curated Ringtones Modal */}
        <Modal visible={showCuratedModal} transparent animationType="slide" onRequestClose={() => { stopPreview(); setShowCuratedModal(false); }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: C.surface }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>Curated Ringtones</Text>
                <TouchableOpacity onPress={() => { stopPreview(); setShowCuratedModal(false); }}>
                  <Ionicons name="close" size={24} color={C.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 400 }}>
                {curatedRingtones.map((r, idx) => (
                  <View key={idx} style={styles.ringtoneItem}>
                    <TouchableOpacity style={styles.ringtonePlayBtn} onPress={() => handlePreviewRingtone(r, idx)}>
                      <Ionicons name={playingIndex === idx ? "stop" : "play"} size={20} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={[styles.ringtoneName, { color: C.text }]} numberOfLines={1}>{r.name}</Text>
                    <TouchableOpacity style={styles.ringtoneSelectBtn} onPress={() => handleSelectCuratedRingtone(r)}>
                      <Text style={styles.ringtoneSelectText}>Select</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingBottom: 28, paddingTop: 10, elevation: 24 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 16 },
  sheetProfile: { alignItems: 'center', marginBottom: 18 },
  sheetAvatarRing: { padding: 3, borderRadius: 50, borderWidth: 2 },
  sheetAvatar: { width: 84, height: 84, borderRadius: 42 },
  sheetName: { fontSize: 18, fontWeight: '800', marginTop: 10 },
  sheetSub: { fontSize: 12.5, marginTop: 2 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 18, marginBottom: 10 },
  sheetIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  sheetRowTitle: { fontSize: 15.5, fontWeight: '700' },
  sheetRowSub: { fontSize: 12, marginTop: 2 },
  sheetCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 2 },
  sheetCancelText: { fontSize: 15, fontWeight: '700' },
  photoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  photoTop: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 48, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoName: { color: '#FFF', fontSize: 17, fontWeight: '700', flex: 1, marginRight: 12 },
  photoClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1 },
  // Header
  header: { alignItems: 'center', paddingTop: 64, paddingBottom: 20, paddingHorizontal: 24 },
  avatarWrapper: { position: 'relative', marginBottom: 14 },
  avatarRing: { padding: 4, borderRadius: 56, borderWidth: 2 },
  avatar: { width: 92, height: 92, borderRadius: 46 },
  cameraOverlay: {
    position: 'absolute', bottom: 2, right: 2,
    width: 30, height: 30, backgroundColor: '#0084FF',
    borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 3,
  },
  headerName: { fontSize: 22, fontWeight: '700', marginBottom: 2, maxWidth: '90%' },
  headerEmail: { fontSize: 13, maxWidth: '90%' },
  // Sections (grouped cards)
  sectionWrap: { marginHorizontal: 16, marginTop: 20 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 6, marginBottom: 8,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  // Rows
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  rowTextWrap: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowValue: { fontSize: 13, marginTop: 2 },
  iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 12, textAlign: 'center' },
  // Inputs / buttons
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1,
  },
  editInput: { fontSize: 15, paddingVertical: 10 },
  actionBtn: { backgroundColor: '#0084FF', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  actionBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  // Theme segmented control
  segment: { flexDirection: 'row', borderRadius: 14, padding: 4 },
  segmentBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 11,
  },
  segmentBtnActive: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2,
  },
  segmentLabel: { fontSize: 13, fontWeight: '600' },
  // Ringtone chips
  chipRow: { flexDirection: 'row', gap: 10, padding: 12 },
  chip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  updateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12,
  },
  updateBtnText: { fontSize: 14, fontWeight: '600' },
  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 18, paddingVertical: 15, borderWidth: StyleSheet.hairlineWidth,
  },
  dangerBtnText: { color: '#FF3B30', fontWeight: '700', fontSize: 15 },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 18, opacity: 0.7 },
  // What's new popup
  popupOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  popupCard: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 18 },
  popupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  popupTitle: { fontSize: 18, fontWeight: '700' },
  relBlock: { marginBottom: 18 },
  relHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  relVersion: { fontSize: 16, fontWeight: '700' },
  currentBadge: { backgroundColor: 'rgba(0,132,255,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  currentBadgeText: { color: '#0084FF', fontSize: 11, fontWeight: '700' },
  relTitle: { fontSize: 13, marginTop: 2, marginBottom: 8 },
  relItem: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  relItemText: { flex: 1, fontSize: 14, lineHeight: 20 },
  // Ringtone modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  ringtoneItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(150,150,150,0.2)',
  },
  ringtonePlayBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#0084FF',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  ringtoneName: { flex: 1, fontSize: 16, fontWeight: '500' },
  ringtoneSelectBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(0,132,255,0.1)' },
  ringtoneSelectText: { color: '#0084FF', fontWeight: '600', fontSize: 13 },
});
