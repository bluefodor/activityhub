import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { FORUM_LAST_SEEN_KEY, PLANS_LAST_SEEN_KEY } from '@/lib/activityStorageKeys';
import { DEFAULT_FETCH_THROTTLE_MS, isFetchThrottled, markFetchCompleted } from '@/lib/fetchThrottle';

type RefreshOptions = { force?: boolean };

interface ActivityBadgeState {
  forumUnreadByActivity: Record<string, number>;
  forumUnreadTotal: number;
  newPlansByActivity: Record<string, number>;
  newPlansTotal: number;
  refreshForumBadges: (userId: string, activityIds: string[], options?: RefreshOptions) => Promise<void>;
  refreshPlansBadges: (userId: string, activityIds: string[], options?: RefreshOptions) => Promise<void>;
  /** Immediately zero-out a single activity's forum badge (used when the user is actively viewing it). */
  zeroOutForumBadge: (activityId: string) => void;
  clear: () => void;
}

let forumFetchInFlight: Promise<void> | null = null;
let plansFetchInFlight: Promise<void> | null = null;

async function loadForumUnreadByActivity(
  userId: string,
  activityIds: string[]
): Promise<Record<string, number>> {
  const stored = await AsyncStorage.getItem(FORUM_LAST_SEEN_KEY(userId));
  const lastSeenMap = stored ? JSON.parse(stored) : {};
  const counts: Record<string, number> = {};

  await Promise.all(
    activityIds.map(async (activityId) => {
      const lastSeen = lastSeenMap?.[activityId];
      let query = supabase
        .from('forum_messages')
        .select('id', { count: 'exact', head: true })
        .eq('activity_id', activityId)
        .neq('user_id', userId)
        .is('deleted_at', null);

      if (lastSeen) {
        query = query.gt('created_at', lastSeen);
      }

      const { count, error } = await query;
      counts[activityId] = error ? 0 : count || 0;
    })
  );

  return counts;
}

async function loadNewPlansByActivity(
  userId: string,
  activityIds: string[]
): Promise<Record<string, number>> {
  const plansSeenAt = await AsyncStorage.getItem(PLANS_LAST_SEEN_KEY(userId));
  const since = plansSeenAt || '1970-01-01T00:00:00.000Z';
  const counts: Record<string, number> = {};

  await Promise.all(
    activityIds.map(async (activityId) => {
      const { count, error } = await supabase
        .from('activity_plans')
        .select('id', { count: 'exact', head: true })
        .eq('activity_id', activityId)
        .gt('created_at', since)
        .neq('creator_id', userId);

      counts[activityId] = error ? 0 : count || 0;
    })
  );

  return counts;
}

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

export const useActivityBadgeStore = create<ActivityBadgeState>((set) => ({
  forumUnreadByActivity: {},
  forumUnreadTotal: 0,
  newPlansByActivity: {},
  newPlansTotal: 0,

  refreshForumBadges: async (userId, activityIds, options) => {
    if (!userId || activityIds.length === 0) {
      set({ forumUnreadByActivity: {}, forumUnreadTotal: 0 });
      return;
    }

    const throttleKey = `forum-badges:${userId}`;
    if (isFetchThrottled(throttleKey, DEFAULT_FETCH_THROTTLE_MS, options?.force)) {
      return;
    }

    if (forumFetchInFlight) {
      await forumFetchInFlight;
      return;
    }

    forumFetchInFlight = (async () => {
      try {
        const counts = await loadForumUnreadByActivity(userId, activityIds);
        markFetchCompleted(throttleKey);
        set({
          forumUnreadByActivity: counts,
          forumUnreadTotal: sumCounts(counts),
        });
      } catch (error) {
        console.error('Error loading forum badge counts:', error);
      } finally {
        forumFetchInFlight = null;
      }
    })();

    await forumFetchInFlight;
  },

  refreshPlansBadges: async (userId, activityIds, options) => {
    if (!userId || activityIds.length === 0) {
      set({ newPlansByActivity: {}, newPlansTotal: 0 });
      return;
    }

    const throttleKey = `plans-badges:${userId}`;
    if (isFetchThrottled(throttleKey, DEFAULT_FETCH_THROTTLE_MS, options?.force)) {
      return;
    }

    if (plansFetchInFlight) {
      await plansFetchInFlight;
      return;
    }

    plansFetchInFlight = (async () => {
      try {
        const counts = await loadNewPlansByActivity(userId, activityIds);
        markFetchCompleted(throttleKey);
        set({
          newPlansByActivity: counts,
          newPlansTotal: sumCounts(counts),
        });
      } catch (error) {
        console.error('Error loading plans badge counts:', error);
      } finally {
        plansFetchInFlight = null;
      }
    })();

    await plansFetchInFlight;
  },

  zeroOutForumBadge: (activityId) =>
    set((state) => {
      if ((state.forumUnreadByActivity[activityId] ?? 0) === 0) return state;
      const updated = { ...state.forumUnreadByActivity, [activityId]: 0 };
      return { forumUnreadByActivity: updated, forumUnreadTotal: sumCounts(updated) };
    }),

  clear: () => {
    set({
      forumUnreadByActivity: {},
      forumUnreadTotal: 0,
      newPlansByActivity: {},
      newPlansTotal: 0,
    });
  },
}));
