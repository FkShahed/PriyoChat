import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../store/useThemeStore';
import { userApi } from '../../api/services';

export default function ReportBugScreen({ navigation }) {
  const C = useColors();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Error', 'Please provide both a title and a description.');
      return;
    }

    setLoading(true);
    try {
      const deviceInfo = `Platform: ${Platform.OS} ${Platform.Version}`;
      await userApi.reportBug({ title, description, deviceInfo });
      Alert.alert('Success', 'Thank you for your report! We will look into it shortly.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message || 'Failed to submit report.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: C.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.text }]}>Report a Bug</Text>
        <TouchableOpacity 
          style={styles.submitBtnHeader} 
          onPress={handleSubmit} 
          disabled={loading || !title.trim() || !description.trim()}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#0084FF" />
          ) : (
            <Text style={[
              styles.submitBtnText, 
              (!title.trim() || !description.trim()) && { color: C.textSecondary }
            ]}>
              Submit
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.infoBox}>
          <Ionicons name="bug-outline" size={24} color="#0084FF" style={styles.infoIcon} />
          <Text style={[styles.infoText, { color: C.textSecondary }]}>
            Found a glitch or something not working right? Let us know below. Please provide as much detail as possible so we can fix it quickly!
          </Text>
        </View>

        <Text style={[styles.label, { color: C.textSecondary }]}>Title</Text>
        <TextInput
          style={[styles.input, { backgroundColor: C.surface, color: C.text, borderColor: C.border }]}
          placeholder="Briefly summarize the issue"
          placeholderTextColor={C.textSecondary}
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />

        <Text style={[styles.label, { color: C.textSecondary }]}>Description</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: C.surface, color: C.text, borderColor: C.border }]}
          placeholder="Describe the bug in detail. What were you doing when it happened? What did you expect to happen?"
          placeholderTextColor={C.textSecondary}
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
        />

        <Text style={[styles.hint, { color: C.textSecondary }]}>
          Device info (model, OS) will be attached automatically to help us debug.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  submitBtnHeader: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  submitBtnText: {
    color: '#0084FF',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 132, 255, 0.1)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  infoIcon: {
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 150,
    marginBottom: 16,
  },
  hint: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
});
