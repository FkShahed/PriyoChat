import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../store/useThemeStore';
import useAuthStore from '../../store/useAuthStore';

export default function WarningDetailsScreen({ navigation }) {
  const C = useColors();
  const user = useAuthStore((s) => s.user);

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={C.bg === '#121212' ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.text }]}>Warning Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: C.bg === '#121212' ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)' }]}>
          <Ionicons name="warning" size={64} color="#FF9500" />
        </View>

        <Text style={[styles.title, { color: C.text }]}>Account Warning</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>
          You have <Text style={{ color: '#FF9500', fontWeight: 'bold' }}>{user?.warnings || 0}</Text> active warning{(user?.warnings !== 1) ? 's' : ''} on your account.
        </Text>

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.textSecondary }]}>REASON FOR WARNING</Text>
          <Text style={[styles.reasonText, { color: C.text }]}>
            {user?.moderationReason || 'You have received a warning from the admin for violating community guidelines. Please ensure you follow the rules to avoid account suspension.'}
          </Text>
        </View>

        <View style={styles.guidelinesBox}>
          <Ionicons name="information-circle-outline" size={20} color={C.textSecondary} style={{ marginTop: 2, marginRight: 8 }} />
          <Text style={[styles.guidelinesText, { color: C.textSecondary }]}>
            Multiple warnings may result in a temporary or permanent suspension of your account. Please respect others and follow the community guidelines.
          </Text>
        </View>
      </View>
    </View>
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
  content: {
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  card: {
    width: '100%',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  reasonText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  guidelinesBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.03)',
    padding: 16,
    borderRadius: 12,
  },
  guidelinesText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
