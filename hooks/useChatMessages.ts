import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import * as ImagePicker from 'expo-image-picker'
import { Alert } from 'react-native'
import type { ChatMessage } from '@/types/database'
import { CHAT_MESSAGES_INITIAL_LIMIT } from '@/lib/chatListScroll'
import { createSessionCache } from '@/lib/sessionCache'
import { uploadCompressedImage } from '@/lib/imageUpload'

const dmMessagesCache = createSessionCache<ChatMessage[]>()

export function useChatMessages(chatId: string | null) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (chatId) {
      const cached = dmMessagesCache.get(chatId)
      if (cached?.length) {
        setMessages(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }
      setError(null)
      fetchMessages()
      
      // Set up real-time subscription for new messages
      const subscription = supabase
        .channel(`chat_messages_${chatId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `chat_id=eq.${chatId}`,
          },
          () => {
            fetchMessages()
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'chat_messages',
            filter: `chat_id=eq.${chatId}`,
          },
          () => {
            fetchMessages()
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to chat messages')
            setError(null) // Clear any previous errors
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('Realtime subscription issue:', status)
            // Don't set error - messages will still load via polling
            // Real-time is a nice-to-have, not critical
          }
        })

      return () => {
        try {
          subscription.unsubscribe()
        } catch (error) {
          console.error('Error unsubscribing from chat messages:', error)
        }
      }
    } else {
      setMessages([])
      setLoading(false)
      setError(null)
    }
  }, [chatId])

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need photo gallery permissions to send photo.'
      );
      return false;
    }
    return true;
  };

  const uploadImage = async (uri: string) => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return null;

    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    return uploadCompressedImage(uri, {
      bucket: 'chat-images',
      path: fileName,
      preset: 'chat',
    });
  }

  const fetchMessages = useCallback(async () => {
    if (!chatId) return

    // setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(CHAT_MESSAGES_INITIAL_LIMIT)

      if (error) {
        console.error('Error fetching chat messages:', error)
        setError('Failed to load messages')
        setMessages([])
      } else {
        const rows = [...(data || [])].reverse()
        setMessages(rows)
        dmMessagesCache.set(chatId, rows)
        setError(null) // Clear any errors when messages load successfully
      }
    } catch (error) {
      console.error('Error fetching chat messages:', error)
      setError('Network error - please check your connection')
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [chatId])

  const sendMessage = async (
    message: string,
    imageUris: string[] = [],
    overrideChatId?: string
  ): Promise<boolean> => {
    const targetChatId = overrideChatId ?? chatId;
    if (!targetChatId || !user || (!message.trim() && imageUris.length === 0)) {
      return false
    }

    try {
      // Upload images sequentially to avoid memory pressure from concurrent
      // ImageManipulator + ArrayBuffer operations on mobile.
      const validUrls: string[] = [];
      for (const uri of imageUris) {
        const url = await uploadImage(uri);
        if (url) validUrls.push(url);
      }

      const { error } = await supabase
        .from('chat_messages')
        .insert({
          chat_id: targetChatId,
          sender_id: user.id,
          message: message.trim(),
          image_urls: validUrls // Save the array here
        })

      if (error) throw error

      await supabase
        .from('chats')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', targetChatId)

      if (targetChatId === chatId) {
        fetchMessages()
      }
      return true
    } catch (error) {
      console.error('Error sending message:', error)
      setError('Network error')
      return false
    }
  }

  const updateMessage = useCallback(
    async (messageId: string, newText: string) => {
      if (!user?.id || !chatId) return false
      const trimmed = newText.trim()
      if (!trimmed || trimmed.length > 1000) return false
      try {
        const { error } = await supabase
          .from('chat_messages')
          .update({
            message: trimmed,
            edited_at: new Date().toISOString(),
          })
          .eq('id', messageId)
          .eq('sender_id', user.id)
          .eq('chat_id', chatId)
        if (error) throw error
        await fetchMessages()
        return true
      } catch (e) {
        console.error('Error updating chat message:', e)
        return false
      }
    },
    [user?.id, chatId]
  )

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!user?.id || !chatId) return false
      try {
        const { error } = await supabase
          .from('chat_messages')
          .update({
            message: '',
            deleted_at: new Date().toISOString(),
          })
          .eq('id', messageId)
          .eq('sender_id', user.id)
          .eq('chat_id', chatId)
        if (error) throw error
        await fetchMessages()
        return true
      } catch (e) {
        console.error('Error deleting chat message:', e)
        return false
      }
    },
    [user?.id, chatId]
  )

  return { messages, loading, error, sendMessage, updateMessage, deleteMessage, refetch: fetchMessages }
}