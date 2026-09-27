import React, { useState } from 'react';
import {
  View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useChatStore from '../../store/useChatStore';
import { useColors } from '../../store/useThemeStore';

export default function SearchChatScreen({ route, navigation }) {
  const { conversationId } = route.params;
  const messages = useChatStore(s => s.messages[conversationId] || []);
  const [query, setQuery] = useState('');
  const C = useColors();

  const filteredMessages = query.trim()
    ? messages.filter(m => !m.isDeleted && m.text && m.text.toLowerCase().includes(query.toLowerCase()))
    : [];

  const renderItem = ({ item }) => {
    return (
      <View style={[styles.messageItem, { borderBottomColor: C.border }]}>
        <Text style={[styles.messageDate, { color: C.textSecondary }]}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>
        <Text style={[styles.messageText, { color: C.text }]}>{item.text}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: C.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={['#0084FF', '#0060CC']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Search Chat</Text>
      </LinearGradient>

      <View style={[styles.searchContainer, { backgroundColor: C.surface }]}>
        <Ionicons name="search" size={20} color={C.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: C.text }]}
          placeholder="Search messages..."
          placeholderTextColor={C.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={20} color={C.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredMessages}
        keyExtractor={item => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: C.textSecondary }]}>
              {query.trim() ? "No messages found." : "Type to search messages."}
            </Text>
          </View>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backBtn: {
    marginRight: 16,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  listContent: {
    paddingBottom: 20,
  },
  messageItem: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  messageDate: {
    fontSize: 12,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
  }
});
