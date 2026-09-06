import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import type { ForumMessage } from '@/types/database'
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker'
import {
  buildMentionLookup,
  resolveMentionUserIds,
  type MentionLookupEntry,
} from '@/lib/forumMentions'
import { isForumOpenTextPollSchemaMissing } from '@/lib/forumPolls'
import { createSessionCache } from '@/lib/sessionCache'
import { uploadCompressedImage } from '@/lib/imageUpload'
import { DEFAULT_FETCH_THROTTLE_MS, isFetchThrottled, markFetchCompleted } from '@/lib/fetchThrottle'

const messagesCache = createSessionCache<ForumMessage[]>()

const FORUM_MESSAGES_SELECT_WITH_OPEN_POLLS = `
  *,
  reply_to:forum_messages!reply_to_id (
    id,
    message,
    image_urls,
    profiles!user_id ( name )
  ),
  profiles ( name, avatar_url ),
  forum_polls (
    id,
    activity_id,
    message_id,
    question,
    allow_multiple_selection,
    poll_style,
    response_count,
    created_by,
    forum_poll_options (
      id,
      option_text,
      sort_order,
      vote_count
    )
  )
`

const FORUM_MESSAGES_SELECT_BASIC_POLLS = `
  *,
  reply_to:forum_messages!reply_to_id (
    id,
    message,
    image_urls,
    profiles!user_id ( name )
  ),
  profiles ( name, avatar_url ),
  forum_polls (
    id,
    activity_id,
    message_id,
    question,
    allow_multiple_selection,
    created_by,
    forum_poll_options (
      id,
      option_text,
      sort_order,
      vote_count
    )
  )
`

async function attachForumAuthorSkills(
  rows: ForumMessage[],
  activityId: string,
): Promise<ForumMessage[]> {
  const userIds = [...new Set(rows.map((m) => m.user_id).filter(Boolean))] as string[];
  if (userIds.length === 0) return rows;

  const { data: skills } = await supabase
    .from('user_activity_skills')
    .select('user_id, skill_level, activity_id')
    .in('user_id', userIds)
    .eq('activity_id', activityId);

  const skillByUser = new Map((skills ?? []).map((s) => [s.user_id, s]));

  return rows.map((message) => {
    const skill = skillByUser.get(message.user_id);
    if (!skill || !message.profiles) return message;
    const profile =
      typeof message.profiles === 'object' && !Array.isArray(message.profiles)
        ? message.profiles
        : null;
    if (!profile) return message;
    return {
      ...message,
      profiles: {
        ...profile,
        user_activity_skills: [skill],
      },
    };
  });
}

export function useForumMessages(activityId?: string) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ForumMessage[]>([])
  const [loading, setLoading] = useState(false)
  const currentActivityIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!activityId) {
      setMessages([])
      setLoading(false)
      currentActivityIdRef.current = undefined
      return
    }

    /** Scoped id for this subscription + fetches so realtime never uses a stale closure. */
    const scopedId = activityId
    currentActivityIdRef.current = scopedId

    const cached = messagesCache.get(scopedId)
    if (cached) {
      setMessages(cached)
      setLoading(false)
    } else {
      setMessages([])
      setLoading(true)
    }

    const subscription = supabase
      .channel(`forum_messages_${scopedId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'forum_messages',
          filter: `activity_id=eq.${scopedId}`,
        },
        () => fetchMessages(false, scopedId, { force: true })
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'forum_messages',
          filter: `activity_id=eq.${scopedId}`,
        },
        () => fetchMessages(false, scopedId, { force: true })
      )
      .subscribe()

    fetchMessages(false, scopedId, { force: !messagesCache.isFresh(scopedId) })

    return () => {
      supabase.removeChannel(subscription)
      // Don't wipe ref if a newer activity effect already claimed it (e.g. rapid switches).
      if (currentActivityIdRef.current === scopedId) {
        currentActivityIdRef.current = undefined
      }
    }
  }, [activityId])

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

  const fetchMessages = async (
    _showLoading = false,
    targetActivityId?: string,
    options?: { force?: boolean }
  ) => {
    const forActivityId = targetActivityId ?? activityId
    if (!forActivityId) return

    const throttleKey = `forum-messages:${forActivityId}`
    if (isFetchThrottled(throttleKey, DEFAULT_FETCH_THROTTLE_MS, options?.force)) {
      if (currentActivityIdRef.current === forActivityId) {
        setLoading(false)
      }
      return
    }

    try {
      let result = await supabase
        .from('forum_messages')
        .select(FORUM_MESSAGES_SELECT_WITH_OPEN_POLLS)
        .eq('activity_id', forActivityId)
        .order('created_at', { ascending: false })
        .limit(30)

      if (result.error && isForumOpenTextPollSchemaMissing(result.error)) {
        result = await supabase
          .from('forum_messages')
          .select(FORUM_MESSAGES_SELECT_BASIC_POLLS)
          .eq('activity_id', forActivityId)
          .order('created_at', { ascending: false })
          .limit(30)
      }

      const { data, error } = result

      if (currentActivityIdRef.current !== forActivityId) return

      if (error) {
        console.error('Error fetching forum messages:', error)
      } else {
        const rows = await attachForumAuthorSkills((data || []) as ForumMessage[], forActivityId)
        messagesCache.set(forActivityId, rows)
        markFetchCompleted(throttleKey)
        setMessages(rows)
      }
    } catch (error) {
      if (currentActivityIdRef.current !== forActivityId) return
      console.error('Error fetching messages:', error)
    } finally {
      if (currentActivityIdRef.current === forActivityId) {
        setLoading(false)
      }
    }
  }

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

  // Updated sendMessage to accept images
  const sendMessage = async (
    message: string,
    replyToId?: string,
    imageUris: string[] = [],
    mentionEntries: MentionLookupEntry[] = []
  ) => {
    const sendForActivityId = activityId
    if (!sendForActivityId || !user) return false
    if (!message.trim() && imageUris.length === 0) return false

    if (message.trim().length > 1000) {
      Alert.alert('Message too long')
      return false
    }

    try {
      // 1. Upload Images
      const uploadPromises = imageUris.map(uri => uploadImage(uri))
      const uploadedUrls = await Promise.all(uploadPromises)
      const validUrls = uploadedUrls.filter(url => url !== null) as string[]

      const payload = {
        activity_id: sendForActivityId,
        user_id: user.id,
        message: message.trim(),
        reply_to_id: replyToId || null,
        image_urls: validUrls,
      }

      const insertOnce = async () =>
        supabase
          .from('forum_messages')
          .insert(payload)
          .select('id')
          .single()

      // 2. Insert Message (with one retry on transient upstream/network failures)
      let { data: inserted, error } = await insertOnce()
      const errorText = JSON.stringify(error || {})
      const shouldRetry =
        !!error &&
        (
          errorText.includes('upstream connect error') ||
          errorText.includes('connection timeout') ||
          errorText.includes('fetch failed') ||
          errorText.includes('network')
        )

      if (shouldRetry) {
        await new Promise((resolve) => setTimeout(resolve, 350))
        const retry = await insertOnce()
        inserted = retry.data
        error = retry.error
      }

      if (error) throw error

      const trimmed = message.trim()
      if (inserted?.id && trimmed) {
        const lookup = buildMentionLookup(mentionEntries)
        const mentionedIds = resolveMentionUserIds(trimmed, lookup)
        if (mentionedIds.length > 0) {
          const { error: notifyError } = await supabase.rpc(
            'create_forum_mention_notifications',
            {
              p_message_id: inserted.id,
              p_mentioned_user_ids: mentionedIds,
            }
          )
          if (notifyError) {
            console.error('Mention notification error:', notifyError)
          }
        }
      }

      fetchMessages(false, sendForActivityId, { force: true })
      return true
    } catch (error) {
      console.error('Error sending message:', error)
      return false
    }
  }

  const updateMessage = useCallback(
    async (messageId: string, newText: string) => {
      if (!user?.id) return false
      const trimmed = newText.trim()
      if (!trimmed || trimmed.length > 1000) return false
      try {
        const { error } = await supabase
          .from('forum_messages')
          .update({
            message: trimmed,
            edited_at: new Date().toISOString(),
          })
          .eq('id', messageId)
          .eq('user_id', user.id)
        if (error) throw error
        const id = activityId
        if (id) await fetchMessages(false, id, { force: true })
        return true
      } catch (e) {
        console.error('Error updating forum message:', e)
        return false
      }
    },
    [user?.id, activityId]
  )

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!user?.id) return false
      try {
        const { error } = await supabase
          .from('forum_messages')
          .update({
            message: '',
            deleted_at: new Date().toISOString(),
          })
          .eq('id', messageId)
          .eq('user_id', user.id)
        if (error) throw error
        const id = activityId
        if (id) await fetchMessages(false, id, { force: true })
        return true
      } catch (e) {
        console.error('Error deleting forum message:', e)
        return false
      }
    },
    [user?.id, activityId]
  )

  const refetch = useCallback(() => {
    const id = activityId
    if (id) void fetchMessages(false, id, { force: true })
  }, [activityId])

  return {
    messages,
    loading,
    sendMessage,
    updateMessage,
    deleteMessage,
    refetch,
  }
}
