import React, { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  StatusBar,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';
import { formatTime, getInitials } from '../../utils/helpers';
import { useColors } from '../../store/useThemeStore';
import SwipeableChatRow from '../../components/chat/SwipeableChatRow';

const AVATAR_COLORS = [
  ['#0084FF', '#00C6FF'],
  ['#FF512F', '#DD2476'],
  ['#8E2DE2', '#4A00E0'],
  ['#11998e', '#38ef7d'],
  ['#FC466B', '#3F5EFB'],
  ['#F7971E', '#FFD200'],
  ['#e1eec3', '#f05053'],
  ['#654ea3', '#eaafc8'],
];

function avatarGradient(name = '') {
  const code = name ? name.charCodeAt(0) : 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export default function ArchivedChatsScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const {
    conversations,
    archivedConversationIds,
    mutedConversationIds,
    unarchiveConversation,
    toggleMuteConversation,
    deleteConversation,
    onlineUsers,
  } = useChatStore();

  const C = useColors();
  const isDark = C.bg === '#121212' || C.bg === '#0D1117' || C.bg?.toLowerCase()?.includes('12');

  const archivedList = useMemo(() => {
    const list = Array.isArray(conversations) ? conversations : [];
    return list.filter((c) => archivedConversationIds.includes(c._id));
  }, [conversations, archivedConversationIds]);

  const handleDelete = (item, otherName) => {
    Alert.alert(
      'Delete Chat',
      `Are you sure you want to delete this chat with ${otherName || 'this user'}? All messages will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteConversation(item._id),
        },
      ]
    );
  };

  const renderItem = ({ item }) => {
    const other = item.participants?.find((p) => p._id?.toString() !== user?._id?.toString());
    const isOnline = onlineUsers[other?._id] ?? other?.isOnline;
    const isMuted = !!mutedConversationIds[item._id];
    const lastMsg = item.lastMessage;
    const isDeleted = lastMsg?.isDeleted;

    let rawUnread = item.unreadCount;
    let unreadCount = 0;
    if (typeof rawUnread === 'number') {
      unreadCount = rawUnread;
    } else if (rawUnread && typeof rawUnread === 'object') {
      unreadCount = rawUnread[user?._id] || rawUnread[user?._id?.toString()] || 0;
    }
    const isMine = lastMsg?.sender === user?._id || lastMsg?.sender?._id === user?._id;
    const isUnread = unreadCount > 0;

    const preview = isDeleted
      ? 'Message deleted'
      : lastMsg?.images?.length
      ? `📷 Photo${lastMsg.images.length > 1 ? 's' : ''}`
      : lastMsg?.voiceNoteUrl || lastMsg?.isVoiceNote
      ? '🎤 Voice note'
      : lastMsg?.text || 'Start a conversation';

    const gradColors = avatarGradient(other?.name || '');

    let statusIcon = null;
    if (isMine && lastMsg) {
      const color = lastMsg.status === 'seen' ? '#0084FF' : (isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)');
      const iconName = lastMsg.status === 'sent' ? 'checkmark' : 'checkmark-done';
      statusIcon = <Ionicons name={iconName} size={15} color={color} style={{ marginRight: 4 }} />;
    }

    return (
      <SwipeableChatRow
        isArchived={true}
        isMuted={isMuted}
        onArchive={() => unarchiveConversation(item._id)}
        onMute={() => toggleMuteConversation(item._id)}
        onDelete={() => handleDelete(item, other?.name)}
        onPress={() => navigation.navigate('Chat', { conversation: item, otherUser: other })}
      >
        <View
          style={[
            styles.itemCard,
            { backgroundColor: isDark ? '#161B22' : '#FFFFFF' }
          ]}
        >
          <View style={styles.avatarContainer}>
            {other?.avatar ? (
              <Image source={{ uri: other.avatar }} style={styles.avatarImage} />
            ) : (
              <LinearGradient colors={gradColors} style={styles.avatarImage}>
                <Text style={styles.avatarInitials}>{getInitials(other?.name)}</Text>
              </LinearGradient>
            )}
            {isOnline && <View style={[styles.onlineBadge, { borderColor: isDark ? '#0D1117' : '#FFFFFF' }]} />}
          </View>

          <View style={styles.infoContainer}>
            <View style={styles.nameRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                <Text
                  style={[
                    styles.userName,
                    { color: isDark ? '#FFFFFF' : '#1C1E21' },
                    isUnread && styles.unreadText,
                  ]}
                  numberOfLines={1}
                >
                  {other?.name || 'User'}
                </Text>
                {isMuted && (
                  <Ionicons
                    name="volume-mute"
                    size={14}
                    color={isDark ? 'rgba(255,255,255,0.4)' : '#8E8E93'}
                    style={{ marginLeft: 6 }}
                  />
                )}
              </View>
              {lastMsg && (
                <Text
                  style={[
                    styles.timeText,
                    { color: isUnread ? '#0084FF' : (isDark ? '#8E8E93' : '#8E8E93') },
                    isUnread && { fontWeight: '700' },
                  ]}
                >
                  {formatTime(lastMsg.createdAt)}
                </Text>
              )}
            </View>

            <View style={styles.messageRow}>
              <View style={styles.previewWrapper}>
                {statusIcon}
                <Text
                  style={[
                    styles.previewText,
                    {
                      color: isUnread
                        ? (isDark ? '#FFFFFF' : '#1C1E21')
                        : (isDark ? 'rgba(255,255,255,0.55)' : '#65676B'),
                    },
                    isUnread && styles.unreadText,
                    isDeleted && { fontStyle: 'italic', paddingRight: 4 },
                  ]}
                  numberOfLines={1}
                >
                  {isMine ? `You: ${preview}` : preview}
                </Text>
              </View>

              {isUnread && (
                <LinearGradient
                  colors={['#0084FF', '#0066FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.unreadBadge}
                >
                  <Text style={styles.unreadBadgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </LinearGradient>
              )}
            </View>
          </View>
        </View>
      </SwipeableChatRow>
    );
  };

  const pageBg = isDark ? '#0D1117' : '#F7F8FA';
  const headerBg = isDark ? '#161B22' : '#FFFFFF';

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* ── Header ── */}
      <View style={[styles.headerContainer, { backgroundColor: headerBg }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={isDark ? '#FFF' : '#1C1E21'} />
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.headerTitleText, { color: isDark ? '#FFFFFF' : '#1C1E21' }]}>
              Archived Chats
            </Text>
            <Text style={[styles.headerSubText, { color: isDark ? '#8E8E93' : '#65676B' }]}>
              {archivedList.length} {archivedList.length === 1 ? 'chat' : 'chats'} archived
            </Text>
          </View>
        </View>
      </View>

      {/* ── List or Empty State ── */}
      {archivedList.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View
            style={[
              styles.emptyIconCircle,
              { backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)' },
            ]}
          >
            <Ionicons name="archive-outline" size={44} color="#6366F1" />
          </View>
          <Text style={[styles.emptyTitle, { color: isDark ? '#FFF' : '#1C1E21' }]}>
            No archived chats
          </Text>
          <Text style={[styles.emptySub, { color: isDark ? '#8E8E93' : '#65676B' }]}>
            Swipe left on any chat in your main list to archive it.
          </Text>
        </View>
      ) : (
        <FlatList
          data={archivedList}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 48,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatarImage: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFF',
    fontSize: 19,
    fontWeight: '700',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: '#31A24C',
    borderWidth: 2.5,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '400',
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  previewText: {
    fontSize: 14,
    flex: 1,
  },
  unreadText: {
    fontWeight: '700',
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginLeft: 6,
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
