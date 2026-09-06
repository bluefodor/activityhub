import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/store/useChatStore';
import { useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';

export function useChats() {
  const { user } = useAuth();
  const { chats, loading, fetchChats, markAsRead, setActiveChat, subscribeToChanges, unsubscribe } = useChatStore();

  useEffect(() => {
    if (user?.id) {
      fetchChats(user.id);
      subscribeToChanges(user.id);
    }

    return () => {
      // unsubscribe(); 
    };
  }, [user?.id]);

  const refetch = useCallback(() => {
    if (user?.id) fetchChats(user.id);
  }, [user?.id, fetchChats]);

  return {
    chats,
    loading,
    refetch,
    markAsRead: (chatId: string) => user?.id && markAsRead(chatId, user.id),
    setActiveChat: (chatId: string | null) => setActiveChat(chatId),
  };
}

// Look up an existing 1:1 chat without creating one.
export async function findExistingChatId(
  currentUserId: string,
  otherUserId: string
): Promise<string | null> {
  try {
    const { data: blockedCheck } = await supabase
      .from('blocked_users')
      .select('id')
      .or(
        `and(user_id.eq.${currentUserId},blocked_user_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},blocked_user_id.eq.${currentUserId})`
      )
      .limit(1);

    if (blockedCheck && blockedCheck.length > 0) {
      return null;
    }

    const { data: existingChats, error: searchError } = await supabase
      .from('chats')
      .select('id')
      .or(
        `and(participant_1.eq.${currentUserId},participant_2.eq.${otherUserId}),and(participant_1.eq.${otherUserId},participant_2.eq.${currentUserId})`
      )
      .limit(1);

    if (searchError) {
      console.error('Error searching for chat:', searchError);
      return null;
    }

    return existingChats?.[0]?.id ?? null;
  } catch (error) {
    console.error('Error in findExistingChatId:', error);
    return null;
  }
}

// Simple function to get or create a chat - exported separately
export async function getOrCreateChat(currentUserId: string, otherUserId: string): Promise<string | null> {
  try {
    const existingId = await findExistingChatId(currentUserId, otherUserId);
    if (existingId) return existingId;

    // Step 2: Create new chat
    const { data: newChat, error: createError } = await supabase
      .from('chats')
      .insert({
        participant_1: currentUserId,
        participant_2: otherUserId,
      })
      .select('id')
      .single()

    if (createError) {
      console.error('Error creating chat:', createError)
      return null
    }

    return newChat?.id || null
  } catch (error) {
    console.error('Error in getOrCreateChat:', error)
    return null
  }
}