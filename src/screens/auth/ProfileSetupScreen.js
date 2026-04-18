import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { userApi, mediaApi } from '../../api/services';
import useAuthStore from '../../store/useAuthStore';

export default function ProfileSetupScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [name, setName] = useState(user?.name || '');
  const [status, setStatus] = useState('Hey there! I am using PriyoChat.');
  const [avatar, setAvatar] = useState(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) {
      setAvatar(result.assets[0]);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('status', status.trim());
      if (avatar) {
        formData.append('avatar', {
          uri: avatar.uri,
          type: avatar.mimeType || 'image/jpeg',
          name: avatar.fileName || 'avatar.jpg',
        });
      }
      const { data } = await userApi.updateProfile(formData);
      await updateUser(data);
      navigation.replace('MainTabs');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  const avatarSource = avatar ? { uri: avatar.uri } : (user?.avatar ? { uri: user.avatar } : null);

  return (
    <LinearGradient colors={['#0084FF', '#0040CC']} style={styles.gradient}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Set up your profile</Text>
        <Text style={styles.subtitle}>Tell friends a bit about yourself</Text>

        {/* Avatar picker */}
        <TouchableOpacity onPress={pickImage} style={styles.avatarContainer}>
          {avatarSource ? (
            <Image source={avatarSource} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>{name?.[0]?.toUpperCase() || '?'}</Text>
            </View>
          )}
          <View style={styles.cameraBtn}>
            <Text style={styles.cameraBtnText}>📷</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.form}>
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              placeholderTextColor="#AAAAAA"
            />
          </View>
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Status</Text>
            <TextInput
              style={styles.input}
              value={status}
              onChangeText={setStatus}
              placeholder="What's on your mind?"
              placeholderTextColor="#AAAAAA"
              maxLength={150}
            />
          </View>

          <TouchableOpacity style={styles.btn} onPress={handleSave} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#0084FF" />
            ) : (
              <Text style={styles.btnText}>Continue →</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  title: { fontSize: 26, fontWeight: '800', color: '#FFF', marginBottom: 8 },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.8)', marginBottom: 36 },
  avatarContainer: { position: 'relative', marginBottom: 32 },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: '#FFF' },
  avatarPlaceholder: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#FFF',
  },
  avatarPlaceholderText: { fontSize: 44, color: '#FFF', fontWeight: '700' },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#FFF', borderRadius: 18, width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  cameraBtnText: { fontSize: 18 },
  form: { width: '100%', gap: 16 },
  inputWrapper: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#FFF',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  btn: {
    backgroundColor: '#FFF', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  btnText: { color: '#0084FF', fontSize: 17, fontWeight: '700' },
});
