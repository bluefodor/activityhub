import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { isPlanLocalDateTimePast } from '@/lib/planDateTime';
import { useAuth } from './useAuth';
import { DEFAULT_FETCH_THROTTLE_MS, isFetchThrottled, markFetchCompleted } from '@/lib/fetchThrottle';
import { useNotificationsStore } from '@/store/useNotificationsStore';

/** Inbox types tied to a plan — stale once the plan's event time has passed. */
export const PLAN_INBOX_NOTIFICATION_TYPES = [
  'new_plan',
  'plan_join_request',
  'plan_join_approved',
  'plan_join_declined',
  'plan_group_chat_message',
] as const;

export type InboxNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: {
    messageId?: string;
    planId?: string;
    requestId?: string;
    activityId?: string;
    activityName?: string;
    activityEmoji?: string;
    senderId?: string;
    senderName?: string;
    otherUserId?: string;
    chatId?: string;
    groupChatId?: string;
    creatorId?: string;
    creatorName?: string;
    requesterId?: string;
    requesterName?: string;
    hostId?: string;
    hostName?: string;
    planTitle?: string;
    updateId?: string;
  };
  read_at: string | null;
  created_at: string;
};

export function parseInboxNotificationData(
  data: InboxNotification['data'] | string | null | undefined
): InboxNotification['data'] {
  if (!data) return {};
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as InboxNotification['data'];
    } catch {
      return {};
    }
  }
  return data;
}

/** Mark matching unread inbox rows read (e.g. after opening a chat or viewing Plans). */
export async function markInboxNotificationsRead(
  userId: string,
  filter: {
    types?: string[];
    chatId?: string;
    groupChatId?: string;
    otherUserId?: string;
    activityId?: string;
  }
): Promise<number> {
  let query = supabase
    .from('user_notifications')
    .select('id, type, data')
    .eq('user_id', userId)
    .is('read_at', null);

  if (filter.types?.length === 1) {
    query = query.eq('type', filter.types[0]);
  } else if (filter.types && filter.types.length > 1) {
    query = query.in('type', filter.types);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error loading inbox notifications to mark read:', error);
    return 0;
  }

  const ids = (data ?? [])
    .filter((row) => {
      const d = parseInboxNotificationData(row.data as InboxNotification['data']);
      if (filter.chatId && d.chatId !== filter.chatId) return false;
      if (filter.groupChatId && d.groupChatId !== filter.groupChatId) return false;
      if (filter.otherUserId) {
        const senderId = d.otherUserId || d.senderId;
        if (senderId !== filter.otherUserId) return false;
      }
      if (filter.activityId && d.activityId !== filter.activityId) return false;
      return true;
    })
    .map((row) => row.id);

  if (ids.length === 0) return 0;

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('user_notifications')
    .update({ read_at: now })
    .eq('user_id', userId)
    .in('id', ids);

  if (updateError) {
    console.error('Error marking inbox notifications read:', updateError);
    return 0;
  }

  return ids.length;
}

const prunedPlanNotificationIds = new Set<string>();

/**
 * Unread plan-related inbox rows for events that already happened are useless noise.
 * Mark them read in the DB and drop them from the list returned to the UI.
 */
export async function pruneStaleUnreadPlanNotifications(
  userId: string,
  notifications: InboxNotification[]
): Promise<InboxNotification[]> {
  const staleCandidates = notifications.filter(
    (n) =>
      !n.read_at &&
      !prunedPlanNotificationIds.has(n.id) &&
      (PLAN_INBOX_NOTIFICATION_TYPES as readonly string[]).includes(n.type) &&
      parseInboxNotificationData(n.data).planId
  );

  if (staleCandidates.length === 0) return notifications;

  const planIds = [
    ...new Set(
      staleCandidates
        .map((n) => parseInboxNotificationData(n.data).planId)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const { data: plans, error } = await supabase
    .from('activity_plans')
    .select('id, event_date, event_time')
    .in('id', planIds);

  if (error) {
    console.error('Error loading plans for stale notification cleanup:', error);
    return notifications;
  }

  const pastOrMissingPlanIds = new Set<string>();
  const foundPlanIds = new Set((plans ?? []).map((p) => p.id));

  for (const plan of plans ?? []) {
    const eventTime =
      typeof plan.event_time === 'string'
        ? plan.event_time.slice(0, 5)
        : String(plan.event_time ?? '00:00');
    if (isPlanLocalDateTimePast(plan.event_date, eventTime)) {
      pastOrMissingPlanIds.add(plan.id);
    }
  }

  for (const planId of planIds) {
    if (!foundPlanIds.has(planId)) {
      pastOrMissingPlanIds.add(planId);
    }
  }

  if (pastOrMissingPlanIds.size === 0) return notifications;

  const idsToPrune = staleCandidates
    .filter((n) => {
      const planId = parseInboxNotificationData(n.data).planId;
      return planId && pastOrMissingPlanIds.has(planId);
    })
    .map((n) => n.id);

  if (idsToPrune.length === 0) return notifications;

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('user_notifications')
    .update({ read_at: now })
    .eq('user_id', userId)
    .in('id', idsToPrune);

  if (updateError) {
    console.error('Error pruning stale plan notifications:', updateError);
    return notifications;
  }

  idsToPrune.forEach((id) => prunedPlanNotificationIds.add(id));
  const prunedIds = new Set(idsToPrune);
  return notifications.filter((n) => !prunedIds.has(n.id));
}

export function useNotificationsInbox() {
  const { user } = useAuth();
  const { items, unreadCount, loading, setItems, setLoading, markReadLocal, markAllReadLocal } =
    useNotificationsStore();
  const realtimeRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInbox = useCallback(async (options?: { force?: boolean }) => {
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }

    const throttleKey = `inbox:${user.id}`;
    if (isFetchThrottled(throttleKey, DEFAULT_FETCH_THROTTLE_MS, options?.force)) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_notifications')
        .select('id, type, title, body, data, read_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      const rows = (data || []) as InboxNotification[];
      const pruned = await pruneStaleUnreadPlanNotifications(user.id, rows);
      setItems(pruned);
      markFetchCompleted(throttleKey);
    } finally {
      setLoading(false);
    }
  }, [user?.id, setItems, setLoading]);

  useEffect(() => {
    void fetchInbox();
  }, [fetchInbox]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`user_notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          if (realtimeRefetchTimerRef.current) {
            clearTimeout(realtimeRefetchTimerRef.current);
          }
          realtimeRefetchTimerRef.current = setTimeout(() => {
            void fetchInbox({ force: true });
          }, 300);
        }
      )
      .subscribe();

    return () => {
      if (realtimeRefetchTimerRef.current) {
        clearTimeout(realtimeRefetchTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchInbox]);

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!user?.id) return;
      // Update local store immediately so all bells sync at once
      markReadLocal(notificationId);
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('user_notifications')
        .update({ read_at: now })
        .eq('id', notificationId)
        .eq('user_id', user.id);
      if (error) {
        console.error('Error marking notification read:', error);
      }
    },
    [user?.id, markReadLocal]
  );

  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    // Update local store immediately so all bells sync at once
    markAllReadLocal();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('user_notifications')
      .update({ read_at: now })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (error) {
      console.error('Error marking all notifications read:', error);
    }
  }, [user?.id, markAllReadLocal]);

  const refetch = useCallback(
    (force?: boolean) => fetchInbox({ force }),
    [fetchInbox]
  );

  return {
    items,
    loading,
    unreadCount,
    refetch,
    markRead,
    markAllRead,
  };
}
