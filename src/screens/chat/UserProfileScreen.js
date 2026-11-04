import React, { useState } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity,
  ScrollView, Switch, Alert, StatusBar, Modal, useWindowDimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getInitials, formatLastSeen } from '../../utils/helpers';
import { useColors } from '../../store/useThemeStore';
import useCallStore from '../../store/useCallStore';
import useChatStore from '../../store/useChatStore';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ZoomableImage from '../../components/common/ZoomableImage';
import Avatar from '../../components/common/Avatar';

const ACCENT = '#0084FF';

export default function UserProfileScreen({ route, navigation }) {
  const { user, isOnline, lastSeen, conversationId } = route.params || {};
  const baseC = useColors();
  const isDark = baseC.bg === '#121212';
  // Same palette as the Settings screen so the whole app feels consistent
  const C = isDark
    ? { ...baseC, bg: '#0C0D10', surface: '#16181D', surfaceAlt: '#20232A', text: '#F2F2F5', textSecondary: '#8E9099', border: 'rgba(255,255,255,0.08)' }
    : baseC;
  const startCall = useCallStore((s) => s.startCall);
  const [showPhoto, setShowPhoto] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();

  const conversations = useChatStore((s) => s.conversations);
  const currentConversation = conversations.find(c => c._id === conversationId);
  const currentTheme = currentConversation?.theme || 'ClassicBlue';

  const isMuted = useChatStore((s) => s.mutedConversationIds[conversationId]);
  const toggleMute = useChatStore((s) => s.toggleMuteConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  const statusText = isOnline
    ? 'Online'
    : lastSeen
    ? formatLastSeen(lastSeen)
    : 'Offline';

  const handleCall = (type) => {
    startCall(user, type);
    navigation.navigate('Call', { otherUser: user, callType: type });
  };

  const handleMute = () => {
    if (conversationId) toggleMute(conversationId);
  };

  const handleDelete = () => {
    if (conversationId) {
      deleteConversation(conversationId);
      navigation.navigate('ChatList');
    }
  };

  const renderIcon = (icon, color) => (
    <View style={[styles.iconBox, { backgroundColor: color + '22' }]}>
      <Ionicons name={icon} size={18} color={color} />
    </View>
  );

  const renderRow = ({ icon, color, label, value, right, onPress, last, valueLines }) => {
    const content = (
      <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}>
        {renderIcon(icon, color)}
        <View style={{ flex: 1 }}>
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

  const actions = [
    { key: 'msg', icon: 'chatbubble', label: 'Message', onPress: () => navigation.goBack() },
    { key: 'audio', icon: 'call', label: 'Audio', onPress: () => handleCall('audio') },
    { key: 'video', icon: 'videocam', label: 'Video', onPress: () => handleCall('video') },
  ];

  const hasInfo = !!(user?.email || user?.status);

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <LinearGradient colors={['#0084FF', '#0A5FD6']} style={styles.headerGrad}>
          <View style={styles.orb} />
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={user?.avatar ? 0.85 : 1}
            onPress={() => { if (user?.avatar) setShowPhoto(true); }}
            style={styles.avatarWrapper}
          >
            <View style={styles.avatarRing}>
              <Avatar uri={user?.avatar} style={styles.avatar} />
            </View>
            {isOnline && <View style={styles.onlineBadge} />}
          </TouchableOpacity>

          <Text style={styles.name} numberOfLines={1}>{user?.name || 'Unknown'}</Text>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? '#34C759' : 'rgba(255,255,255,0.55)' }]} />
            <Text style={styles.statusLabel}>{statusText}</Text>
          </View>
        </LinearGradient>

        {/* Quick actions (overlap the header) */}
        <View style={styles.actionRow}>
          {actions.map((a) => (
            <TouchableOpacity
              key={a.key}
              activeOpacity={0.75}
              style={[styles.actionBtn, { backgroundColor: C.surface, borderColor: C.border }]}
              onPress={a.onPress}
            >
              <Ionicons name={a.icon} size={22} color={ACCENT} />
              <Text style={[styles.actionLabel, { color: C.text }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* About */}
        {hasInfo ? (
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>About</Text>
            <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              {user?.status ? renderRow({
                icon: 'chatbubble-ellipses', color: '#34C759', label: 'Bio', value: user.status,
                last: !user?.email,
              }) : null}
              {user?.email ? renderRow({
                icon: 'mail', color: ACCENT, label: 'Email', value: user.email, last: true, valueLines: 1,
              }) : null}
            </View>
          </View>
        ) : null}

        {conversationId ? (
          <>
            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>Chat</Text>
              <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                {renderRow({
                  icon: 'search', color: '#5856D6', label: 'Search Chat', right: chevron,
                  onPress: () => navigation.navigate('SearchChat', { conversationId }),
                })}
                {renderRow({
                  icon: 'color-palette', color: '#AF52DE', label: 'Chat Theme', right: chevron,
                  onPress: () => navigation.navigate('ThemeSelector', { conversationId, currentTheme }),
                })}
                {renderRow({
                  icon: 'images', color: '#FF9500', label: 'Shared Media', right: chevron,
                  onPress: () => navigation.navigate('SharedMedia', { conversationId }),
                })}
                {renderRow({
                  icon: isMuted ? 'volume-mute' : 'notifications', color: isMuted ? '#FF9500' : '#34C759',
                  label: 'Mute Notifications', last: true,
                  right: <Switch value={!!isMuted} onValueChange={handleMute} trackColor={{ true: '#34C759' }} />,
                })}
              </View>
            </View>

            <View style={styles.sectionWrap}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.deleteBtn, { backgroundColor: C.surface, borderColor: C.border }]}
                onPress={() => {
                  Alert.alert('Delete Chat', 'Are you sure you want to delete this chat?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: handleDelete },
                  ]);
                }}
              >
                <Ionicons name="trash-outline" size={19} color="#FF3B30" />
                <Text style={styles.deleteText}>Delete Chat</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* Full-screen photo viewer */}
      <Modal visible={showPhoto} transparent animationType="fade" onRequestClose={() => setShowPhoto(false)} statusBarTranslucent>
        <GestureHandlerRootView style={styles.viewerOverlay}>
          {user?.avatar ? (
            <ZoomableImage uri={user.avatar} width={winW} height={winW} onTap={() => setShowPhoto(false)} />
          ) : null}
          <View style={styles.viewerTop} pointerEvents="box-none">
            <Text style={styles.viewerName} numberOfLines={1}>{user?.name}</Text>
            <TouchableOpacity style={styles.viewerClose} onPress={() => setShowPhoto(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerGrad: {
    alignItems: 'center',
    paddingTop: 70,
    paddingBottom: 56,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute', top: -90, right: -70, width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  backBtn: {
    position: 'absolute', top: 50, left: 16, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  avatarWrapper: { position: 'relative', marginBottom: 14 },
  avatarRing: {
    padding: 4, borderRadius: 62, backgroundColor: 'rgba(255,255,255,0.28)',
  },
  avatar: { width: 108, height: 108, borderRadius: 54, borderWidth: 3, borderColor: '#FFF' },
  avatarFallback: { backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 38, color: '#FFF', fontWeight: '700' },
  onlineBadge: {
    position: 'absolute', bottom: 8, right: 8, width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#34C759', borderWidth: 3, borderColor: '#FFF',
  },
  name: { fontSize: 25, fontWeight: '800', color: '#FFF', marginBottom: 8, maxWidth: '85%' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  // Actions
  actionRow: {
    flexDirection: 'row', gap: 12, marginHorizontal: 20, marginTop: -30,
  },
  actionBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8,
  },
  actionLabel: { fontSize: 12, fontWeight: '600' },
  // Sections
  sectionWrap: { marginHorizontal: 16, marginTop: 22 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
    paddingHorizontal: 6, marginBottom: 8,
  },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowValue: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 18, paddingVertical: 15, borderWidth: StyleSheet.hairlineWidth,
  },
  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  viewerTop: {
    position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 48, paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  viewerName: { color: '#FFF', fontSize: 17, fontWeight: '700', flex: 1, marginRight: 12 },
  viewerClose: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteText: { color: '#FF3B30', fontWeight: '700', fontSize: 15 },
});
