import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { uploadCompressedImage } from '@/lib/imageUpload';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { fetchPlanGroupChatMessages, type PlanGroupChatPoll } from '@/lib/planGroupChatPolls';
import {
  getPlanGroupChatReadReceipt,
  getPlanGroupChatReadReceiptDetails,
  type PlanGroupChatReadReceipt,
  type PlanGroupChatReadReceiptDetails,
} from '@/lib/planGroupChatReadReceipts';

/**
 * Plan-scoped group chat: one chat per plan. Membership is derived live from
 * `plan_joins` via RLS, so anyone who joins/gets approved after the chat is
 * created automatically gains access. Chats are hidden after `expires_at`
 * (end of plan's local day) — RLS blocks access, and the chat disappears
 * from the user's chat list at the same time.
 *
 * `chatId` here refers to a row in `plan_group_chats.id`.
 */

export type PlanGroupChatMessageKind = 'text' | 'poll';

export interface PlanGroupChatMessage {
  id: string;
  chat_id: string;
  user_id: string;
  message: string;
  message_kind: PlanGroupChatMessageKind;
  image_urls: string[];
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  plan_group_chat_polls?: PlanGroupChatPoll | PlanGroupChatPoll[] | null;
}

export interface PlanGroupChatMeta {
  id: string;
  plan_id: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  plan_title?: string;
  event_date?: string;
  creator_id?: string;
}

export interface PlanGroupChatMember {
  id: string;
  name: string;
  avatar_url: string | null;
}

async function uploadGroupChatImage(uri: string): Promise<string | null> {
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  return uploadCompressedImage(uri, {
    bucket: 'chat-images',
    path: fileName,
    preset: 'chat',
  });
}

/**
 * Hook for a single group chat: fetch metadata + messages, send/edit/delete,
 * mark-as-read. Real-time updates come from `plan_group_chat_messages` events.
 */
export function usePlanGroupChat(chatId: string | null) {
  const { user } = useAuth();
  const [meta, setMeta] = useState<PlanGroupChatMeta | null>(null);
  const [messages, setMessages] = useState<PlanGroupChatMessage[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberNamesById, setMemberNamesById] = useState<Map<string, string>>(new Map());
  const [readsByUserId, setReadsByUserId] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentChatIdRef = useRef<string | null>(null);
  const planIdRef = useRef<string | null>(null);
  const pollsSchemaRef = useRef(false);

  const fetchMeta = useCallback(async (id: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from('plan_group_chats')
      .select('id, plan_id, created_by, created_at, expires_at, activity_plans!plan_group_chats_plan_id_fkey(title, event_date, creator_id)')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('Error fetching group chat meta:', error);
      return null;
    }
    if (!data) return null;
    const plan = Array.isArray(data.activity_plans) ? data.activity_plans[0] : data.activity_plans;
    setMeta({
      id: data.id,
      plan_id: data.plan_id,
      created_by: data.created_by,
      created_at: data.created_at,
      expires_at: data.expires_at,
      plan_title: plan?.title ?? '',
      event_date: plan?.event_date ?? undefined,
      creator_id: plan?.creator_id ?? undefined,
    });
    return data.plan_id;
  }, []);

  const fetchMemberReads = useCallback(async (id: string, planId: string) => {
    const [{ data: joins, error: joinsError }, { data: reads, error: readsError }] = await Promise.all([
      supabase.from('plan_joins').select('user_id').eq('plan_id', planId),
      supabase.from('plan_group_chat_reads').select('user_id, last_read_at').eq('chat_id', id),
    ]);
    if (currentChatIdRef.current !== id) return;
    if (joinsError) {
      console.error('Error fetching plan group chat members for read receipts:', joinsError);
    }
    if (readsError) {
      console.error('Error fetching plan group chat read state:', readsError);
    }
    setMemberIds(Array.from(new Set((joins ?? []).map((j) => j.user_id).filter(Boolean))));
    setReadsByUserId(new Map((reads ?? []).map((r) => [r.user_id, r.last_read_at])));

    const userIds = Array.from(new Set((joins ?? []).map((j) => j.user_id).filter(Boolean)));
    if (userIds.length === 0) {
      setMemberNamesById(new Map());
      return;
    }
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', userIds);
    if (profilesError) {
      console.error('Error fetching plan group chat member names:', profilesError);
      return;
    }
    setMemberNamesById(new Map((profiles ?? []).map((p) => [p.id, p.name || 'Member'])));
  }, []);

  const fetchMessages = useCallback(async (id: string) => {
    const { data, error, pollsEnabled } = await fetchPlanGroupChatMessages(id);
    if (currentChatIdRef.current !== id) return;
    pollsSchemaRef.current = pollsEnabled;
    if (error) {
      console.error('Error fetching group chat messages:', error);
      setError('Failed to load messages');
      setMessages([]);
      return;
    }
    setMessages(
      (data ?? []).map((m: any) => ({
        ...m,
        message_kind: m.message_kind === 'poll' ? 'poll' : 'text',
        image_urls: Array.isArray(m.image_urls) ? m.image_urls : [],
      }))
    );
    setError(null);
  }, []);

  useEffect(() => {
    if (!chatId) {
      currentChatIdRef.current = null;
      setMeta(null);
      setMessages([]);
      setMemberIds([]);
      setMemberNamesById(new Map());
      setReadsByUserId(new Map());
      setLoading(false);
      return;
    }
    currentChatIdRef.current = chatId;
    setLoading(true);
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const [, planId] = await Promise.all([fetchMessages(chatId), fetchMeta(chatId)]);
      if (currentChatIdRef.current !== chatId) return;
      planIdRef.current = planId;
      setLoading(false);
      if (planId) {
        void fetchMemberReads(chatId, planId);
      }

      channel = supabase.channel(`plan_group_chat_${chatId}`);
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'plan_group_chat_messages', filter: `chat_id=eq.${chatId}` },
        () => fetchMessages(chatId)
      );
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'plan_group_chat_messages', filter: `chat_id=eq.${chatId}` },
        () => fetchMessages(chatId)
      );
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plan_group_chat_reads', filter: `chat_id=eq.${chatId}` },
        () => {
          const pid = planIdRef.current;
          if (pid) void fetchMemberReads(chatId, pid);
        }
      );
      if (pollsSchemaRef.current) {
        channel.on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'plan_group_chat_poll_options' },
          () => fetchMessages(chatId)
        );
      }
      channel.subscribe();
    })();

    return () => {
      try {
        if (channel) supabase.removeChannel(channel);
      } catch {}
    };
  }, [chatId, fetchMeta, fetchMessages, fetchMemberReads]);

  const sendMessage = useCallback(
    async (text: string, imageUris: string[] = []): Promise<boolean> => {
      if (!chatId || !user) return false;
      if (!text.trim() && imageUris.length === 0) return false;
      try {
        let uploadedUrls: string[] = [];
        if (imageUris.length > 0) {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission required', 'Photo library access is needed to send images.');
            return false;
          }
          // Upload sequentially to avoid concurrent ImageManipulator + ArrayBuffer
          // memory pressure freezing the send on mobile with multiple images.
          for (const u of imageUris) {
            const url = await uploadGroupChatImage(u);
            if (url) uploadedUrls.push(url);
          }
        }
        const { error } = await supabase.from('plan_group_chat_messages').insert({
          chat_id: chatId,
          user_id: user.id,
          message: text.trim(),
          image_urls: uploadedUrls,
        });
        if (error) {
          console.error('Send group chat message error:', error);
          return false;
        }
        await fetchMessages(chatId);
        return true;
      } catch (e) {
        console.error('Send group chat message failed:', e);
        return false;
      }
    },
    [chatId, user, fetchMessages]
  );

  const updateMessage = useCallback(
    async (messageId: string, newText: string): Promise<boolean> => {
      if (!chatId || !user) return false;
      const trimmed = newText.trim();
      if (!trimmed || trimmed.length > 1000) return false;
      const { error } = await supabase
        .from('plan_group_chat_messages')
        .update({ message: trimmed, edited_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('user_id', user.id)
        .eq('chat_id', chatId);
      if (error) {
        console.error('Edit group chat message error:', error);
        return false;
      }
      await fetchMessages(chatId);
      return true;
    },
    [chatId, user, fetchMessages]
  );

  const deleteMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!chatId || !user) return false;
      const { error } = await supabase
        .from('plan_group_chat_messages')
        .update({ message: '', deleted_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('user_id', user.id)
        .eq('chat_id', chatId);
      if (error) {
        console.error('Delete group chat message error:', error);
        return false;
      }
      await fetchMessages(chatId);
      return true;
    },
    [chatId, user, fetchMessages]
  );

  const markAsRead = useCallback(async () => {
    if (!chatId || !user) return;
    const now = new Date().toISOString();
    await supabase
      .from('plan_group_chat_reads')
      .upsert(
        { chat_id: chatId, user_id: user.id, last_read_at: now },
        { onConflict: 'chat_id,user_id' }
      );
    setReadsByUserId((prev) => {
      const next = new Map(prev);
      next.set(user.id, now);
      return next;
    });
  }, [chatId, user]);

  const getReadReceipt = useCallback(
    (message: PlanGroupChatMessage): PlanGroupChatReadReceipt | null => {
      if (!user?.id) return null;
      return getPlanGroupChatReadReceipt(message, user.id, memberIds, readsByUserId);
    },
    [user?.id, memberIds, readsByUserId]
  );

  const getReadReceiptDetails = useCallback(
    (message: PlanGroupChatMessage): PlanGroupChatReadReceiptDetails | null => {
      if (!user?.id) return null;
      return getPlanGroupChatReadReceiptDetails(
        message,
        user.id,
        memberIds,
        readsByUserId,
        memberNamesById
      );
    },
    [user?.id, memberIds, readsByUserId, memberNamesById]
  );

  const refetch = useCallback(
    () => (chatId ? fetchMessages(chatId) : Promise.resolve()),
    [chatId, fetchMessages]
  );

  return {
    meta,
    messages,
    loading,
    error,
    sendMessage,
    updateMessage,
    deleteMessage,
    markAsRead,
    getReadReceipt,
    getReadReceiptDetails,
    refetch,
  };
}

/**
 * Starts a group chat for a plan. Any current plan member may call this (RLS enforces it).
 * Returns the new chat id on success.
 */
export async function startPlanGroupChat(planId: string, userId: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('plan_group_chats')
    .insert({ plan_id: planId, created_by: userId })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') {
      // unique_violation: chat already exists for this plan — fetch it
      const { data: existing } = await supabase
        .from('plan_group_chats')
        .select('id')
        .eq('plan_id', planId)
        .maybeSingle();
      if (existing?.id) return { id: existing.id };
    }
    console.error('Start plan group chat error:', error);
    return { error: error.message };
  }
  return { id: data.id };
}

/** Everyone currently joined on the plan (same membership as chat access via RLS). */
export async function fetchPlanGroupChatMembers(planId: string): Promise<PlanGroupChatMember[]> {
  const { data: joins, error: joinsError } = await supabase
    .from('plan_joins')
    .select('user_id')
    .eq('plan_id', planId);
  if (joinsError) {
    console.error('Error loading plan group chat members:', joinsError);
    return [];
  }
  const userIds = Array.from(new Set((joins ?? []).map((j) => j.user_id).filter(Boolean)));
  if (userIds.length === 0) return [];

  const { data: profileRows, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', userIds);
  if (profilesError) {
    console.error('Error loading plan group chat member profiles:', profilesError);
    return [];
  }

  const byId = new Map((profileRows ?? []).map((p) => [p.id, p]));
  return userIds
    .map((uid) => byId.get(uid))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ id: p.id, name: p.name || 'Member', avatar_url: p.avatar_url ?? null }));
}

/** Look up an existing chat for a plan (or null). */
export async function getPlanGroupChatId(planId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('plan_group_chats')
    .select('id, expires_at')
    .eq('plan_id', planId)
    .maybeSingle();
  if (error || !data) return null;
  // Client-side guard in addition to RLS — if it's expired, treat as gone.
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data.id;
}
