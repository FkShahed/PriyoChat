import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, ScrollView,
  Alert, ActivityIndicator, TextInput, Platform, Linking, Switch, PermissionsAndroid, AppState, Modal
} from 'react-native';
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
  const [checkingUpdate, setCheckingUpdate] = useState(true);
  const [updateInfo, setUpdateInfo] = useState({ apkUrl: null, latestVersion: null, isLatest: true });
  
  const [customRingtoneName, setCustomRingtoneName] = useState(null);
  const [curatedRingtones, setCuratedRingtones] = useState([]);
  const [showCuratedModal, setShowCuratedModal] = useState(false);
  const [previewSound, setPreviewSound] = useState(null);
  const [playingIndex, setPlayingIndex] = useState(null);

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
    '0.0.0';

  // Check for updates on mount
  useEffect(() => {
    const checkVersion = async () => {
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
    };
    checkVersion();
  }, []);
  const handleDownloadUpdate = async () => {
    if (!updateInfo.apkUrl) return;
    try {
      await Linking.openURL(updateInfo.apkUrl);
    } catch (err) {
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

      {/* ── Call Settings section ───────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: C.surface }]}>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>Call Settings</Text>
        <Text style={{ color: C.text, fontSize: 13, marginBottom: 12, lineHeight: 18, opacity: 0.8 }}>
          Choose a custom sound to play when receiving an audio or video call.
        </Text>
        
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: C.textSecondary }]}>Ringtone</Text>
          <Text style={[styles.infoValue, { color: C.text }]} numberOfLines={1}>
            {customRingtoneName || 'Default'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          {curatedRingtones.length > 0 && (
            <TouchableOpacity
              style={[styles.updateBtn, { flex: 1, marginTop: 0, backgroundColor: 'rgba(0,132,255,0.1)' }]}
              onPress={() => setShowCuratedModal(true)}
            >
              <Ionicons name="library-outline" size={18} color="#0084FF" />
              <Text style={[styles.updateBtnText, { color: '#0084FF' }]}>Library</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.updateBtn, { flex: 1, marginTop: 0 }]}
            onPress={handlePickRingtone}
          >
            <Ionicons name="folder-open-outline" size={18} color="#0084FF" />
            <Text style={[styles.updateBtnText, { color: '#0084FF' }]}>Files</Text>
          </TouchableOpacity>
          
          {customRingtoneName && (
            <TouchableOpacity
              style={[styles.updateBtn, { flex: 1, marginTop: 0, borderColor: '#FF3B30', backgroundColor: 'rgba(255,59,48,0.1)' }]}
              onPress={handleResetRingtone}
            >
              <Ionicons name="trash-outline" size={18} color="#FF3B30" />
              <Text style={[styles.updateBtnText, { color: '#FF3B30' }]}>Reset</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Account section ─────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: C.surface }]}>
        <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>Account</Text>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: C.textSecondary }]}>Email</Text>
          <Text style={[styles.infoValue, { color: C.text }]}>{user?.email}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: C.textSecondary }]}>App Version</Text>
          <Text style={[styles.infoValue, { color: C.text }]}>{currentVersion}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.updateBtn,
            {
              backgroundColor: updateInfo.isLatest || checkingUpdate
                ? C.surfaceAlt
                : 'rgba(0,132,255,0.1)',
              borderColor: updateInfo.isLatest || checkingUpdate
                ? 'transparent'
                : '#0084FF',
              borderWidth: 1,
              opacity: updateInfo.isLatest && !checkingUpdate ? 0.5 : 1,
            }
          ]}
          onPress={handleDownloadUpdate}
          disabled={checkingUpdate || updateInfo.isLatest}
        >
          {checkingUpdate ? (
            <ActivityIndicator color={C.textSecondary} size="small" />
          ) : updateInfo.isLatest ? (
            <>
              <Ionicons name="checkmark-circle-outline" size={18} color="#34C759" />
              <Text style={[styles.updateBtnText, { color: C.text }]}>You're up to date</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-download-outline" size={18} color="#0084FF" />
              <Text style={[styles.updateBtnText, { color: '#0084FF' }]}>
                Download v{updateInfo.latestVersion}
              </Text>
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
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'
  },
  modalContent: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40
  },
  ringtoneItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(150,150,150,0.2)'
  },
  ringtonePlayBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#0084FF', alignItems: 'center', justifyContent: 'center', marginRight: 12
  },
  ringtoneName: {
    flex: 1, fontSize: 16, fontWeight: '500'
  },
  ringtoneSelectBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(0,132,255,0.1)'
  },
  ringtoneSelectText: {
    color: '#0084FF', fontWeight: '600', fontSize: 13
  }
});
