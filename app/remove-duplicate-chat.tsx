import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export default function RemoveDuplicateChatScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [chats, setChats] = useState<any[]>([]);

  const findDuplicateChats = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Get all chats for current user
      const { data: userChats, error: chatsError } = await supabase
        .from('chats')
        .select('*')
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (chatsError) {
        console.error('Error fetching chats:', chatsError);
        return;
      }

      // For each chat, get the other participant and message count
      const chatDetails = await Promise.all(
        (userChats || []).map(async (chat) => {
          const otherUserId = chat.participant_1 === user.id ? chat.participant_2 : chat.participant_1;

          // Get other user's profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', otherUserId)
            .single();

          // Get message count for this chat
          const { count } = await supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chat.id);

          return {
            ...chat,
            otherUserName: profile?.name || 'Unknown',
            messageCount: count || 0,
          };
        })
      );

      setChats(chatDetails);
    } catch (error) {
      console.error('Error finding duplicate chats:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeChatById = async (chatId: string, chatName: string) => {
    Alert.alert(
      'Remove Chat',
      `Are you sure you want to remove the chat with ${chatName}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // First delete all messages in the chat
              const { error: messagesError } = await supabase
                .from('chat_messages')
                .delete()
                .eq('chat_id', chatId);

              if (messagesError) {
                console.error('Error deleting messages:', messagesError);
                Alert.alert('Error', 'Failed to delete chat messages');
                return;
              }

              // Then delete the chat itself
              const { error: chatError } = await supabase
                .from('chats')
                .delete()
                .eq('id', chatId);

              if (chatError) {
                console.error('Error deleting chat:', chatError);
                Alert.alert('Error', 'Failed to delete chat');
                return;
              }

              Alert.alert('Success', 'Chat removed successfully');
              findDuplicateChats(); // Refresh the list
            } catch (error) {
              console.error('Error removing chat:', error);
              Alert.alert('Error', 'Failed to remove chat');
            }
          },
        },
      ]
    );
  };

  React.useEffect(() => {
    findDuplicateChats();
  }, [user]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Remove Duplicate Chats</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          Here are all your chats. You can remove duplicate or empty chats. 
          Be careful - this action cannot be undone!
        </Text>

        {loading ? (
          <Text style={styles.loadingText}>Loading chats...</Text>
        ) : (
          chats.map((chat) => (
            <View key={chat.id} style={styles.chatItem}>
              <View style={styles.chatInfo}>
                <Text style={styles.chatName}>{chat.otherUserName}</Text>
                <Text style={styles.chatDetails}>
                  Messages: {chat.messageCount} | Created: {new Date(chat.created_at).toLocaleDateString()}
                </Text>
                <Text style={styles.chatId}>Chat ID: {chat.id}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeChatById(chat.id, chat.otherUserName)}
              >
                <Trash2 size={20} color="#F44336" />
              </TouchableOpacity>
            </View>
          ))
        )}

        <TouchableOpacity style={styles.refreshButton} onPress={findDuplicateChats}>
          <Text style={styles.refreshText}>Refresh Chat List</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eaecee',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  description: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  chatItem: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  chatInfo: {
    flex: 1,
  },
  chatName: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 4,
  },
  chatDetails: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 2,
  },
  chatId: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: '#999',
  },
  removeButton: {
    padding: 12,
    backgroundColor: '#ffebee',
    borderRadius: 8,
  },
  refreshButton: {
    backgroundColor: '#FF8C42',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  refreshText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
  },
});