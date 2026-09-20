import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image,
  TextInput, ActivityIndicator, StatusBar, ScrollView, RefreshControl
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { conversationApi } from '../../api/services';
import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';
import { formatTime, getInitials } from '../../utils/helpers';
import { useColors } from '../../store/useThemeStore';
import LogoSVG from '../../components/common/LogoSVG';

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

export default function ChatListScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const { conversations, setConversations, onlineUsers } = useChatStore();
  const C = useColors();
  const isDark = C.bg === '#121212' || C.bg === '#0D1117' || C.bg?.toLowerCase()?.includes('12');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const loadConversations = useCallback(async () => {
    try {
      const { data } = await conversationApi.getAll();
      setConversations(data);
    } catch (err) {
      console.error(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, []);

  // Filter conversations by search
  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      const other = c.participants?.find((p) => p._id?.toString() !== user?._id?.toString());
      return other?.name?.toLowerCase()?.includes(search.toLowerCase());
    });
  }, [conversations, search, user]);

  // Extract online friends for top "Active Now" bar
  const onlineFriends = useMemo(() => {
    const list = [];
    const seenIds = new Set();
    conversations.forEach((c) => {
      const other = c.participants?.find((p) => p._id?.toString() !== user?._id?.toString());
      if (other && !seenIds.has(other._id)) {
        seenIds.add(other._id);
        const isOnline = onlineUsers[other._id] ?? other.isOnline;
        if (isOnline) {
          list.push({ ...other, conversation: c });
        }
      }
    });
    return list;
  }, [conversations, onlineUsers, user]);

  // Render individual chat row
  const renderItem = ({ item }) => {
    const other = item.participants?.find((p) => p._id?.toString() !== user?._id?.toString());
    const isOnline = onlineUsers[other?._id] ?? other?.isOnline;
    const lastMsg = item.lastMessage;
    const isDeleted = lastMsg?.isDeleted;
    const unreadCount = item.unreadCount || 0;
    const isUnread = unreadCount > 0;

    const preview = isDeleted
      ? 'Message deleted'
      : lastMsg?.images?.length
      ? `📷 Photo${lastMsg.images.length > 1 ? 's' : ''}`
      : lastMsg?.voiceNoteUrl || lastMsg?.isVoiceNote
      ? '🎤 Voice note'
      : lastMsg?.text || 'Start a conversation';

    const gradColors = avatarGradient(other?.name || '');
    const isMine = lastMsg?.sender === user?._id || lastMsg?.sender?._id === user?._id;

    let statusIcon = null;
    if (isMine && lastMsg) {
      const color = lastMsg.status === 'seen' ? '#0084FF' : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)');
      const iconName = lastMsg.status === 'sent' ? 'checkmark' : 'checkmark-done';
      statusIcon = <Ionicons name={iconName} size={14} color={color} style={{ marginRight: 4 }} />;
    }

    return (
      <TouchableOpacity
        style={[
          styles.itemCard,
          { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF' }
        ]}
        onPress={() => navigation.navigate('Chat', { conversation: item, otherUser: other })}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          {other?.avatar ? (
            <Image source={{ uri: other.avatar }} style={styles.avatarImage} />
          ) : (
            <LinearGradient colors={gradColors} style={styles.avatarImage}>
              <Text style={styles.avatarInitials}>{getInitials(other?.name)}</Text>
            </LinearGradient>
          )}
          {isOnline && <View style={[styles.onlineBadge, { borderColor: isDark ? '#141A24' : '#FFFFFF' }]} />}
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.nameRow}>
            <Text
              style={[
                styles.userName,
                { color: isDark ? '#FFFFFF' : '#1C1E21' },
                isUnread && styles.unreadText
              ]}
              numberOfLines={1}
            >
              {other?.name || 'User'}
            </Text>
            {lastMsg && (
              <Text style={[styles.timeText, { color: isUnread ? '#0084FF' : (isDark ? '#8E8E93' : '#8E8E93') }, isUnread && { fontWeight: '700' }]}>
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
                  { color: isUnread ? (isDark ? '#FFFFFF' : '#1C1E21') : (isDark ? 'rgba(255,255,255,0.55)' : '#65676B') },
                  isUnread && styles.unreadText,
                  isDeleted && { fontStyle: 'italic' }
                ]}
                numberOfLines={1}
              >
                {isMine ? `You: ${preview}` : preview}
              </Text>
            </View>

            {isUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const pageBg = isDark ? '#0D1117' : '#F7F8FA';
  const headerBg = isDark ? '#161B22' : '#FFFFFF';

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* ── Modern Top Header Bar ────────────────────────────────────────── */}
      <View style={[styles.headerContainer, { backgroundColor: headerBg }]}>
        <View style={styles.headerRow}>
          {/* User Profile Shortcut -> Changed to Logo */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.8}
            style={styles.profileBtn}
          >
            <LogoSVG size={36} />
          </TouchableOpacity>

          <Text style={[styles.headerTitleText, { color: isDark ? '#FFFFFF' : '#1C1E21' }]}>PriyoChat</Text>

          {/* Action Buttons */}
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.actionIconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
              onPress={() => navigation.navigate('SearchUsers')}
              activeOpacity={0.7}
            >
              <Ionicons name="create" size={20} color={isDark ? '#FFF' : '#1C1E21'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Messenger Pill Search Box ──────────────────────────────────── */}
        <View
          style={[
            styles.searchPill,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }
          ]}
        >
          <Ionicons name="search" size={18} color={isDark ? 'rgba(255,255,255,0.5)' : '#8E8E93'} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: isDark ? '#FFF' : '#1C1E21' }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : '#8E8E93'}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={isDark ? 'rgba(255,255,255,0.5)' : '#8E8E93'} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Account Warning Banner ───────────────────────────────────────── */}
      {user?.warnings > 0 && (
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.warningBanner, { backgroundColor: isDark ? '#332200' : '#FFF9E6' }]}
          onPress={() => navigation.navigate('WarningDetails')}
        >
          <Ionicons name="warning" size={18} color="#FF9500" style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.warningTitle, { color: isDark ? '#FFD699' : '#995500' }]}>
              Account Warning ({user.warnings})
            </Text>
            <Text style={[styles.warningSub, { color: isDark ? 'rgba(251,214,153,0.7)' : '#B36600' }]}>
              Tap to see details and reason.
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* ── Active Now Horizontal Stories / Online Bar ─────────────────── */}
      {!search && (
        <View style={styles.activeNowContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeNowScrollContent}
          >
            {/* Create Story / New Chat Bubble */}
            <TouchableOpacity
              style={styles.activeItem}
              onPress={() => navigation.navigate('SearchUsers')}
              activeOpacity={0.8}
            >
              <View style={[styles.createStoryRing, { backgroundColor: isDark ? 'rgba(0,132,255,0.15)' : 'rgba(0,132,255,0.1)' }]}>
                <Ionicons name="add" size={24} color="#0084FF" />
              </View>
              <Text style={[styles.activeItemName, { color: isDark ? '#8E8E93' : '#65676B' }]} numberOfLines={1}>
                Your Note
              </Text>
            </TouchableOpacity>

            {/* Online Friends */}
            {onlineFriends.map((friend) => (
              <TouchableOpacity
                key={friend._id}
                style={styles.activeItem}
                onPress={() => navigation.navigate('Chat', { conversation: friend.conversation, otherUser: friend })}
                activeOpacity={0.8}
              >
                <View style={styles.activeAvatarWrapper}>
                  {friend.avatar ? (
                    <Image source={{ uri: friend.avatar }} style={styles.activeAvatar} />
                  ) : (
                    <LinearGradient colors={avatarGradient(friend.name)} style={styles.activeAvatar}>
                      <Text style={styles.activeInitials}>{getInitials(friend.name)}</Text>
                    </LinearGradient>
                  )}
                  <View style={[styles.activeOnlineDot, { borderColor: pageBg }]} />
                </View>
                <Text style={[styles.activeItemName, { color: isDark ? '#E4E6EB' : '#1C1E21' }]} numberOfLines={1}>
                  {friend.name?.split(' ')[0] || 'User'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Conversations List ────────────────────────────────────────── */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color="#0084FF" size="large" />
      ) : filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(0,132,255,0.12)' : 'rgba(0,132,255,0.07)' }]}>
            <Ionicons name="chatbubbles" size={48} color="#0084FF" />
          </View>
          <Text style={[styles.emptyTitle, { color: isDark ? '#FFF' : '#1C1E21' }]}>
            {search ? 'No results found' : 'No chats yet'}
          </Text>
          <Text style={[styles.emptySub, { color: isDark ? '#8E8E93' : '#65676B' }]}>
            {search ? 'Try searching for someone else' : 'Start a conversation with your friends!'}
          </Text>
          {!search && (
            <TouchableOpacity
              onPress={() => navigation.navigate('SearchUsers')}
              style={styles.findFriendsBtn}
              activeOpacity={0.85}
            >
              <Ionicons name="person-add" size={17} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.findFriendsBtnText}>Find Friends</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadConversations(); }}
              tintColor="#0084FF"
              colors={['#0084FF']}
            />
          }
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24, paddingTop: 4 }}
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
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  profileBtn: {
    marginRight: 10,
  },
  headerUserAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerUserInitials: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  headerTitleText: {
    fontSize: 26,
    fontWeight: '800',
    flex: 1,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,149,0,0.2)',
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  warningSub: {
    fontSize: 11,
    fontWeight: '500',
  },

  // ── Active Now Bar Styles ─────────────────────────────────────────────
  activeNowContainer: {
    paddingVertical: 12,
  },
  activeNowScrollContent: {
    paddingHorizontal: 12,
  },
  activeItem: {
    alignItems: 'center',
    marginRight: 16,
    width: 62,
  },
  activeAvatarWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  activeAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeInitials: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  activeOnlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#31A24C',
    borderWidth: 2,
  },
  createStoryRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  activeItemName: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },

  // ── Conversation Card Styles ─────────────────────────────────────────
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    marginVertical: 3,
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
    flex: 1,
    marginRight: 8,
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
    backgroundColor: '#0084FF',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Empty State Styles ──────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 32,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  findFriendsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0084FF',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  findFriendsBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
