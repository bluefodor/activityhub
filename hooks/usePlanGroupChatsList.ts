import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isPlanGroupChatPollSchemaMissing } from '@/lib/planGroupChatPolls';
import { useAuth } from './useAuth';
import { countUnreadByChat, firstRowByKey } from '@/lib/chatPreviewUtils';

/**
 * Lightweight list of plan group chats the current user has access to,
 * for display in the Chats tab alongside 1:1 chats.
 *
 * RLS already filters out expired chats and ones the user isn't joined to,
 * so the client fetch is intentionally simple.
 */

export interface PlanGroupChatPreview {
  id: string;
  planId: string;
  planTitle: string;
  /** Plan calendar day (YYYY-MM-DD); used for "Expires end of day" label. */
  eventDate: string;
  expiresAt: Date;
  createdAt: Date;
  lastMessage: string;
  lastMessageAt: Date | null;
  unreadCount: number;
}

const FETCH_THROTTLE_MS = 1500;

function isTransientNetworkError(error: unknown): boolean {
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';
  return (
    message.includes('Network request failed') ||
    message.includes('Failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('connection timeout') ||
    message.includes('upstream connect error') ||
    message.includes('disconnect/reset')
  );
}

export function usePlanGroupChatsList() {
  const { user } = useAuth();
  const [chats, setChats] = useState<PlanGroupChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchInFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const initializedRef = useRef(false);

  const fetchList = useCallback(async (options?: { force?: boolean }) => {
    if (!user?.id) {
      setChats([]);
      setLoading(false);
      initializedRef.current = false;
      return;
    }

    const now = Date.now();
    if (
      !options?.force &&
      (fetchInFlightRef.current || now - lastFetchAtRef.current < FETCH_THROTTLE_MS)
    ) {
      return;
    }

    fetchInFlightRef.current = true;
    lastFetchAtRef.current = now;
    if (!initializedRef.current) setLoading(true);

    try {
      const { data: rows, error } = await supabase
        .from('plan_group_chats')
        .select(`
          id,
          plan_id,
          created_at,
          expires_at,
          activity_plans!plan_group_chats_plan_id_fkey ( title, event_date )
        `);
      if (error) {
        if (isTransientNetworkError(error)) {
          console.warn('Plan group chats list: network error, keeping previous list.');
        } else {
          console.error('Error fetching plan group chats list:', error);
        }
        return;
      }
      const ids = (rows ?? []).map((r: any) => r.id);
      if (ids.length === 0) {
        setChats([]);
        initializedRef.current = true;
        return;
      }

      const previewLimit = Math.max(ids.length * 2, 20);

      let lastMsgsRes = await supabase
        .from('plan_group_chat_messages')
        .select(`
          chat_id,
          message,
          message_kind,
          image_urls,
          created_at,
          plan_group_chat_polls ( question )
        `)
        .in('chat_id', ids)
        .order('created_at', { ascending: false })
        .limit(previewLimit);

      if (lastMsgsRes.error && isPlanGroupChatPollSchemaMissing(lastMsgsRes.error)) {
        lastMsgsRes = await supabase
          .from('plan_group_chat_messages')
          .select('chat_id, message, image_urls, created_at')
          .in('chat_id', ids)
          .order('created_at', { ascending: false })
          .limit(previewLimit);
      }

      if (lastMsgsRes.error) {
        if (isTransientNetworkError(lastMsgsRes.error)) {
          console.warn('Plan group chats list: network error loading previews, keeping previous list.');
        } else {
          console.error('Error fetching plan group chat previews:', lastMsgsRes.error);
        }
        return;
      }

      const [{ data: lastMsgs }, { data: reads, error: readsError }, { data: unreadCandidates }] =
        await Promise.all([
        Promise.resolve({ data: lastMsgsRes.data }),
        supabase
          .from('plan_group_chat_reads')
          .select('chat_id, last_read_at')
          .eq('user_id', user.id)
          .in('chat_id', ids),
        supabase
          .from('plan_group_chat_messages')
          .select('chat_id, created_at, user_id')
          .in('chat_id', ids)
          .neq('user_id', user.id),
      ]);

      if (readsError) {
        if (isTransientNetworkError(readsError)) {
          console.warn('Plan group chats list: network error loading read state, keeping previous list.');
        } else {
          console.error('Error fetching plan group chat read state:', readsError);
        }
        return;
      }

      const lastByChat = firstRowByKey(lastMsgs ?? [], 'chat_id');
      const readByChat = new Map<string, string>();
      (reads ?? []).forEach((r: any) => readByChat.set(r.chat_id, r.last_read_at));
      const unreadByChat = countUnreadByChat(
        unreadCandidates ?? [],
        ids,
        user.id,
        readByChat,
        'user_id',
      );

      const previews: PlanGroupChatPreview[] = (rows ?? []).map((row: any) => {
          const last = lastByChat.get(row.id);
          const plan = Array.isArray(row.activity_plans) ? row.activity_plans[0] : row.activity_plans;
          return {
            id: row.id,
            planId: row.plan_id,
            planTitle: plan?.title ?? 'Plan',
            eventDate: plan?.event_date ?? '',
            expiresAt: new Date(row.expires_at),
            createdAt: new Date(row.created_at),
            lastMessage: (() => {
              if (!last) return 'New group chat';
              if (last.image_urls && Array.isArray(last.image_urls) && last.image_urls.length > 0) {
                return '📷 Photo';
              }
              if (last.message_kind === 'poll') {
                const poll = Array.isArray(last.plan_group_chat_polls)
                  ? last.plan_group_chat_polls[0]
                  : last.plan_group_chat_polls;
                const q = poll?.question?.trim();
                return q ? `Poll: ${q}` : 'Poll';
              }
              return last.message?.trim() ? last.message : 'New group chat';
            })(),
            lastMessageAt: last ? new Date(last.created_at) : null,
            unreadCount: unreadByChat.get(row.id) ?? 0,
          };
        });

      previews.sort((a, b) => {
        const ta = (a.lastMessageAt ?? a.createdAt).getTime();
        const tb = (b.lastMessageAt ?? b.createdAt).getTime();
        return tb - ta;
      });
      setChats(previews);
      initializedRef.current = true;
    } catch (error) {
      if (isTransientNetworkError(error)) {
        console.warn('Plan group chats list: network error, keeping previous list.');
      } else {
        console.error('Error fetching plan group chats list:', error);
      }
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`plan_group_chats_list:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'plan_group_chat_messages' },
        () => {
          void fetchList();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plan_group_chat_reads',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void fetchList({ force: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchList]);

  const refetch = useCallback(() => fetchList({ force: true }), [fetchList]);

  return {
    chats,
    loading,
    refetch,
  };
}
