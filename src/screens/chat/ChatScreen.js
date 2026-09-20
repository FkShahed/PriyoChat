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
import { Audio } from 'expo-av';
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

// ── Full-screen image viewer with pinch-to-zoom ───────────────────────
function ImageViewer({ data, visible, onClose, onDelete, canDelete }) {
  const scale = useRef(new RNAnimated.Value(1)).current;
  const lastScale = useRef(1);
  const translateX = useRef(new RNAnimated.Value(0)).current;
  const translateY = useRef(new RNAnimated.Value(0)).current;

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

  let PinchGestureHandler, PanGestureHandler, State;
  try {
    const gh = require('react-native-gesture-handler');
    PinchGestureHandler = gh.PinchGestureHandler;
    PanGestureHandler = gh.PanGestureHandler;
    State = gh.State;
  } catch (e) {
    // fallback: no zoom
  }

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

  const imageEl = (
    <RNAnimated.Image
      source={{ uri: data.uri }}
      style={[styles.imageViewerImg, { transform: [{ scale }, { translateX }, { translateY }] }]}
      resizeMode="contain"
    />
  );

  const content = PinchGestureHandler ? (
    <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
      <RNAnimated.View style={{ flex: 1 }}>
        <TouchableOpacity onPress={onClose} onLongPress={onDoubleTap} activeOpacity={1} style={{ flex: 1 }}>
          {imageEl}
        </TouchableOpacity>
      </RNAnimated.View>
    </PinchGestureHandler>
  ) : (
    <TouchableOpacity onPress={onClose} activeOpacity={1} style={{ flex: 1 }}>
      {imageEl}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.imageViewerBg}>
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
        {content}
      </View>
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

  const [text, setText] = useState('');
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
          { conversationId, text: messageText, images: uploadedData },
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

  // ── Delete message (Supports images, voice notes, and text) ──────────
  const onLongPressMessage = (msg) => {
    const isMine =
      msg.sender?._id?.toString() === currentUser?._id?.toString() ||
      msg.sender?.toString() === currentUser?._id?.toString();
    if (!isMine || msg.isDeleted) return;

    const isImage = msg.images?.length > 0;
    const itemType = isImage ? 'image' : msg.isVoiceNote ? 'voice note' : 'message';

    Alert.alert(`Delete ${itemType}`, `Are you sure you want to delete this ${itemType}?`, [
      {
        text: 'Delete for everyone',
        style: 'destructive',
        onPress: () => {
          if (msg._id?.toString().startsWith('temp_')) {
            useChatStore.getState().deleteMessage(conversationId, msg._id);
            return;
          }
          conversationApi.deleteMessage(msg._id).catch((err) => {
            console.warn('Delete error:', err);
          });
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Helper: human-readable date label for separators
  const formatDateLabel = (dateStr) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a, b) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
    if (sameDay(d, today)) return 'Today';
    if (sameDay(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
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
      return isMine && !m.isDeleted;
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
          {recipientAvatarData.avatar ? (
            <Image
              source={{ uri: recipientAvatarData.avatar }}
              style={styles.seenMiniAvatar}
            />
          ) : (
            <View style={[styles.seenMiniAvatar, styles.seenMiniAvatarFallback]}>
              <Text style={styles.seenMiniAvatarText}>
                {getInitials(recipientAvatarData.name)}
              </Text>
            </View>
          )}
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
    const thisDay = msg.createdAt ? new Date(msg.createdAt).toDateString() : null;
    const olderDay = olderMsg?.createdAt ? new Date(olderMsg.createdAt).toDateString() : null;
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

    // ── Call message bubble ──────────────────────────────────────────
    if (msg.callData?.callType) {
      const cd = msg.callData;
      const isCompleted = cd.status === 'completed';
      const isRejected = cd.status === 'rejected';
      const isVideo = cd.callType === 'video';
      const callIcon = isVideo ? 'videocam' : 'call';
      const arrowIcon = isMine ? 'arrow-up' : 'arrow-down';

      const mins = Math.floor((cd.duration || 0) / 60).toString().padStart(2, '0');
      const secs = ((cd.duration || 0) % 60).toString().padStart(2, '0');
      const durationStr = isCompleted && cd.duration > 0 ? `${mins}:${secs}` : null;

      const statusStr = isRejected
        ? (isMine ? 'Cancelled' : 'Missed call')
        : isCompleted
        ? (isVideo ? (isMine ? 'Outgoing video call' : 'Incoming video call') : (isMine ? 'Outgoing call' : 'Incoming call'))
        : (isVideo ? 'Video call' : 'Voice call');

      const accentColor = isRejected ? '#FF453A' : '#0084FF';
      const bgColor = isMine ? theme.sentBubble : theme.receivedBubble;
      const textColor = isMine ? theme.sentText : theme.receivedText;

      return (
        <View style={{ width: '100%' }}>
          {datePill}
          <View style={[styles.bubble, isMine ? styles.myBubbleRow : styles.theirBubbleRow]}>
            <TouchableOpacity
              onPress={() => emit('call_offer', { to: isMine ? otherUser._id : msg.sender?._id || otherUser._id, callType: cd.callType })}
              activeOpacity={0.75}
            >
              <LinearGradient
                colors={isRejected
                  ? ['rgba(255,69,58,0.18)', 'rgba(255,69,58,0.08)']
                  : ['rgba(0,132,255,0.22)', 'rgba(0,80,200,0.10)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[styles.callBubble, {
                  borderWidth: 1,
                  borderColor: isRejected ? 'rgba(255,69,58,0.25)' : 'rgba(0,132,255,0.25)',
                }]}
              >
                {/* Left: icon wrap */}
                <View style={[styles.callBubbleIconWrap, { backgroundColor: accentColor + '28' }]}>
                  <Ionicons name={callIcon} size={22} color={accentColor} />
                  <Ionicons name={arrowIcon} size={11} color={accentColor} style={{ marginTop: 2 }} />
                </View>

                {/* Middle: status + duration + time */}
                <View style={styles.callBubbleInfo}>
                  <Text style={[styles.callBubbleTitle, { color: textColor }]} numberOfLines={1}>
                    {statusStr}
                  </Text>
                  <View style={styles.callBubbleMeta}>
                    {durationStr && (
                      <>
                        <Ionicons name="time-outline" size={11} color={textColor} style={{ opacity: 0.5, marginRight: 3 }} />
                        <Text style={[styles.callBubbleDuration, { color: textColor }]}>{durationStr}</Text>
                        <Text style={[styles.callBubbleDuration, { color: textColor }]}>  ·  </Text>
                      </>
                    )}
                    <Text style={[styles.callBubbleDuration, { color: textColor }]}>
                      {formatMessageTime(msg.createdAt)}
                    </Text>
                  </View>
                </View>

                {/* Right: call button */}
                <LinearGradient
                  colors={isRejected ? ['#FF453A', '#C0392B'] : ['#0084FF', '#005FCC']}
                  style={styles.callBubbleCallBtn}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                >
                  <Ionicons name={callIcon} size={16} color="#FFF" />
                </LinearGradient>
              </LinearGradient>
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
            <View style={[styles.deletedBubble, { backgroundColor: isMine ? theme.sentBubble : theme.receivedBubble, opacity: 0.5 }]}>
              <Text style={{ color: isMine ? theme.sentText : theme.receivedText, fontStyle: 'italic', fontSize: 13, paddingRight: 6 }}>
                {"Message deleted  "}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={{ width: '100%' }}>
        {datePill}
        <TouchableOpacity
          onPress={handlePress}
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
              <View style={styles.imageBubbleContainer}>
                <View style={styles.imageGrid}>
                  {msg.images.map((img, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setImageViewerData({ uri: img.url, msg })}
                      onLongPress={() => onLongPressMessage(msg)}
                      delayLongPress={260}
                      activeOpacity={0.9}
                    >
                      <Image source={{ uri: img.url }} style={styles.messageImage} />
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
                <Text style={{ color: isMine ? theme.sentText : theme.receivedText, fontSize: 15, lineHeight: 22 }}>
                  {msg.text}
                </Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
        {renderStatusFooter(msg, isMine)}
      </View>
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
        style={styles.glassInputContainer}
      >
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
              style={[styles.sendBtn, { backgroundColor: theme.sentBubble, shadowColor: theme.sentBubble }]}
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
              <Ionicons name="camera" size={23} color={theme.sentBubble} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={pickImages}
              style={styles.iconBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="image" size={23} color={theme.sentBubble} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={startRecording}
              style={styles.iconBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="mic" size={23} color={theme.sentBubble} />
            </TouchableOpacity>
            <TextInput
              style={[
                styles.textInput,
                {
                  color: theme.inputText,
                  backgroundColor: textInputBg,
                  borderWidth: 1,
                  borderColor: textInputBorderColor,
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
              underlineColorAndroid="transparent"
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
              disabled={!text.trim() && selectedImages.length === 0}
            >
              <Ionicons name="send" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>

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
  textInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    borderRadius: 22,
    borderWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 15,
    marginLeft: 4,
    marginRight: 6,
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
    marginTop: 2,
    marginBottom: 2,
    paddingHorizontal: 2,
    backgroundColor: 'transparent',
  },
  statusFooterMine: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
    paddingRight: 4,
  },
  statusFooterTheir: {
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
    paddingLeft: 4,
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
  callBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    gap: 10,
    minWidth: 200,
  },
  callBubbleIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  callBubbleInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  callBubbleTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  callBubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  callBubbleDuration: {
    fontSize: 11,
    opacity: 0.55,
  },
  callBubbleCallBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
});
