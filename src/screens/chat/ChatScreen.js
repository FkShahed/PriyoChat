import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  Image, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ImageBackground, ScrollView, Modal, TouchableWithoutFeedback,
  StatusBar, Dimensions, Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated as RNAnimated } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { conversationApi, mediaApi } from '../../api/services';
import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import useCallStore from '../../store/useCallStore';
import { THEMES, DEFAULT_THEME } from '../../themes/themes';
import useThemeStore, { useColors } from '../../store/useThemeStore';
import { formatMessageTime, formatLastSeen, getInitials } from '../../utils/helpers';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Typing indicator ─────────────────────────────────────────────────
function TypingIndicator({ theme }) {
  const opacities = [
    useRef(new RNAnimated.Value(0.2)).current,
    useRef(new RNAnimated.Value(0.2)).current,
    useRef(new RNAnimated.Value(0.2)).current,
  ];
  useEffect(() => {
    const animations = opacities.map((anim, i) =>
      RNAnimated.sequence([
        RNAnimated.delay(i * 150),
        RNAnimated.loop(
          RNAnimated.sequence([
            RNAnimated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
            RNAnimated.timing(anim, { toValue: 0.2, duration: 400, useNativeDriver: true }),
          ])
        ),
      ])
    );
    RNAnimated.parallel(animations).start();
  }, []);
  return (
    <View style={[styles.typingWrapper, { backgroundColor: theme.receivedBubble }]}>
      <RNAnimated.View style={[styles.dot, { backgroundColor: theme.receivedText, opacity: opacities[0] }]} />
      <RNAnimated.View style={[styles.dot, { backgroundColor: theme.receivedText, marginHorizontal: 3, opacity: opacities[1] }]} />
      <RNAnimated.View style={[styles.dot, { backgroundColor: theme.receivedText, opacity: opacities[2] }]} />
    </View>
  );
}

// ── Full-screen image viewer ──────────────────────────────────────────
function ImageViewer({ uri, visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.imageViewerBg}>
          <TouchableOpacity style={styles.imageViewerClose} onPress={onClose}>
            <Ionicons name="close" size={20} color="#FFF" />
          </TouchableOpacity>
          <Image source={{ uri }} style={styles.imageViewerImg} resizeMode="contain" />
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Dropdown menu ────────────────────────────────────────────────────
function DropdownMenu({ visible, onClose, items }) {
  if (!visible) return null;
  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.dropdownCard}>
          {items.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.dropdownItem, i < items.length - 1 && styles.dropdownItemBorder]}
              onPress={() => { onClose(); item.onPress(); }}
            >
              <Ionicons name={item.icon} size={19} color="#555" style={{ width: 26 }} />
              <Text style={styles.dropdownLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

function isLightHeader(theme) {
  if (!theme) return false;
  if (theme.headerText === '#1C1C1C' || theme.headerText === '#000000' || theme.headerText === '#111111') return true;
  const firstColor = theme.gradient?.[0] || theme.headerBg || '';
  if (firstColor.startsWith('#')) {
    const hex = firstColor.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.65;
    }
  }
  return false;
}

function hexToRgba(hex, alpha = 0.85) {
  if (!hex || typeof hex !== 'string') return `rgba(255, 255, 255, ${alpha})`;
  const rgbMatch = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  }
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(255, 255, 255, ${alpha})`;
}

export default function ChatScreen({ route, navigation }) {
  const { conversation: initialConvo, otherUser } = route.params;
  const currentUser = useAuthStore((s) => s.user);
  const { conversations, messages, setMessages, appendMessages, typingUsers, onlineUsers } = useChatStore();
  const { emit } = useSocketStore();

  const [conversationId] = useState(initialConvo._id);
  const convo = conversations.find(c => c._id === conversationId) || initialConvo;
  const { resolvedTheme } = useThemeStore();

  // Local theme key — loaded from AsyncStorage (supports painted themes the backend can't store)
  const [localThemeKey, setLocalThemeKey] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(`chat_theme_${conversationId}`).then(stored => {
      if (stored && THEMES[stored]) setLocalThemeKey(stored);
    });
  }, [conversationId]);

  // Listen for in-store changes (set by ThemeSelectorScreen after apply)
  useEffect(() => {
    const storeKey = convo.theme;
    if (storeKey && THEMES[storeKey]) setLocalThemeKey(storeKey);
  }, [convo.theme]);

  // Resolve active theme: local key wins over backend key
  const activeThemeKey = localThemeKey || convo.theme || DEFAULT_THEME;
  let theme = THEMES[activeThemeKey] || THEMES[DEFAULT_THEME];
  if (activeThemeKey === DEFAULT_THEME) {
    const baseTheme = THEMES[DEFAULT_THEME];
    if (resolvedTheme === 'dark' && baseTheme.isLight && baseTheme.darkVariant) {
      theme = THEMES[baseTheme.darkVariant];
    } else if (resolvedTheme === 'light' && !baseTheme.isLight && baseTheme.lightVariant) {
      theme = THEMES[baseTheme.lightVariant];
    }
  }

  const isHeaderLight = isLightHeader(theme);
  const headerIconColor = isHeaderLight ? (theme.headerText || '#1C1C1C') : '#FFFFFF';
  const headerNameColor = isHeaderLight ? (theme.headerText || '#1C1C1C') : '#FFFFFF';
  const headerStatusColor = isHeaderLight ? 'rgba(0, 0, 0, 0.65)' : 'rgba(255, 255, 255, 0.8)';
  const statusBarStyle = isHeaderLight ? 'dark-content' : 'light-content';

  // Frosted-glass / blur styling for bottom input bar
  const isDarkTheme = !theme.isLight;
  const glassGradient = useMemo(() => {
    const baseColor = theme.inputBg || theme.background || (isDarkTheme ? '#141A24' : '#F5F5F5');
    return [
      hexToRgba(baseColor, 0.68),
      hexToRgba(baseColor, 0.84),
      hexToRgba(baseColor, 0.95),
    ];
  }, [theme.inputBg, theme.background, isDarkTheme]);

  const textInputBg = useMemo(() => {
    return isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.85)';
  }, [isDarkTheme]);

  const textInputBorder = isDarkTheme
    ? 'rgba(255, 255, 255, 0.12)'
    : 'rgba(0, 0, 0, 0.07)';

  const glassBorderTop = isDarkTheme
    ? 'rgba(255, 255, 255, 0.12)'
    : 'rgba(0, 0, 0, 0.06)';

  const convoMessages = messages[conversationId] || [];

  const [text, setText] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [imageViewerUri, setImageViewerUri] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);

  const typingTimeout = useRef(null);
  const flatListRef = useRef(null);
  const isKeyboardVisible = useRef(false);
  const keyboardPadding = useRef(new RNAnimated.Value(0)).current;
  const isTyping = typingUsers[conversationId];

  const isOtherOnline = onlineUsers[otherUser?._id] ?? otherUser?.isOnline;
  const lastSeenText = isOtherOnline
    ? 'Online'
    : formatLastSeen(otherUser?.lastSeen || otherUser?.updatedAt);

  const scrollToBottom = useCallback((animated = true) => {
    if (flatListRef.current) {
      try {
        flatListRef.current.scrollToOffset({ offset: 0, animated });
      } catch (err) {
        // safe ignore during unmount or layout transition
      }
    }
  }, []);

  // Keep last message visible when keyboard opens & animate padding
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      isKeyboardVisible.current = true;
      const h = e?.endCoordinates?.height || 0;
      if (Platform.OS === 'android') {
        RNAnimated.timing(keyboardPadding, {
          toValue: h,
          duration: 180,
          useNativeDriver: false,
        }).start();
      }
      scrollToBottom(false);
      setTimeout(() => scrollToBottom(true), 80);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      isKeyboardVisible.current = false;
      if (Platform.OS === 'android') {
        RNAnimated.timing(keyboardPadding, {
          toValue: 0,
          duration: 180,
          useNativeDriver: false,
        }).start();
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardPadding, scrollToBottom]);

  // ── Load messages ───────────────────────────────────────────────────
  const loadMessages = useCallback(async (pageNum = 1, append = false) => {
    try {
      const { data } = await conversationApi.getMessages(conversationId, pageNum);
      if (append) appendMessages(conversationId, data.messages);
      else setMessages(conversationId, data.messages);
      setHasMore(pageNum < data.totalPages);
      setPage(pageNum);
    } catch (err) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    useChatStore.getState().setActiveConversationId(conversationId);
    loadMessages(1);
    emit('join', { conversationId });
    emit('message_seen', { conversationId });
    return () => {
      clearTimeout(typingTimeout.current);
      useChatStore.getState().setActiveConversationId(null);
    };
  }, []);

  useEffect(() => {
    if (convoMessages.length > 0 && !searchVisible) {
      scrollToBottom(true);
    }
  }, [convoMessages.length, searchVisible, scrollToBottom]);

  // ── Typing ──────────────────────────────────────────────────────────
  const handleTyping = (val) => {
    setText(val);
    if (!isTyping) emit('typing_start', { conversationId });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => emit('typing_stop', { conversationId }), 1500);
  };

  // ── Images ──────────────────────────────────────────────────────────
  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.8,
    });
    if (result.canceled || !result.assets) return;
    setSelectedImages((prev) => [...prev, ...result.assets].slice(0, 5));
  };

  const removeImage = (index) => setSelectedImages((prev) => prev.filter((_, i) => i !== index));

  // ── Send message ────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (sending || uploading) return;
    const messageText = text.trim();
    if (!messageText && selectedImages.length === 0) return;

    let uploadedData = [];
    if (selectedImages.length > 0) {
      setUploading(true);
      try {
        const formData = new FormData();
        for (const img of selectedImages) {
          if (Platform.OS === 'web') {
            const response = await fetch(img.uri);
            const blob = await response.blob();
            formData.append('files', blob, img.fileName || 'img.jpg');
          } else {
            formData.append('files', { uri: img.uri, type: img.mimeType || 'image/jpeg', name: img.fileName || 'img.jpg' });
          }
        }
        const { data } = await mediaApi.upload(formData);
        uploadedData = data;
      } catch (err) {
        Alert.alert('Upload failed', err.message);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    setSending(true);
    emit('send_message', { conversationId, text: messageText, images: uploadedData }, (response) => {
      if (response?.error) Alert.alert('Error', response.error);
      else { setText(''); setSelectedImages([]); emit('typing_stop', { conversationId }); }
      setSending(false);
    });
    setText('');
    emit('typing_stop', { conversationId });
  };

  // ── Delete ──────────────────────────────────────────────────────────
  const onLongPressMessage = (msg) => {
    if (msg.sender?._id !== currentUser?._id || msg.isDeleted) return;
    Alert.alert('Message', undefined, [
      { text: 'Delete', style: 'destructive', onPress: () => conversationApi.deleteMessage(msg._id).catch(() => {}) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const displayedMessages = useMemo(() => {
    const list = searchQuery.trim()
      ? convoMessages.filter(m => m.text?.toLowerCase()?.includes(searchQuery.toLowerCase()))
      : convoMessages;
    return [...list].reverse();
  }, [convoMessages, searchQuery]);

  // ── Render message ──────────────────────────────────────────────────
  const renderMessage = ({ item: msg }) => {
    const isMine = msg.sender?._id?.toString() === currentUser?._id?.toString() || msg.sender?.toString() === currentUser?._id?.toString();
    if (msg.isDeleted) {
      return (
        <View style={[styles.bubble, isMine ? styles.myBubbleRow : styles.theirBubbleRow]}>
          <View style={[styles.deletedBubble, { backgroundColor: isMine ? theme.sentBubble : theme.receivedBubble, opacity: 0.5 }]}>
            <Text style={{ color: isMine ? theme.sentText : theme.receivedText, fontStyle: 'italic', fontSize: 13 }}>
              Message deleted
            </Text>
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity
        onLongPress={() => onLongPressMessage(msg)}
        style={[styles.bubble, isMine ? styles.myBubbleRow : styles.theirBubbleRow]}
        activeOpacity={0.85}
      >
        {!isMine && (
          msg.sender?.avatar ? (
            <Image source={{ uri: msg.sender.avatar }} style={styles.senderAvatar} />
          ) : (
            <LinearGradient colors={['#0084FF', '#0040CC']} style={[styles.senderAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 11 }}>{getInitials(msg.sender?.name)}</Text>
            </LinearGradient>
          )
        )}
        <View style={styles.bubbleContent}>
          {msg.images?.length > 0 && (
            <View style={styles.imageGrid}>
              {msg.images.map((img, i) => (
                <TouchableOpacity key={i} onPress={() => setImageViewerUri(img.url)} activeOpacity={0.9}>
                  <Image source={{ uri: img.url }} style={styles.messageImage} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {msg.text ? (
            <View style={[styles.textBubble, { backgroundColor: isMine ? theme.sentBubble : theme.receivedBubble }]}>
              <Text style={{ color: isMine ? theme.sentText : theme.receivedText, fontSize: 15, lineHeight: 22 }}>
                {msg.text}
              </Text>
              <View style={styles.timeRow}>
                <Text style={[styles.msgTime, { color: isMine ? 'rgba(255,255,255,0.6)' : theme.timestampColor }]}>
                  {formatMessageTime(msg.createdAt)}
                </Text>
                {isMine && (
                  <Ionicons
                    name={msg.status === 'seen' || msg.status === 'delivered' ? 'checkmark-done' : 'checkmark'}
                    size={13}
                    color={msg.status === 'seen' ? '#34B7F1' : 'rgba(255,255,255,0.55)'}
                    style={{ marginLeft: 3 }}
                  />
                )}
              </View>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  // ── 3-dot menu items ────────────────────────────────────────────────
  const menuItems = [
    { icon: 'color-palette-outline', label: 'Chat Theme', onPress: () => navigation.navigate('ThemeSelector', { conversationId, currentTheme: convo.theme }) },
    { icon: 'images-outline', label: 'Shared Media', onPress: () => navigation.navigate('SharedMedia', { conversationId }) },
    { icon: 'search-outline', label: 'Search Messages', onPress: () => { setSearchVisible(true); setMenuVisible(false); } },
  ];

  const bgStyle = [styles.container, { backgroundColor: theme.background }];

  // Platform-aware keyboard handling: on Android, animated padding avoids OxygenOS 36px ghost inset
  const KeyboardWrapper = Platform.OS === 'ios' ? KeyboardAvoidingView : RNAnimated.View;
  const wrapperProps = Platform.OS === 'ios'
    ? { behavior: 'padding', keyboardVerticalOffset: 0, style: { flex: 1 } }
    : { style: [{ flex: 1 }, { paddingBottom: keyboardPadding }] };

  // ── Main content (shared between View and ImageBackground wrappers)
  const content = (
    <KeyboardWrapper {...wrapperProps}>
      <StatusBar barStyle={statusBarStyle} />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <LinearGradient colors={theme.gradient} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={headerIconColor} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('UserProfile', {
            user: otherUser,
            isOnline: isOtherOnline,
            lastSeen: otherUser?.lastSeen || otherUser?.updatedAt,
          })}
        >
          {otherUser?.avatar ? (
            <Image source={{ uri: otherUser.avatar }} style={styles.headerAvatar} />
          ) : (
            <View style={[
              styles.headerAvatar,
              {
                backgroundColor: isHeaderLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.3)',
                borderColor: isHeaderLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.4)',
                alignItems: 'center',
                justifyContent: 'center',
              }
            ]}>
              <Text style={{ color: headerNameColor, fontWeight: '700', fontSize: 16 }}>{getInitials(otherUser?.name)}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, marginLeft: 10 }}
          onPress={() => navigation.navigate('UserProfile', {
            user: otherUser,
            isOnline: isOtherOnline,
            lastSeen: otherUser?.lastSeen || otherUser?.updatedAt,
          })}
        >
          <Text style={[styles.headerName, { color: headerNameColor }]} numberOfLines={1}>{otherUser?.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {isOtherOnline && <View style={styles.onlinePip} />}
            <Text style={[styles.headerStatus, { color: headerStatusColor }]}>{lastSeenText}</Text>
          </View>
        </TouchableOpacity>

        {/* Audio call */}
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => {
            useCallStore.getState().startCall(otherUser, 'audio');
            navigation.navigate('Call', { otherUser, callType: 'audio' });
          }}
        >
          <Ionicons name="call-outline" size={21} color={headerIconColor} />
        </TouchableOpacity>

        {/* Video call */}
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => {
            useCallStore.getState().startCall(otherUser, 'video');
            navigation.navigate('Call', { otherUser, callType: 'video' });
          }}
        >
          <Ionicons name="videocam-outline" size={22} color={headerIconColor} />
        </TouchableOpacity>

        {/* 3-dot menu */}
        <TouchableOpacity style={styles.headerBtn} onPress={() => setMenuVisible(true)}>
          <Ionicons name="ellipsis-vertical" size={20} color={headerIconColor} />
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Search bar ─────────────────────────────────────────────── */}
      {searchVisible && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={17} color="#AAA" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search messages..."
            placeholderTextColor="#AAA"
            autoFocus
          />
          <TouchableOpacity onPress={() => { setSearchVisible(false); setSearchQuery(''); }}>
            <Ionicons name="close" size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Messages ───────────────────────────────────────────────── */}
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.sentBubble} size="large" />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          ref={flatListRef}
          inverted
          data={displayedMessages}
          keyExtractor={(item) => item._id}
          renderItem={renderMessage}
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 8 }}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={15}
          onEndReached={() => hasMore && !searchVisible && loadMessages(page + 1, true)}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={isTyping ? <TypingIndicator theme={theme} /> : null}
          ListEmptyComponent={
            searchQuery ? (
              <View style={{ alignItems: 'center', marginTop: 48, transform: [{ scaleY: -1 }] }}>
                <Ionicons name="search" size={42} color="#8E8E93" />
                <Text style={{ color: '#8E8E93', marginTop: 10, fontSize: 15 }}>No messages found</Text>
              </View>
            ) : null
          }
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* ── Input bar (Frosted Glass / Blurry Theme-adaptive Bar) ──── */}
      <LinearGradient
        colors={glassGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.glassInputContainer, { borderTopColor: glassBorderTop }]}
      >
        {selectedImages.length > 0 && (
          <View style={[styles.imagePreviewContainer, { borderBottomColor: glassBorderTop }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {selectedImages.map((img, idx) => (
                <View key={idx} style={styles.previewImageWrapper}>
                  <Image source={{ uri: img.uri }} style={styles.previewImage} />
                  <TouchableOpacity style={styles.removeImageBtn} onPress={() => removeImage(idx)}>
                    <Ionicons name="close" size={12} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
        <View style={styles.inputRow}>
          <TouchableOpacity onPress={pickImages} style={styles.attachBtn} disabled={uploading || sending}>
            <Ionicons name="attach" size={24} color={theme.sentBubble} />
          </TouchableOpacity>
          <TextInput
            style={[
              styles.textInput,
              {
                color: theme.inputText,
                backgroundColor: textInputBg,
                borderColor: textInputBorder,
                borderWidth: 1,
              },
            ]}
            value={text}
            onChangeText={handleTyping}
            onFocus={() => {
              scrollToBottom(true);
            }}
            placeholder="Message..."
            placeholderTextColor={theme.placeholderText}
            multiline
            maxLength={5000}
          />
          <TouchableOpacity
            onPress={sendMessage}
            style={[
              styles.sendBtn,
              {
                backgroundColor: theme.sentBubble,
                opacity: (!text.trim() && selectedImages.length === 0) ? 0.45 : 1,
                shadowColor: theme.sentBubble,
              },
            ]}
            disabled={sending || uploading || (!text.trim() && selectedImages.length === 0)}
          >
            {uploading || sending
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Ionicons name="send" size={18} color="#FFF" />}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ── Full-screen image viewer ────────────────────────────────── */}
      <ImageViewer
        uri={imageViewerUri}
        visible={!!imageViewerUri}
        onClose={() => setImageViewerUri(null)}
      />

      {/* ── 3-dot dropdown ─────────────────────────────────────────── */}
      <DropdownMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        items={menuItems}
      />
    </KeyboardWrapper>
  );

  if (theme.bgImage) {
    return (
      <ImageBackground source={theme.bgImage} style={bgStyle} resizeMode="cover">
        {content}
      </ImageBackground>
    );
  }

  return <View style={bgStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 10,
    paddingHorizontal: 10,
  },
  backBtn: { padding: 4, marginRight: 0 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)' },
  headerName: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  headerStatus: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
  onlinePip: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#25D366' },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1C1C1E', paddingVertical: 4 },
  // Dropdown
  dropdownCard: {
    position: 'absolute',
    top: 100,
    right: 12,
    backgroundColor: '#FFF',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    minWidth: 190,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  dropdownItemBorder: { borderBottomWidth: 0.5, borderBottomColor: '#F2F2F7' },
  dropdownLabel: { fontSize: 15, color: '#1C1C1E', fontWeight: '500' },
  // Image viewer
  imageViewerBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 52,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  imageViewerImg: { width: SCREEN_W, height: SCREEN_H * 0.8 },
  // Input
  glassInputContainer: {
    borderTopWidth: 0.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  attachBtn: {
    padding: 8,
    justifyContent: 'center',
    marginBottom: 2,
  },
  imagePreviewContainer: {
    padding: 8,
    borderBottomWidth: 0.5,
  },
  previewImageWrapper: { marginRight: 8, position: 'relative', marginTop: 6 },
  previewImage: { width: 60, height: 60, borderRadius: 8 },
  removeImageBtn: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#FF3B30', width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF',
  },
  textInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 15,
    marginHorizontal: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 2,
  },
  // Bubbles
  bubble: { marginVertical: 3, maxWidth: '80%' },
  myBubbleRow: { alignSelf: 'flex-end', marginRight: 8 },
  theirBubbleRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'flex-end', marginLeft: 4 },
  bubbleContent: { flexShrink: 1 },
  textBubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' },
  deletedBubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  msgTime: { fontSize: 10 },
  senderAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 6 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
  messageImage: { width: 150, height: 150, borderRadius: 12 },
  typingWrapper: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 18, alignSelf: 'flex-start', marginLeft: 12, marginBottom: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
