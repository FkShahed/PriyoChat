import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, Alert, ActivityIndicator, TextInput, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import { userApi } from '../../api/services';
import { getInitials, COLORS } from '../../utils/helpers';

export default function SettingsScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const disconnect = useSocketStore((s) => s.disconnect);

  const [name, setName] = useState(user?.name || '');
  const [status, setStatus] = useState(user?.status || '');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    const performLogout = async () => {
      disconnect();
      await logout();
      // We don't need navigation.replace('Splash') here because AppNavigator 
      // automatically switches to the Auth Stack when isAuthenticated becomes false!
    };

    if (Platform.OS === 'web') {
      const confirmLogout = window.confirm('Are you sure you want to logout?');
      if (confirmLogout) performLogout();
    } else {
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: performLogout },
      ]);
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
    <ScrollView style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#0084FF', '#0040CC']} style={styles.headerGrad}>
        <TouchableOpacity onPress={pickAvatar} style={styles.avatarWrapper}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 36 }}>{getInitials(user?.name)}</Text>
            </View>
          )}
          {loading ? (
            <View style={styles.cameraOverlay}>
              <ActivityIndicator color="#FFF" />
            </View>
          ) : (
            <View style={styles.cameraOverlay}>
              <Text>📷</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.headerName}>{user?.name}</Text>
        <Text style={styles.headerEmail}>{user?.email}</Text>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>

        {editing ? (
          <>
            <TextInput
              style={styles.editInput}
              value={name}
              onChangeText={setName}
              placeholder="Display Name"
              placeholderTextColor="#AAA"
            />
            <TextInput
              style={styles.editInput}
              value={status}
              onChangeText={setStatus}
              placeholder="Status message"
              placeholderTextColor="#AAA"
              maxLength={150}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={[styles.actionBtn, { flex: 1 }]} onPress={handleSave} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.actionBtnText}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn, { flex: 1 }]} onPress={() => setEditing(false)}>
                <Text style={[styles.actionBtnText, { color: '#1C1C1E' }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>{user?.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={styles.infoValue} numberOfLines={2}>{user?.status}</Text>
            </View>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setEditing(true)}>
              <Text style={styles.actionBtnText}>✏️ Edit Profile</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{user?.email}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={[styles.actionBtn, styles.dangerBtn]} onPress={handleLogout}>
          <Text style={styles.dangerBtnText}>🚪 Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  headerGrad: { alignItems: 'center', paddingTop: 60, paddingBottom: 28 },
  avatarWrapper: { position: 'relative', marginBottom: 12 },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)' },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0, width: 28, height: 28,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  headerName: { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  headerEmail: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  section: { margin: 16, backgroundColor: '#FFF', borderRadius: 16, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  infoLabel: { fontSize: 15, color: '#8E8E93' },
  infoValue: { fontSize: 15, color: '#1C1C1E', fontWeight: '500', flex: 1, textAlign: 'right' },
  editInput: {
    backgroundColor: '#F2F2F7', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, color: '#1C1C1E',
  },
  actionBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  actionBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  cancelBtn: { backgroundColor: '#E0E0E0' },
  dangerBtn: { backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#FF3B30' },
  dangerBtnText: { color: '#FF3B30', fontWeight: '700', fontSize: 15 },
});
