import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  Image, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ImageBackground, ScrollView, Modal, TouchableWithoutFeedback,
  StatusBar, Dimensions, Keyboard, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import Avatar from '../../components/common/Avatar';
import ZoomableImage from '../../components/common/ZoomableImage';
import { parseShareText } from '../../utils/feedShare';
import ArticleReader from '../../components/common/ArticleReader';
import { GestureHandlerRootView as ViewerGestureRoot } from 'react-native-gesture-handler';
import { Animated as RNAnimated } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { conversationApi, mediaApi } from '../../api/services';
import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import useCallStore from '../../store/useCallStore';
import { EmojiKeyboard } from '../../components/EmojiKeyboardWrapper';
import { THEMES, DEFAULT_THEME, getAdaptiveTheme } from '../../themes/themes';
import useThemeStore, { useColors } from '../../store/useThemeStore';
import { formatMessageTime, formatLastSeen, getInitials } from '../../utils/helpers';
import { bdDayNumber, bdDayKey, bdLongDate } from '../../utils/bdTime';

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

let PinchGestureHandler, PanGestureHandler, State, Swipeable;
try {
  const gh = require('react-native-gesture-handler');
  PinchGestureHandler = gh.PinchGestureHandler;
  PanGestureHandler = gh.PanGestureHandler;
  State = gh.State;
  Swipeable = gh.Swipeable;
} catch (e) {
  // fallback: no zoom or swipe
}

// ── Full-screen image viewer with pinch-to-zoom ───────────────────────
function ImageViewer({ data, visible, onClose, onDelete, canDelete }) {
  const scale = useRef(new RNAnimated.Value(1)).current;
  const lastScale = useRef(1);
  const translateX = useRef(new RNAnimated.Value(0)).current;
  const translateY = useRef(new RNAnimated.Value(0)).current;

  // All photos of the tapped message, so the viewer can swipe between them
  const photos = data?.msg?.images?.length ? data.msg.images.map((im) => im.url) : (data ? [data.uri] : []);
  const [photoIdx, setPhotoIdx] = useState(0);
  React.useEffect(() => {
    if (!data) return;
    const i = photos.indexOf(data.uri);
    setPhotoIdx(i < 0 ? 0 : i);
  }, [data?.uri, data?.msg?._id]);
  const goPhoto = (dir) => setPhotoIdx((i) => Math.max(0, Math.min(photos.length - 1, i + dir)));

  // Reset transforms when modal opens/closes
  React.useEffect(() => {
    if (!visible) {
      scale.setValue(1);
      lastScale.current = 1;
      translateX.setValue(0);
      translateY.setValue(0);
    }
  }, [visible]);

  if (!data) return null;

  const onPinchEvent = RNAnimated.event(
    [{ nativeEvent: { scale: scale } }],
    { useNativeDriver: true }
  );

  const onPinchStateChange = (event) => {
    if (event.nativeEvent.oldState === (State?.ACTIVE || 4)) {
      lastScale.current *= event.nativeEvent.scale;
      if (lastScale.current < 1) lastScale.current = 1;
      if (lastScale.current > 5) lastScale.current = 5;
      scale.setValue(lastScale.current);
    }
  };

  const onDoubleTap = () => {
    const toValue = lastScale.current > 1 ? 1 : 2.5;
    lastScale.current = toValue;
    RNAnimated.spring(scale, { toValue, useNativeDriver: true }).start();
    if (toValue === 1) {
      RNAnimated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      RNAnimated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* A Modal needs its own gesture root on Android, otherwise pinch/pan never fire */}
      <ViewerGestureRoot style={styles.imageViewerBg}>
        {/* Centered, zoomable photo: pinch, double-tap, drag; single tap closes */}
        <ZoomableImage
          key={photos[photoIdx] || data.uri}
          uri={photos[photoIdx] || data.uri}
          width={SCREEN_W}
          height={SCREEN_H * 0.8}
          onTap={onClose}
          onSwipe={photos.length > 1 ? goPhoto : undefined}
        />
        {photos.length > 1 && (
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 48, alignSelf: 'center', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {photos.map((_, i) => (
                <View key={i} style={{ width: i === photoIdx ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === photoIdx ? '#FFF' : 'rgba(255,255,255,0.4)' }} />
              ))}
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' }}>{photoIdx + 1} / {photos.length}</Text>
          </View>
        )}
        <View style={styles.imageViewerHeader}>
          <TouchableOpacity style={styles.imageViewerHeaderBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
          {canDelete && onDelete ? (
            <TouchableOpacity style={styles.imageViewerHeaderBtn} onPress={onDelete}>
              <Ionicons name="trash-outline" size={22} color="#FF453A" />
            </TouchableOpacity>
          ) : null}
        </View>
      </ViewerGestureRoot>
    </Modal>
  );
}

// Several photos in one message: a fixed-width 2-column grid (sits on the sender's side like any bubble)
const MULTI_GRID_W = Math.min(Math.round(Dimensions.get('window').width * 0.66), 280);
const MULTI_CELL = Math.floor((MULTI_GRID_W - 4) / 2);

// ── Dropdown menu ────────────────────────────────────────────────────
function DropdownMenu({ visible, onClose, items, isDark }) {
  const anim = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      anim.setValue(0);
      RNAnimated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 90 }).start();
    }
  }, [visible, anim]);
  if (!visible) return null;

  const cardBg = isDark ? '#1E2128' : '#FFFFFF';
  const textColor = isDark ? '#F2F4F8' : '#1B1F29';
  const divider = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const top = (Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 50) + 54;

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.12)' }]}>
        <RNAnimated.View
          style={[
            styles.dropdownCard,
            {
              top,
              backgroundColor: cardBg,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
              opacity: anim,
              transform: [
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
                { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              ],
            },
          ]}
        >
          {items.map((item, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.6}
              style={[
                styles.dropdownItem,
                i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: divider },
              ]}
              onPress={() => { onClose(); item.onPress(); }}
            >
              <View style={[styles.dropdownIconChip, { backgroundColor: (item.tint || '#0084FF') + (isDark ? '2E' : '1F') }]}>
                <Ionicons name={item.icon} size={18} color={item.tint || '#0084FF'} />
              </View>
              <Text style={[styles.dropdownLabel, { color: textColor }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={15} color={isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.25)'} />
            </TouchableOpacity>
          ))}
        </RNAnimated.View>
      </View>
    </TouchableWithoutFeedback>
  );
}

// ── Voice note audio player ───────────────────────────────────────────
function VoiceNotePlayer({ url, duration = 0, isMine, theme }) {
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionSec, setPositionSec] = useState(0);

  const totalSec = Math.max(duration || 0, 1);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync().catch(() => {});
      }
    };
  }, [sound]);

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPositionSec(Math.floor((status.positionMillis || 0) / 1000));
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPositionSec(0);
        sound?.setPositionAsync(0).catch(() => {});
      }
    }
  };

  const togglePlay = async () => {
    if (!url) return;
    try {
      if (sound) {
        if (isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
        } else {
          await sound.playAsync();
          setIsPlaying(true);
        }
      } else {
        setIsLoading(true);
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );
        setSound(newSound);
        setIsPlaying(true);
        setIsLoading(false);
      }
    } catch (err) {
      console.warn('Voice play error:', err);
      setIsLoading(false);
      setIsPlaying(false);
    }
  };

  const formatSec = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progress = totalSec > 0 ? Math.min(positionSec / totalSec, 1) : 0;
  const textColor = isMine ? theme.sentText : theme.receivedText;
  const iconColor = isMine ? theme.sentText : theme.sentBubble;
  const btnBg = isMine ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.06)';

  return (
    <View style={styles.voiceNoteContainer}>
      <TouchableOpacity
        onPress={togglePlay}
        style={[styles.voicePlayBtn, { backgroundColor: btnBg }]}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color={iconColor} />
        )}
      </TouchableOpacity>

      <View style={styles.voiceWaveArea}>
        <View style={styles.voiceTrack}>
          <View
            style={[
              styles.voiceProgress,
              {
                width: `${Math.max(progress * 100, 4)}%`,
                backgroundColor: isMine ? theme.sentText : theme.sentBubble,
              },
            ]}
          />
        </View>
        <View style={styles.voiceMetaRow}>
          <Text style={[styles.voiceTimeText, { color: textColor }]}>
            {isPlaying ? formatSec(positionSec) : formatSec(totalSec)}
          </Text>
          <Ionicons name="mic-outline" size={13} color={textColor} style={{ opacity: 0.7 }} />
        </View>
      </View>
    </View>
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
  const recipientUser = useMemo(() => {
    if (otherUser) return otherUser;
    if (convo?.participants?.length) {
      return convo.participants.find(
        (p) =>
          p._id?.toString() !== currentUser?._id?.toString() &&
          p.toString() !== currentUser?._id?.toString()
      );
    }
    return null;
  }, [otherUser, convo?.participants, currentUser]);
  const { resolvedTheme } = useThemeStore();

  // Local theme key — loaded from AsyncStorage (supports painted themes the backend can't store)
  const [localThemeKey, setLocalThemeKey] = useState(null);
  const convoThemeRef = useRef(convo?.theme);
  convoThemeRef.current = convo?.theme;
  useEffect(() => {
    AsyncStorage.getItem(`chat_theme_${conversationId}`).then(stored => {
      // A theme the other person picked (saved on the server) wins over an old local value;
      // the local value only fills in while the server still has its untouched default.
      const serverKey = convoThemeRef.current;
      const serverIsDefault = !serverKey || serverKey === 'ClassicBlue';
      if (stored && THEMES[stored] && serverIsDefault) setLocalThemeKey(stored);
    });
  }, [conversationId]);

  // Listen for in-store changes (set by ThemeSelectorScreen after apply)
  useEffect(() => {
    const storeKey = convo.theme;
    if (storeKey && THEMES[storeKey]) setLocalThemeKey(storeKey);
  }, [convo.theme]);

  // Resolve active theme: local key wins over backend key
  const activeThemeKey = localThemeKey || convo.theme || DEFAULT_THEME;
  // Every theme follows the app's light/dark mode with its own matching palette
  const theme = getAdaptiveTheme(activeThemeKey, resolvedTheme);

  const isHeaderLight = isLightHeader(theme);
  const headerIconColor = isHeaderLight ? (theme.headerText || '#1C1C1C') : '#FFFFFF';
  const headerNameColor = isHeaderLight ? (theme.headerText || '#1C1C1C') : '#FFFFFF';
  const headerStatusColor = isHeaderLight ? 'rgba(0, 0, 0, 0.65)' : 'rgba(255, 255, 255, 0.8)';
  const statusBarStyle = isHeaderLight ? 'dark-content' : 'light-content';

  // Frosted-glass styling for bottom input bar
  const isDarkTheme = !theme.isLight;
  const glassGradient = useMemo(() => {
    const baseColor = theme.inputBg || theme.background || (isDarkTheme ? '#141A24' : '#F5F5F5');
    return [
      hexToRgba(baseColor, 0.72),
      hexToRgba(baseColor, 0.88),
      hexToRgba(baseColor, 0.96),
    ];
  }, [theme.inputBg, theme.background, isDarkTheme]);

  // Colour for composer icons / send button. Some light themes use a very pale sent bubble
  // (e.g. mint) which is nearly invisible on a white bar, so fall back to the theme accent there.
  const composerColor = useMemo(() => {
    const c = theme.sentBubble || '#0084FF';
    if (c.startsWith('#') && c.length >= 7) {
      const l = (0.299 * parseInt(c.slice(1, 3), 16) + 0.587 * parseInt(c.slice(3, 5), 16) + 0.114 * parseInt(c.slice(5, 7), 16)) / 255;
      if (l > 0.62) return theme.accentColor || '#0B6E4F';
    }
    return c;
  }, [theme.sentBubble, theme.accentColor]);

  const composerNoticeColor = isDarkTheme ? 'rgba(255,255,255,0.6)' : (theme.accentColor || '#0084FF');

  const textInputBg = useMemo(() => {
    if (isDarkTheme) {
      return 'rgba(255, 255, 255, 0.08)';
    }
    return theme.inputBg || 'rgba(255, 255, 255, 0.9)';
  }, [isDarkTheme, theme.inputBg]);

  const statusColor = useMemo(() => {
    if (isDarkTheme) {
      return 'rgba(255, 255, 255, 0.55)';
    }
    return theme.timestampColor || 'rgba(0, 0, 0, 0.45)';
  }, [isDarkTheme, theme.timestampColor]);

  // Subtle border that complements the active theme color
  const textInputBorderColor = useMemo(() => {
    const base = theme.sentBubble || (isDarkTheme ? '#FFFFFF' : '#000000');
    // Use hexToRgba for hex values, fallback to fixed opacity rgba
    if (base.startsWith('#')) {
      return hexToRgba(base, isDarkTheme ? 0.25 : 0.20);
    }
    return isDarkTheme ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.12)';
  }, [theme.sentBubble, isDarkTheme]);

  const convoMessages = messages[conversationId] || [];

  const [articleReader, setArticleReader] = useState(null);
  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedImages, setSelectedImages] = useState([]);
  const [loading, setLoading] = useState(convoMessages.length === 0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [imageViewerData, setImageViewerData] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showSeenTime, setShowSeenTime] = useState(false);
  const [tappedMsgId, setTappedMsgId] = useState(null);

  // Voice recording state
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [uploadingVoice, setUploadingVoice] = useState(false);

  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, [recording]);

  const typingTimeout = useRef(null);
  const flatListRef = useRef(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const isEmojiPickerOpenRef = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(280);
  const keyboardHeightRef = useRef(280);
  const swipeableRefs = useRef({});
  const isKeyboardVisible = useRef(false);
  const keyboardPadding = useRef(new RNAnimated.Value(0)).current;
  const kbWrapRef = useRef(null);
  const isTyping = typingUsers[conversationId];

  const isOtherOnline = onlineUsers[recipientUser?._id] ?? recipientUser?.isOnline;
  const lastSeenText = isOtherOnline
    ? 'Online'
    : formatLastSeen(recipientUser?.lastSeen || recipientUser?.updatedAt);

  const [selectedMessage, setSelectedMessage] = useState(null);

  const closeEmojiPicker = useCallback(() => {
    if (isEmojiPickerOpenRef.current) {
      isEmojiPickerOpenRef.current = false;
      setIsEmojiPickerOpen(false);
      if (!isKeyboardVisible.current) {
        RNAnimated.timing(keyboardPadding, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      }
    }
  }, [keyboardPadding]);

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
      isEmojiPickerOpenRef.current = false;
      setIsEmojiPickerOpen(false);
      const h = e?.endCoordinates?.height || 0;
      if (h > 0 && h !== keyboardHeightRef.current) {
        keyboardHeightRef.current = h;
        setKeyboardHeight(h);
      }
      // Lift the composer by exactly how far the keyboard really overlaps this screen. The event
      // height alone can be a little short/long (nav-bar / gesture inset differences), which left the
      // input row partly hidden behind the keyboard now and then. Falls back to the event height.
      const dur = e?.duration || 180;
      const sy = e?.endCoordinates?.screenY;
      const node = kbWrapRef.current;
      const apply = (pad) => {
        if (!isKeyboardVisible.current) return;
        RNAnimated.timing(keyboardPadding, { toValue: pad, duration: dur, useNativeDriver: false }).start();
      };
      let measured = false;
      if (Platform.OS === 'android' && h > 0 && sy > 0 && node && typeof node.measureInWindow === 'function') {
        try {
          node.measureInWindow((x, y, w, ht) => {
            const pad = Math.max(0, Math.round(y + ht - sy));
            apply(Number.isFinite(pad) && Math.abs(pad - h) <= 80 ? pad : h);
          });
          measured = true;
        } catch (err) { measured = false; }
      }
      if (!measured) apply(h);
      scrollToBottom(false);
      setTimeout(() => scrollToBottom(true), 80);
    });

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      isKeyboardVisible.current = false;
      RNAnimated.timing(keyboardPadding, {
        toValue: isEmojiPickerOpenRef.current ? keyboardHeightRef.current : 0,
        duration: e?.duration || 180,
        useNativeDriver: false,
      }).start();
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
    useChatStore.getState().clearUnreadCount(conversationId);
    loadMessages(1);
    emit('join', { conversationId });
    emit('message_seen', { conversationId });
    return () => {
      clearTimeout(typingTimeout.current);
      useChatStore.getState().setActiveConversationId(null);
    };
  }, []);

  // Removed unconditional scrollToBottom on convoMessages.length change
  // to prevent jumping to bottom when loading older messages (pagination).

  useEffect(() => {
    if (convoMessages.length > 0) {
      const lastMsg = convoMessages[convoMessages.length - 1];
      const isMine =
        lastMsg?.sender?._id?.toString() === currentUser?._id?.toString() ||
        lastMsg?.sender?.toString() === currentUser?._id?.toString();
      if (!isMine && lastMsg?.status !== 'seen') {
        emit('message_seen', { conversationId });
      }
    }
  }, [convoMessages.length, conversationId, currentUser]);

  // ── Typing ──────────────────────────────────────────────────────────
  const handleTyping = (val) => {
    setText(val);
    if (!isTyping) emit('typing_start', { conversationId });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => emit('typing_stop', { conversationId }), 1500);
  };

  // ── Camera & Gallery ────────────────────────────────────────────────
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera permission to take photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      setSelectedImages((prev) => [...prev, ...result.assets].slice(0, 5));
    } catch (err) {
      console.warn('Camera error:', err);
      Alert.alert('Camera Error', 'Could not open camera: ' + (err.message || 'Unknown error'));
    }
  };

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

  // ── Voice Recording ────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', 'Microphone permission is required to send voice notes.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      if (recording) {
        try {
          await recording.stopAndUnloadAsync();
        } catch (e) {}
      }

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status) => {
          if (status.isRecording) {
            setRecordingDuration(Math.floor((status.durationMillis || 0) / 1000));
          }
        },
        250
      );

      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);
    } catch (err) {
      console.warn('Failed to start recording:', err);
      Alert.alert('Recording Error', err.message || 'Could not start recording.');
    }
  };

  const cancelRecording = async () => {
    if (!recording) return;
    try {
      setIsRecording(false);
      setRecordingDuration(0);
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch (e) {
      console.warn('Error canceling recording:', e);
    }
    setRecording(null);
  };

  const stopAndSendRecording = async () => {
    if (!recording) return;
    try {
      setIsRecording(false);
      const finalDuration = recordingDuration;
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);
      setRecordingDuration(0);

      if (!uri) return;

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const optimisticMsg = {
        _id: tempId,
        conversation: conversationId,
        sender: currentUser,
        text: '',
        images: [],
        isVoiceNote: true,
        voiceNoteUrl: uri,
        voiceNoteDuration: finalDuration,
        status: 'sending',
        createdAt: new Date().toISOString(),
      };
      useChatStore.getState().addMessage(conversationId, optimisticMsg);
      scrollToBottom(true);

      (async () => {
        try {
          const formData = new FormData();
          formData.append('files', {
            uri,
            type: 'audio/m4a',
            name: `voice_${Date.now()}.m4a`,
          });
          const { data } = await mediaApi.upload(formData);
          if (data && data.length > 0) {
            emit(
              'send_message',
              {
                conversationId,
                text: '',
                images: [],
                isVoiceNote: true,
                voiceNoteUrl: data[0].url,
                voiceNoteDuration: finalDuration,
              },
              (response) => {
                if (response?.error) {
                  useChatStore.getState().updateMessageStatus(conversationId, tempId, 'failed');
                } else if (response?.message) {
                  useChatStore.getState().replaceOptimisticMessage(conversationId, tempId, response.message);
                }
              }
            );
          }
        } catch (err) {
          console.warn('Voice upload error:', err);
          useChatStore.getState().updateMessageStatus(conversationId, tempId, 'failed');
        }
      })();
    } catch (err) {
      console.warn('Error stopping recording:', err);
    }
  };

  // ── Send message (Optimistic & Non-blocking) ────────────────────────
  const sendMessage = async () => {
    const messageText = text.trim();
    const imagesToUpload = [...selectedImages];
    if (!messageText && imagesToUpload.length === 0) return;

    // Immediately clear input fields so the user can continue typing and sending!
    setText('');
    setSelectedImages([]);
    const currentReplyTo = replyingTo;
    setReplyingTo(null);
    emit('typing_stop', { conversationId });

    // Generate optimistic message
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const optimisticMsg = {
      _id: tempId,
      conversation: conversationId,
      sender: currentUser,
      text: messageText,
      images: imagesToUpload.map((img) => ({ url: img.uri, isLocal: true })),
      status: 'sending',
      createdAt: new Date().toISOString(),
      replyTo: currentReplyTo,
    };

    useChatStore.getState().addMessage(conversationId, optimisticMsg);
    scrollToBottom(true);

    (async () => {
      try {
        let uploadedData = [];
        if (imagesToUpload.length > 0) {
          const formData = new FormData();
          for (const img of imagesToUpload) {
            if (Platform.OS === 'web') {
              const response = await fetch(img.uri);
              const blob = await response.blob();
              formData.append('files', blob, img.fileName || 'img.jpg');
            } else {
              formData.append('files', {
                uri: img.uri,
                type: img.mimeType || 'image/jpeg',
                name: img.fileName || 'img.jpg',
              });
            }
          }
          const { data } = await mediaApi.upload(formData);
          uploadedData = data;
        }

        emit(
          'send_message',
          { conversationId, text: messageText, images: uploadedData, replyTo: currentReplyTo?._id || null },
          (response) => {
            if (response?.error) {
              console.warn('Send message error:', response.error);
              useChatStore.getState().updateMessageStatus(conversationId, tempId, 'failed');
            } else if (response?.message) {
              useChatStore.getState().replaceOptimisticMessage(conversationId, tempId, response.message);
            }
          }
        );
      } catch (err) {
        console.warn('Background send error:', err);
        useChatStore.getState().updateMessageStatus(conversationId, tempId, 'failed');
      }
    })();
  };

  // ── Long Press Context Menu ───────────────────────────────────────────
  const onLongPressMessage = (msg, e) => {
    if (msg.isDeleted) return;
    const pageY = e?.nativeEvent?.pageY || Dimensions.get('window').height / 2;
    setSelectedMessage({ msg, pageY });
  };

  // Helper: human-readable date label for separators
  const formatDateLabel = (dateStr) => {
    const diff = bdDayNumber(Date.now()) - bdDayNumber(dateStr);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return bdLongDate(dateStr);
  };

  const displayedMessages = useMemo(() => {
    const list = searchQuery.trim()
      ? convoMessages.filter(m => m.text?.toLowerCase()?.includes(searchQuery.toLowerCase()))
      : convoMessages;
    // Newest-first for inverted FlatList
    return [...list].reverse();
  }, [convoMessages, searchQuery]);

  // Find the last message sent by currentUser
  const lastMyMessage = useMemo(() => {
    return displayedMessages.find((m) => {
      const isMine =
        m.sender?._id?.toString() === currentUser?._id?.toString() ||
        m.sender?.toString() === currentUser?._id?.toString();
      return isMine && !m.isDeleted && !m.isSystem;
    });
  }, [displayedMessages, currentUser]);

  // Reliably get recipient avatar+name from: otherUser route param → convo.participants → message senders
  const recipientAvatarData = useMemo(() => {
    // 1. Route param (most reliable)
    if (otherUser?.avatar || otherUser?.name) {
      return { avatar: otherUser.avatar || null, name: otherUser.name || 'U' };
    }
    // 2. Populated participant object
    if (convo?.participants?.length) {
      const p = convo.participants.find(
        (x) => x?._id && x._id.toString() !== currentUser?._id?.toString()
      );
      if (p?._id) return { avatar: p.avatar || null, name: p.name || 'U' };
    }
    // 3. Scan messages for a sender that isn't me (always populated by backend populate())
    for (const m of convoMessages) {
      const isTheirs =
        m.sender?._id &&
        m.sender._id.toString() !== currentUser?._id?.toString();
      if (isTheirs) return { avatar: m.sender.avatar || null, name: m.sender.name || 'U' };
    }
    return { avatar: null, name: 'U' };
  }, [otherUser, convo?.participants, convoMessages, currentUser]);

  // Find the newest message that the recipient has read or sent (their read head position for the mini avatar)
  const recipientReadMessage = useMemo(() => {
    return displayedMessages.find((m) => {
      if (m.isDeleted) return false;
      const isMine =
        m.sender?._id?.toString() === currentUser?._id?.toString() ||
        m.sender?.toString() === currentUser?._id?.toString();
      // Recipient has reached this message if it's their own message, or my message marked 'seen'
      return !isMine || (isMine && m.status === 'seen');
    });
  }, [displayedMessages, currentUser]);

  const renderStatusFooter = (msg, isMine) => {
    const isTapped = tappedMsgId === msg._id?.toString();
    const isReadHead = recipientReadMessage?._id?.toString() === msg._id?.toString();

    // 1. If this message is the recipient's read head position -> ALWAYS show mini avatar!
    if (isReadHead) {
      const timeStr = formatMessageTime(isMine ? (msg.seenAt || msg.updatedAt || msg.createdAt) : msg.createdAt);
      return (
        <View style={[styles.statusFooterRow, styles.statusFooterMine, { alignItems: 'center' }]}>
          {(showSeenTime || isTapped) && (
            <Text style={[styles.statusFooterText, { color: statusColor, marginRight: 5 }]}>
              {isMine ? `Seen ${timeStr}` : timeStr}
            </Text>
          )}
          <Avatar uri={recipientAvatarData.avatar} style={styles.seenMiniAvatar} />
        </View>
      );
    }

    // 2. For THEIR messages that are NOT the read head: show time only if tapped
    if (!isMine) {
      if (!isTapped) return null;
      return (
        <View style={[styles.statusFooterRow, styles.statusFooterTheir]}>
          <Text style={[styles.statusFooterText, { color: statusColor }]}>
            {formatMessageTime(msg.createdAt)}
          </Text>
        </View>
      );
    }

    // 3. For MY messages: show text status ('Sending...', 'Failed', 'Delivered', 'Sent • time')
    // for the last message sent by me OR when specifically tapped
    const isLastMyMsg = lastMyMessage?._id?.toString() === msg._id?.toString();
    const showStatus = isLastMyMsg || isTapped;
    if (!showStatus) return null;

    const isSending = msg.status === 'sending';
    const isFailed = msg.status === 'failed';

    let statusText = '';
    if (isSending) {
      statusText = 'Sending...';
    } else if (isFailed) {
      statusText = 'Failed';
    } else if (msg.status === 'seen') {
      statusText = `Seen • ${formatMessageTime(msg.seenAt || msg.createdAt)}`;
    } else if (msg.status === 'delivered') {
      statusText = `Delivered • ${formatMessageTime(msg.createdAt)}`;
    } else {
      statusText = `Sent • ${formatMessageTime(msg.createdAt)}`;
    }

    return (
      <View style={[styles.statusFooterRow, styles.statusFooterMine]}>
        <Text style={[styles.statusFooterText, { color: isFailed ? '#FF3B30' : statusColor }]}>
          {statusText}
        </Text>
      </View>
    );
  };

  // ── Render message ──────────────────────────────────────────────────
  const renderMessage = ({ item: msg, index }) => {
    const isMine = msg.sender?._id?.toString() === currentUser?._id?.toString() || msg.sender?.toString() === currentUser?._id?.toString();
    const isLastMyMsg = lastMyMessage?._id?.toString() === msg._id?.toString();
    const isTapped = tappedMsgId === msg._id?.toString();

    // ── Date separator ───────────────────────────────────────────────
    // displayedMessages is newest-first. index+1 is the OLDER message.
    // Show a date label above (visually) the oldest message of each day.
    const olderMsg = displayedMessages[index + 1];
    const thisDay = msg.createdAt ? bdDayKey(msg.createdAt) : null;
    const olderDay = olderMsg?.createdAt ? bdDayKey(olderMsg.createdAt) : null;
    const showDateSeparator = thisDay && thisDay !== olderDay;
    const pillBg = theme.sentBubble?.startsWith('#')
      ? hexToRgba(theme.sentBubble, 0.15)
      : 'rgba(128,128,128,0.15)';

    const datePill = showDateSeparator ? (
      <View style={styles.dateSeparatorRow}>
        <View style={[styles.dateSeparatorPill, { backgroundColor: pillBg }]}>
          <Text style={[styles.dateSeparatorText, { color: statusColor }]}>
            {formatDateLabel(msg.createdAt)}
          </Text>
        </View>
      </View>
    ) : null;

    const handlePress = () => {
      if (isLastMyMsg && msg.status === 'seen') {
        setShowSeenTime((prev) => !prev);
      }
      setTappedMsgId((prev) => (prev === msg._id?.toString() ? null : msg._id?.toString()));
    };

    // ── System notice (e.g. theme change) ────────────────────────────
    if (msg.isSystem) {
      const who = isMine ? 'You' : (msg.sender?.name || 'Someone');
      const noticeText = msg.systemData?.kind === 'theme' && msg.systemData?.value
        ? `${who} changed the theme to ${msg.systemData.value}`
        : msg.text;
      return (
        <View style={{ width: '100%' }}>
          {datePill}
          <View style={styles.systemNoticeRow}>
            <View style={[styles.systemNoticePill, { backgroundColor: pillBg }]}>
              <Ionicons name="color-palette" size={13} color={composerNoticeColor} style={{ marginRight: 6 }} />
              <Text style={[styles.systemNoticeText, { color: statusColor }]} numberOfLines={2}>{noticeText}</Text>
            </View>
          </View>
        </View>
      );
    }

    // ── Call message bubble ──────────────────────────────────────────
    if (msg.callData?.callType) {
      const cd = msg.callData;
      const isRejected = cd.status === 'rejected';
      const isVideo = cd.callType === 'video';

      let iconName = '';
      if (isVideo) {
        if (isRejected) iconName = 'video-off';
        else iconName = isMine ? 'video' : 'video'; // video doesn't have direction arrows in MCI usually, but we can use 'video'
      } else {
        if (isRejected) iconName = 'phone-missed';
        else if (isMine) iconName = 'phone-outgoing';
        else iconName = 'phone-incoming';
      }

      const mins = Math.floor((cd.duration || 0) / 60).toString().padStart(2, '0');
      const secs = ((cd.duration || 0) % 60).toString().padStart(2, '0');
      const durationStr = cd.status === 'completed' && cd.duration > 0 ? ` • ${mins}:${secs}` : '';
      const label = isRejected
        ? (isMine ? 'Cancelled' : 'Missed call')
        : isVideo
        ? (isMine ? 'Outgoing video call' : 'Incoming video call')
        : (isMine ? 'Outgoing call' : 'Incoming call');
      const iconColor = isRejected ? '#FF3B30' : '#0084FF';
      // Dark themes: my call card uses the same look as the other person's (calmer, no bright blue slab)
      const callUseSent = isMine && !!theme.isLight;
      const callBg = callUseSent ? theme.sentBubble : theme.receivedBubble;
      const callTextColor = callUseSent ? theme.sentText : theme.receivedText;

      return (
        <View style={{ width: '100%' }}>
          {datePill}
          <View style={[styles.bubble, isMine ? styles.myBubbleRow : styles.theirBubbleRow]}>
            {!isMine && (
              <Avatar uri={msg.sender?.avatar} style={styles.senderAvatar} />
            )}
            <TouchableOpacity
              onPress={() => {
                const { callState: cs } = useCallStore.getState();
                if (cs !== 'idle' && cs !== 'ended') {
                  Alert.alert('Already in a Call', 'You cannot start a new call while already in a call.');
                  return;
                }
                const targetUser = isMine ? recipientUser : (msg.sender || recipientUser);
                const type = cd.callType || 'video';
                useCallStore.getState().startCall(targetUser, type);
                navigation.navigate('Call', { otherUser: targetUser, callType: type });
              }}
              activeOpacity={0.7}
              style={[styles.callBubble, { backgroundColor: callBg }]}
            >
              <View style={[styles.callIconBadge, { backgroundColor: '#FFF' }]}>
                <MaterialCommunityIcons name={iconName} size={20} color={iconColor} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: callTextColor, fontSize: 14, fontWeight: '600' }}>
                  {label}{durationStr}
                </Text>
                <Text style={{ color: callTextColor, fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                  {formatMessageTime(msg.createdAt)}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (msg.isDeleted) {
      return (
        <View>
          {datePill}
          <View style={[styles.bubble, isMine ? styles.myBubbleRow : styles.theirBubbleRow]}>
            {!isMine && (
              <Avatar uri={msg.sender?.avatar} style={styles.senderAvatar} />
            )}
            <View style={[styles.deletedBubble, { backgroundColor: isMine ? theme.sentBubble : theme.receivedBubble, opacity: 0.5 }]}>
              <Text style={{ color: isMine ? theme.sentText : theme.receivedText, fontStyle: 'italic', fontSize: 13, paddingRight: 6 }}>
                {"Message deleted  "}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    const renderActions = () => {
      return (
        <View style={{ justifyContent: 'center', alignItems: 'center', width: 50 }}>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: 6, borderRadius: 20 }}>
            <Ionicons name="arrow-undo" size={18} color={theme.sentBubble} />
          </View>
        </View>
      );
    };

    const SwipeableWrapper = Swipeable ? Swipeable : View;
    const swipeableProps = Swipeable ? {
      ref: ref => { if (ref) swipeableRefs.current[msg._id] = ref; },
      ...(isMine ? { renderRightActions: renderActions } : { renderLeftActions: renderActions }),
      friction: 1.5,
      overshootFriction: 8,
      containerStyle: { width: '100%' },
      onSwipeableWillOpen: () => {
        setReplyingTo(msg);
        swipeableRefs.current[msg._id]?.close();
      }
    } : {};

    return (
      <View style={{ width: '100%' }}>
        {datePill}
        <SwipeableWrapper {...swipeableProps}>
        <TouchableOpacity
          onPress={handlePress}
          onLongPress={(e) => onLongPressMessage(msg, e)}
          delayLongPress={100}
          style={[
            styles.bubble, 
            isMine ? styles.myBubbleRow : styles.theirBubbleRow,
            (msg.reaction || msg.reactions?.length > 0) ? { marginBottom: 16 } : null
          ]}
          activeOpacity={0.85}
        >
          {!isMine && (
            <Avatar uri={msg.sender?.avatar} style={styles.senderAvatar} />
          )}
          <View style={[styles.bubbleContent, { alignItems: isMine ? 'flex-end' : 'flex-start' }]}>
            {msg.replyTo && (
              <View style={[styles.replyBubbleContainer, { 
                backgroundColor: isMine ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.08)',
                marginBottom: -12,
                paddingBottom: 20,
              }]}>
                <View style={styles.replyBubbleContent}>
                  <Text numberOfLines={1} style={[styles.replyBubbleName, { color: isMine ? '#FFF' : theme.sentBubble }]}>
                    {msg.replyTo.sender?.name || 'User'}
                  </Text>
                  <Text numberOfLines={1} style={[styles.replyBubbleText, { color: isMine ? '#FFF' : theme.receivedText }]}>
                    {msg.replyTo.isVoiceNote ? '🎤 Voice Note' : (msg.replyTo.images?.length ? '📷 Photo' : (msg.replyTo.callData?.callType ? '📞 Call' : msg.replyTo.text))}
                  </Text>
                </View>
              </View>
            )}
            {msg.images?.length > 0 && (
              <View style={styles.imageBubbleContainer}>
                <View style={[styles.imageGrid, msg.images.length > 1 && { width: MULTI_GRID_W, justifyContent: isMine ? 'flex-end' : 'flex-start' }]}>
                  {msg.images.map((img, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setImageViewerData({ uri: img.url, msg })}
                      onLongPress={(e) => onLongPressMessage(msg, e)}
                      delayLongPress={100}
                      activeOpacity={0.9}
                    >
                      <Image
                        source={{ uri: img.url }}
                        style={msg.images.length > 1 ? { width: MULTI_CELL, height: MULTI_CELL, borderRadius: 12 } : styles.messageImage}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            {msg.isVoiceNote || msg.voiceNoteUrl ? (
              <View style={[styles.voiceBubble, { backgroundColor: isMine ? theme.sentBubble : theme.receivedBubble }]}>
                <VoiceNotePlayer
                  url={msg.voiceNoteUrl}
                  duration={msg.voiceNoteDuration}
                  isMine={isMine}
                  theme={theme}
                />
              </View>
            ) : null}
            {msg.text ? (
              <View style={[styles.textBubble, { backgroundColor: isMine ? theme.sentBubble : theme.receivedBubble }]}>
                {(() => {
                  // A story shared from the Feed shows as a small card; everything else is a normal text bubble
                  const feed = parseShareText(msg.text);
                  if (!feed) {
                    return (
                      <Text style={{ color: isMine ? theme.sentText : theme.receivedText, fontSize: 15, lineHeight: 22 }}>
                        {msg.text}
                      </Text>
                    );
                  }
                  const fg = isMine ? theme.sentText : theme.receivedText;
                  return (
                    <TouchableOpacity activeOpacity={0.8} onPress={() => setArticleReader({ url: feed.url, title: feed.title, source: feed.meta.split(' · ')[0] })} style={{ minWidth: 200 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(124,58,237,0.9)', alignItems: 'center', justifyContent: 'center', marginRight: 7 }}>
                          <Ionicons name="newspaper" size={12} color="#FFF" />
                        </View>
                        <Text style={{ color: fg, opacity: 0.7, fontSize: 11.5, fontWeight: '700' }} numberOfLines={1}>{feed.meta}</Text>
                      </View>
                      <Text style={{ color: fg, fontSize: 15, fontWeight: '700', lineHeight: 21 }} numberOfLines={4}>{feed.title}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                        <Text style={{ color: fg, opacity: 0.75, fontSize: 12.5, fontWeight: '700' }}>Read story</Text>
                        <Ionicons name="open-outline" size={13} color={fg} style={{ opacity: 0.75, marginLeft: 4 }} />
                      </View>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            ) : null}
            
            {(() => {
              const displayReaction = msg.reactions?.length > 0 ? msg.reactions[msg.reactions.length - 1].emoji : msg.reaction;
              if (!displayReaction) return null;
              return (
                <TouchableOpacity
                  onPress={() => {
                    useChatStore.getState().reactMessage(conversationId, msg._id, null);
                    conversationApi.reactToMessage(msg._id, null).catch(err => console.warn('React error:', err));
                  }}
                  style={[styles.reactionBadge, { right: 0, backgroundColor: theme.background, borderColor: theme.background }]}
                >
                  <Text style={styles.reactionBadgeText}>{displayReaction}</Text>
                </TouchableOpacity>
              );
            })()}
          </View>
        </TouchableOpacity>
        </SwipeableWrapper>
        {renderStatusFooter(msg, isMine)}
      </View>
    );
  };

  // ── 3-dot menu items ────────────────────────────────────────────────
  const menuItems = [
    { icon: 'color-palette-outline', tint: '#8B5CF6', label: 'Chat Theme', onPress: () => navigation.navigate('ThemeSelector', { conversationId, currentTheme: convo.theme }) },
    { icon: 'images-outline', tint: '#0EA5E9', label: 'Shared Media', onPress: () => navigation.navigate('SharedMedia', { conversationId }) },
    { icon: 'search-outline', tint: '#F59E0B', label: 'Search Messages', onPress: () => { setSearchVisible(true); setMenuVisible(false); } },
  ];

  const bgStyle = [styles.container, { backgroundColor: theme.background }];

  // Platform-aware keyboard handling: use animated padding for smooth transition with Emoji Keyboard
  const KeyboardWrapper = RNAnimated.View;
  const wrapperProps = { ref: kbWrapRef, collapsable: false, style: [{ flex: 1 }, { paddingBottom: keyboardPadding }] };

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
            user: recipientUser,
            isOnline: isOtherOnline,
            lastSeen: recipientUser?.lastSeen || recipientUser?.updatedAt,
            conversationId: conversationId,
          })}
        >
          <Avatar uri={recipientUser?.avatar} style={styles.headerAvatar} />
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, marginLeft: 10 }}
          onPress={() => navigation.navigate('UserProfile', {
            user: recipientUser,
            isOnline: isOtherOnline,
            lastSeen: recipientUser?.lastSeen || recipientUser?.updatedAt,
            conversationId: conversationId,
          })}
        >
          <Text style={[styles.headerName, { color: headerNameColor }]} numberOfLines={1}>{recipientUser?.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {isOtherOnline && <View style={styles.onlinePip} />}
            <Text style={[styles.headerStatus, { color: headerStatusColor }]}>{lastSeenText}</Text>
          </View>
        </TouchableOpacity>

        {(recipientUser?._id || otherUser?._id) !== currentUser?._id && (
          <>
            {/* Audio call */}
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => {
                const target = recipientUser || otherUser;
                if (!target) return;
                const { callState: cs } = useCallStore.getState();
                if (cs !== 'idle' && cs !== 'ended') {
                  Alert.alert('Already in a Call', 'Please end your current call before starting a new one.');
                  return;
                }
                useCallStore.getState().startCall(target, 'audio');
                navigation.navigate('Call', { otherUser: target, callType: 'audio' });
              }}
            >
              <Ionicons name="call-outline" size={21} color={headerIconColor} />
            </TouchableOpacity>

            {/* Video call */}
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => {
                const target = recipientUser || otherUser;
                if (!target) return;
                const { callState: cs } = useCallStore.getState();
                if (cs !== 'idle' && cs !== 'ended') {
                  Alert.alert('Already in a Call', 'Please end your current call before starting a new one.');
                  return;
                }
                useCallStore.getState().startCall(target, 'video');
                navigation.navigate('Call', { otherUser: target, callType: 'video' });
              }}
            >
              <Ionicons name="videocam-outline" size={22} color={headerIconColor} />
            </TouchableOpacity>
          </>
        )}

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
              <View style={{ alignItems: 'center', marginTop: 48 }}>
                <Ionicons name="search" size={42} color="#8E8E93" />
                <Text style={{ color: '#8E8E93', marginTop: 10, fontSize: 15 }}>No messages found</Text>
              </View>
            ) : (
              // a brand-new conversation: a warm welcome instead of an empty screen.
              // (FlatList already un-flips its empty component when `inverted`, so no extra flip here: that made it upside down)
              <View style={{ alignItems: 'center', paddingHorizontal: 32, marginTop: 56 }}>
                <View style={{ width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
                  <View style={{ width: 92, height: 92, borderRadius: 46, overflow: 'hidden' }}>
                    <Avatar uri={recipientAvatarData.avatar} name={recipientAvatarData.name} style={{ width: 92, height: 92, borderRadius: 46 }} />
                  </View>
                </View>
                <Text style={{ marginTop: 18, fontSize: 20, fontWeight: '600', color: isDarkTheme ? '#FFFFFF' : '#1C1E21' }} numberOfLines={1}>
                  {recipientAvatarData.name && recipientAvatarData.name !== 'U' ? recipientAvatarData.name : 'New chat'}
                </Text>
                <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, textAlign: 'center', color: isDarkTheme ? 'rgba(255,255,255,0.65)' : '#65676B' }}>
                  No messages yet. Say hello and start the conversation!
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 20 }}>
                  {['Hi 👋', 'How are you?', 'What\'s up?'].map((s) => (
                    <TouchableOpacity
                      key={s}
                      activeOpacity={0.8}
                      onPress={() => setText(s)}
                      style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, marginHorizontal: 4, marginBottom: 8, backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' }}
                    >
                      <Text style={{ fontSize: 14, color: isDarkTheme ? '#FFFFFF' : '#1C1E21' }}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )
          }
          keyboardShouldPersistTaps="handled"
          onTouchStart={closeEmojiPicker}
          onScrollBeginDrag={closeEmojiPicker}
        />
      )}

      {/* ── Input bar (Frosted Glass / Blurry Theme-adaptive Bar) ──── */}
      <LinearGradient
        colors={glassGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.glassInputContainer}
      >
        {replyingTo && (
          <View style={[styles.replyPreviewContainer, { backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
            <View style={styles.replyPreviewContent}>
              <Text numberOfLines={1} style={[styles.replyPreviewName, { color: composerColor }]}>
                {replyingTo.sender?.name || 'User'}
              </Text>
              <Text numberOfLines={1} style={[styles.replyPreviewText, { color: theme.inputText }]}>
                {replyingTo.isVoiceNote ? '🎤 Voice Note' : (replyingTo.images?.length ? '📷 Photo' : (replyingTo.callData?.callType ? '📞 Call' : replyingTo.text))}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyPreviewClose}>
              <Ionicons name="close" size={20} color="#8E8E93" />
            </TouchableOpacity>
          </View>
        )}
        {selectedImages.length > 0 && (
          <View style={styles.imagePreviewContainer}>
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
        {isRecording ? (
          <View style={styles.recordingRow}>
            <View style={styles.recordingInfo}>
              <View style={styles.redDot} />
              <Text style={[styles.recordingText, { color: theme.inputText }]}>
                Recording... {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={cancelRecording}
              style={styles.cancelRecordBtn}
              activeOpacity={0.7}
              disabled={uploadingVoice}
            >
              <Ionicons name="trash-outline" size={22} color="#FF3B30" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={stopAndSendRecording}
              style={[styles.sendBtn, { backgroundColor: composerColor, shadowColor: composerColor }]}
              activeOpacity={0.8}
            >
              <Ionicons name="send" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TouchableOpacity
              onPress={takePhoto}
              style={styles.iconBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="camera" size={23} color={composerColor} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={pickImages}
              style={styles.iconBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="image" size={23} color={composerColor} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={startRecording}
              style={styles.iconBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="mic" size={23} color={composerColor} />
            </TouchableOpacity>
            <View style={[
              styles.textInputWrapper,
              {
                backgroundColor: textInputBg,
                borderWidth: 1,
                borderColor: textInputBorderColor,
              }
            ]}>
              <TextInput
                style={[
                  styles.textInput,
                  { color: theme.inputText }
                ]}
              value={text}
              onChangeText={handleTyping}
              onFocus={() => {
                closeEmojiPicker();
                scrollToBottom(true);
              }}
              placeholder="Message..."
              placeholderTextColor={theme.placeholderText}
              multiline
              maxLength={5000}
              underlineColorAndroid="transparent"
            />
            <TouchableOpacity onPress={() => {
                if (isEmojiPickerOpen) {
                  closeEmojiPicker();
                } else {
                  isEmojiPickerOpenRef.current = true;
                  setIsEmojiPickerOpen(true);
                  if (!isKeyboardVisible.current) {
                    RNAnimated.timing(keyboardPadding, { toValue: keyboardHeightRef.current, duration: 180, useNativeDriver: false }).start();
                  } else {
                    Keyboard.dismiss();
                  }
                }
              }} style={styles.emojiBtn}>
                <Ionicons name="happy-outline" size={24} color={composerColor} />
            </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={sendMessage}
              style={[
                styles.sendBtn,
                {
                  backgroundColor: composerColor,
                  opacity: (!text.trim() && selectedImages.length === 0) ? 0.45 : 1,
                  shadowColor: composerColor,
                },
              ]}
              disabled={!text.trim() && selectedImages.length === 0}
            >
              <Ionicons name="send" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>



      <ArticleReader data={articleReader} onClose={() => setArticleReader(null)} />

      {/* ── Full-screen image viewer ────────────────────────────────── */}
      <ImageViewer
        data={imageViewerData}
        visible={!!imageViewerData}
        onClose={() => setImageViewerData(null)}
        canDelete={
          imageViewerData?.msg?.sender?._id?.toString() === currentUser?._id?.toString() ||
          imageViewerData?.msg?.sender?.toString() === currentUser?._id?.toString()
        }
        onDelete={() => {
          if (!imageViewerData?.msg) return;
          const targetMsg = imageViewerData.msg;
          setImageViewerData(null);
          setTimeout(() => onLongPressMessage(targetMsg), 150);
        }}
      />

      {/* ── 3-dot dropdown ─────────────────────────────────────────── */}
      <DropdownMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        items={menuItems}
        isDark={isDarkTheme}
      />

      {/* ── Context Menu (Reactions & Delete) ───────────────────────── */}
      <Modal visible={!!selectedMessage} transparent={true} animationType="fade" onRequestClose={() => setSelectedMessage(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setSelectedMessage(null)}>
          {selectedMessage && (
            <>
              {/* Reaction Bar */}
              <TouchableOpacity activeOpacity={1} style={[styles.reactionBar, { 
                position: 'absolute', 
                top: Math.max(80, Math.min(selectedMessage.pageY - 85, Dimensions.get('window').height - 250)),
                alignSelf: 'center'
              }]}>
                {['❤️', '😂', '😮', '😢', '👍'].map(emoji => (
                  <TouchableOpacity key={emoji} onPress={() => {
                    const currentReaction = selectedMessage.msg.reactions?.find(r => r.user?.toString() === currentUser?._id?.toString() || r.user === currentUser?._id?.toString())?.emoji || selectedMessage.msg.reaction;
                    const newEmoji = currentReaction === emoji ? null : emoji;
                    
                    useChatStore.getState().reactMessage(conversationId, selectedMessage.msg._id, newEmoji);
                    conversationApi.reactToMessage(selectedMessage.msg._id, emoji).catch(err => console.warn('React error:', err));
                    
                    setSelectedMessage(null);
                  }} style={styles.reactionEmojiBtn}>
                    <Text style={styles.reactionEmojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </TouchableOpacity>

              {(() => {
                const msg = selectedMessage.msg;
                const isMine = msg?.sender?._id?.toString() === currentUser?._id?.toString() || msg?.sender?.toString() === currentUser?._id?.toString();
                if (!isMine) return null;
                return (
                  <TouchableOpacity activeOpacity={1} style={[styles.messageActionSheet, { backgroundColor: isDarkTheme ? '#1c1c1e' : '#fff' }]}>
                    <TouchableOpacity style={styles.actionSheetRow} onPress={() => {
                      const targetMsg = selectedMessage.msg;
                      setSelectedMessage(null);
                      
                      Alert.alert('Confirm Delete', 'Are you sure you want to delete this for everyone? This action cannot be undone.', [
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            if (targetMsg._id?.toString().startsWith('temp_')) {
                              useChatStore.getState().deleteMessage(conversationId, targetMsg._id);
                              return;
                            }
                            conversationApi.deleteMessage(targetMsg._id).catch(err => console.warn('Delete error:', err));
                          }
                        },
                        { text: 'Cancel', style: 'cancel' }
                      ]);
                    }}>
                      <View style={[styles.actionIconBg, { backgroundColor: isDarkTheme ? 'rgba(255,59,48,0.15)' : 'rgba(255,59,48,0.1)' }]}>
                        <Ionicons name="trash-outline" size={22} color="#FF3B30" />
                      </View>
                      <Text style={[styles.actionSheetText, { color: '#FF3B30' }]}>Delete for everyone</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })()}
            </>
          )}
        </TouchableOpacity>
      </Modal>
    </KeyboardWrapper>
  );

  const emojiTranslateY = keyboardPadding.interpolate({
    inputRange: [0, Math.max(keyboardHeight, 1)],
    outputRange: [keyboardHeight, 0],
    extrapolate: 'clamp',
  });

  const emojiContent = (
    <RNAnimated.View 
      style={{
        position: 'absolute', left: 0, right: 0,
        bottom: 0,
        height: keyboardHeight, backgroundColor: isDarkTheme ? '#1c1c1e' : '#fff',
        zIndex: isEmojiPickerOpen ? 1 : -1,
        elevation: isEmojiPickerOpen ? 1 : -1,
        opacity: isEmojiPickerOpen ? 1 : 0,
        transform: [{ translateY: emojiTranslateY }]
      }}
      pointerEvents={isEmojiPickerOpen ? 'auto' : 'none'}
    >
      <EmojiKeyboard
        defaultHeight={keyboardHeight}
        enableCategoryChangeGesture={false}
        onEmojiSelected={(emojiObject) => {
            setText(prev => prev + emojiObject.emoji);
          }}
          hideHeader={true}
          categoryPosition="top"
          theme={{
          backdrop: isDarkTheme ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)',
          knob: theme.sentBubble,
          container: isDarkTheme ? '#1c1c1e' : '#fff',
          header: isDarkTheme ? '#fff' : '#000',
          skinTonesContainer: isDarkTheme ? '#2c2c2e' : '#f0f0f0',
          category: {
            icon: theme.sentBubble,
            iconActive: '#fff',
            container: isDarkTheme ? '#2c2c2e' : '#f0f0f0',
            containerActive: theme.sentBubble,
          },
        }}
      />
    </RNAnimated.View>
  );

  if (theme.bgImage) {
    return (
      <ImageBackground source={theme.bgImage} style={bgStyle} resizeMode="cover">
        {content}
        {emojiContent}
      </ImageBackground>
    );
  }

  return (
    <View style={bgStyle}>
      {content}
      {emojiContent}
    </View>
  );
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
    right: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 14,
    minWidth: 224,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 6,
    paddingHorizontal: 10,
    paddingVertical: 11,
    gap: 12,
  },
  dropdownIconChip: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownLabel: { flex: 1, fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },
  // Image viewer
  imageViewerBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerHeader: {
    position: 'absolute',
    top: 52,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  imageViewerHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerImg: { width: SCREEN_W, height: SCREEN_H * 0.8 },
  // Input
  glassInputContainer: {
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 0,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  iconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 3,
  },
  imagePreviewContainer: {
    padding: 8,
    borderBottomWidth: 0,
  },
  previewImageWrapper: { marginRight: 8, position: 'relative', marginTop: 6 },
  previewImage: { width: 60, height: 60, borderRadius: 8 },
  removeImageBtn: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#FF3B30', width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF',
  },
  textInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    marginLeft: 4,
    marginRight: 6,
    minHeight: 40,
    maxHeight: 120,
    overflow: 'hidden',
  },
  emojiBtn: {
    paddingLeft: 4,
    paddingRight: 12,
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingRight: 8,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 15,
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
  // Voice recording row
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 52,
  },
  recordingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  redDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  recordingText: {
    fontSize: 15,
    fontWeight: '600',
  },
  cancelRecordBtn: {
    padding: 8,
    marginRight: 8,
  },
  // Voice note bubble & player
  voiceBubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    minWidth: 190,
  },
  voiceNoteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  voicePlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  voiceWaveArea: {
    flex: 1,
    justifyContent: 'center',
  },
  voiceTrack: {
    height: 4,
    backgroundColor: 'rgba(128, 128, 128, 0.25)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  voiceProgress: {
    height: '100%',
    borderRadius: 2,
  },
  voiceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceTimeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  imageBubbleContainer: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  statusFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -2,
    marginBottom: 4,
    paddingHorizontal: 2,
    backgroundColor: 'transparent',
  },
  statusFooterMine: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
    paddingRight: 10,
  },
  statusFooterTheir: {
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
    paddingLeft: 42, // Shifted slightly more to the right to align better with text inside bubble
  },
  statusFooterText: {
    fontSize: 10,
    fontWeight: '400',
    backgroundColor: 'transparent',
  },
  seenMiniAvatar: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    marginTop: 2,
    marginBottom: 2,
  },
  seenMiniAvatarFallback: {
    backgroundColor: '#0084FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seenMiniAvatarText: {
    color: '#FFF',
    fontSize: 7.5,
    fontWeight: '700',
  },
  dateSeparatorRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  dateSeparatorPill: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dateSeparatorText: {
    fontSize: 11,
    fontWeight: '500',
  },
  systemNoticeRow: { width: '100%', alignItems: 'center', marginVertical: 8, paddingHorizontal: 24 },
  systemNoticePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, maxWidth: '92%' },
  systemNoticeText: { fontSize: 12, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  callBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    minWidth: 190,
  },
  callIconBadge: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  replyPreviewContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 18,
    overflow: 'hidden',
  },
  replyPreviewContent: {
    flex: 1,
    padding: 8,
    paddingLeft: 12,
  },
  replyPreviewName: {
    fontWeight: 'bold',
    fontSize: 13,
    marginBottom: 2,
  },
  replyPreviewText: {
    fontSize: 12,
  },
  replyPreviewClose: {
    padding: 8,
    justifyContent: 'center',
  },
  replyBubbleContainer: {
    flexDirection: 'row',
    borderRadius: 18,
    padding: 10,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  replyBubbleContent: {
    flexShrink: 1,
    justifyContent: 'center',
  },
  replyBubbleName: {
    fontWeight: 'bold',
    fontSize: 11,
    marginBottom: 2,
  },
  replyBubbleText: {
    fontSize: 11,
    opacity: 0.8,
  },
  // Context Menu
  reactionBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  reactionEmojiBtn: {
    paddingHorizontal: 8,
  },
  reactionEmojiText: {
    fontSize: 28,
  },
  reactionBadge: {
    position: 'absolute',
    bottom: -14,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 2,
    zIndex: 10,
  },
  reactionBadgeText: {
    fontSize: 14,
  },
  messageActionSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
  },
  actionSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  actionIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionSheetText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
