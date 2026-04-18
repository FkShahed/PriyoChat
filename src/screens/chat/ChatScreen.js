import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  Image, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated as RNAnimated } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { conversationApi, mediaApi } from '../../api/services';
import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import { THEMES } from '../../themes/themes';
import { formatMessageTime, getInitials } from '../../utils/helpers';

// Typing indicator dots
function TypingIndicator({ theme }) {
  const opacities = [useRef(new RNAnimated.Value(0.2)).current, useRef(new RNAnimated.Value(0.2)).current, useRef(new RNAnimated.Value(0.2)).current];

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

export default function ChatScreen({ route, navigation }) {
  const { conversation: initialConvo, otherUser } = route.params;
  const currentUser = useAuthStore((s) => s.user);
  const { conversations, messages, setMessages, appendMessages, typingUsers, onlineUsers } = useChatStore();
  const { emit } = useSocketStore();

  const [conversationId] = useState(initialConvo._id);
  const convo = conversations.find(c => c._id === conversationId) || initialConvo;
  const theme = THEMES[convo.theme] || THEMES.ClassicBlue;
  const convoMessages = messages[conversationId] || [];

  const [text, setText] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const typingTimeout = useRef(null);
  const flatListRef = useRef(null);
  const isTyping = typingUsers[conversationId];

  // Load messages
  const loadMessages = useCallback(async (pageNum = 1, append = false) => {
    try {
      const { data } = await conversationApi.getMessages(conversationId, pageNum);
      if (append) {
        appendMessages(conversationId, data.messages);
      } else {
        setMessages(conversationId, data.messages);
      }
      setHasMore(pageNum < data.totalPages);
      setPage(pageNum);
    } catch (err) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    loadMessages(1);
    // Join the conversation room
    emit('join', { conversationId });
    // Mark as seen
    emit('message_seen', { conversationId });
    return () => {
      clearTimeout(typingTimeout.current);
    };
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (convoMessages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [convoMessages.length]);

  const handleTyping = (val) => {
    setText(val);
    if (!isTyping) emit('typing_start', { conversationId });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      emit('typing_stop', { conversationId });
    }, 1500);
  };

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5, quality: 0.8 });
    if (result.canceled || !result.assets) return;
    setSelectedImages((prev) => [...prev, ...result.assets].slice(0, 5));
  };

  const removeImage = (index) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

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
      if (response?.error) {
        Alert.alert('Error', response.error);
      } else {
        setText('');
        setSelectedImages([]);
        emit('typing_stop', { conversationId });
      }
      setSending(false);
    });
    
    setText('');
    emit('typing_stop', { conversationId });
  };

  const onLongPressMessage = (msg) => {
    if (msg.sender?._id !== currentUser?._id || msg.isDeleted) return;
    Alert.alert('Message', undefined, [
      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(msg._id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleDelete = async (msgId) => {
    try {
      await conversationApi.deleteMessage(msgId);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to delete');
    }
  };

  const renderMessage = ({ item: msg }) => {
    const isMine = msg.sender?._id === currentUser?._id || msg.sender === currentUser?._id;
    if (msg.isDeleted) {
      return (
        <View style={[styles.bubble, isMine ? styles.myBubbleRow : styles.theirBubbleRow]}>
          <View style={[styles.deletedBubble, { backgroundColor: isMine ? theme.sentBubble : theme.receivedBubble, opacity: 0.5 }]}>
            <Text style={{ color: isMine ? theme.sentText : theme.receivedText, fontStyle: 'italic', fontSize: 13 }}>
              🚫 Message deleted
            </Text>
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity
        onLongPress={() => onLongPressMessage(msg)}
        style={[styles.bubble, isMine ? styles.myBubbleRow : styles.theirBubbleRow]}
        activeOpacity={0.8}
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
          {/* Images */}
          {msg.images?.length > 0 && (
            <View style={styles.imageGrid}>
              {msg.images.map((img, i) => (
                <Image key={i} source={{ uri: img.url }} style={styles.messageImage} />
              ))}
            </View>
          )}
          {/* Text */}
          {msg.text ? (
            <View style={[styles.textBubble, { backgroundColor: isMine ? theme.sentBubble : theme.receivedBubble }]}>
              <Text style={{ color: isMine ? theme.sentText : theme.receivedText, fontSize: 15 }}>
                {msg.text}
              </Text>
              <Text style={[styles.msgTime, { color: isMine ? 'rgba(255,255,255,0.6)' : theme.timestampColor }]}>
                {formatMessageTime(msg.createdAt)}
                {isMine && (' ' + (msg.status === 'seen' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'))}
              </Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const isOtherOnline = onlineUsers[otherUser?._id] ?? otherUser?.isOnline;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <LinearGradient colors={theme.gradient} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: '#FFF', fontSize: 22 }}>‹</Text>
        </TouchableOpacity>
        {otherUser?.avatar ? (
          <Image source={{ uri: otherUser.avatar }} style={styles.headerAvatar} />
        ) : (
          <View style={[styles.headerAvatar, { backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#FFF', fontWeight: '700' }}>{getInitials(otherUser?.name)}</Text>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerName}>{otherUser?.name}</Text>
          <Text style={styles.headerStatus}>
            {isOtherOnline ? '🟢 Online' : otherUser?.status || ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Call', { otherUser, callType: 'audio' })} style={styles.callBtn}>
          <Text style={{ fontSize: 20 }}>📞</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Call', { otherUser, callType: 'video' })} style={styles.callBtn}>
          <Text style={{ fontSize: 20 }}>📹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('ThemeSelector', { conversationId, currentTheme: convo.theme })} style={styles.callBtn}>
          <Text style={{ fontSize: 20 }}>🎨</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Messages */}
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.sentBubble} size="large" />
      ) : (
        <FlatList
          ref={flatListRef}
          data={convoMessages}
          keyExtractor={(item) => item._id}
          renderItem={renderMessage}
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 8 }}
          onEndReached={() => hasMore && loadMessages(page + 1, true)}
          onEndReachedThreshold={0.3}
          ListFooterComponent={isTyping ? <TypingIndicator theme={theme} /> : null}
        />
      )}

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {selectedImages.length > 0 && (
          <View style={[styles.imagePreviewContainer, { backgroundColor: theme.inputBg }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {selectedImages.map((img, idx) => (
                <View key={idx} style={styles.previewImageWrapper}>
                  <Image source={{ uri: img.uri }} style={styles.previewImage} />
                  <TouchableOpacity style={styles.removeImageBtn} onPress={() => removeImage(idx)}>
                    <Text style={styles.removeImageText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
        <View style={[styles.inputRow, { backgroundColor: theme.inputBg }]}>
          <TouchableOpacity onPress={pickImages} style={styles.attachBtn} disabled={uploading || sending}>
            <Text style={{ fontSize: 22 }}>📎</Text>
          </TouchableOpacity>
          <TextInput
            style={[styles.textInput, { color: theme.inputText, backgroundColor: theme.background }]}
            value={text}
            onChangeText={handleTyping}
            placeholder="Message..."
            placeholderTextColor={theme.placeholderText}
            multiline
            maxLength={5000}
          />
          <TouchableOpacity
            onPress={sendMessage}
            style={[styles.sendBtn, { backgroundColor: theme.sentBubble, opacity: (!text.trim() && selectedImages.length === 0) ? 0.5 : 1 }]}
            disabled={sending || uploading || (!text.trim() && selectedImages.length === 0)}
          >
            {uploading || sending ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={{ color: '#FFF', fontSize: 18 }}>➤</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 48, paddingBottom: 12,
    paddingHorizontal: 12,
  },
  backBtn: { padding: 4, marginRight: 4 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerName: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  headerStatus: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  callBtn: { padding: 8 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 8,
    borderTopWidth: 0.5, borderTopColor: '#EEEEEE',
  },
  attachBtn: { padding: 8, justifyContent: 'center' },
  imagePreviewContainer: { padding: 8, borderTopWidth: 0.5, borderTopColor: '#EEEEEE' },
  previewImageWrapper: { marginRight: 8, position: 'relative', marginTop: 6 },
  previewImage: { width: 60, height: 60, borderRadius: 8 },
  removeImageBtn: { position: 'absolute', top: -6, right: -6, backgroundColor: '#FF3B30', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF' },
  removeImageText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', lineHeight: 14 },
  textInput: {
    flex: 1, maxHeight: 120, minHeight: 40, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    marginHorizontal: 8,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: { marginVertical: 3, maxWidth: '80%' },
  myBubbleRow: { alignSelf: 'flex-end', marginRight: 8 },
  theirBubbleRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'flex-end', marginLeft: 4 },
  bubbleContent: { flexShrink: 1 },
  textBubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' },
  deletedBubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  msgTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  senderAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 6 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  messageImage: { width: 150, height: 150, borderRadius: 12 },
  typingWrapper: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 18, alignSelf: 'flex-start', marginLeft: 12, marginBottom: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
