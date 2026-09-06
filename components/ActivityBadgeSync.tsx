import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/hooks/useAuth';
import { useActivityStore } from '@/store/useActivityStore';
import { useProfileStore } from '@/store/useProfileStore';
import { useActivityBadgeStore } from '@/store/useActivityBadgeStore';
import { preloadPeopleForActivities } from '@/hooks/usePeople';
import { getCurrentLocation } from '@/lib/locationUtils';
import { supabase } from '@/lib/supabase';
import { FORUM_LAST_SEEN_KEY } from '@/lib/activityStorageKeys';

/** Single shared refresh for forum + plans tab/carousel badges (deduped + throttled). */
export function ActivityBadgeSync() {
  const { user } = useAuth();
  const userSkills = useProfileStore((s) => s.userSkills);
  const forumLastSeenVersion = useActivityStore((s) => s.forumLastSeenVersion);
  const plansLastSeenVersion = useActivityStore((s) => s.plansLastSeenVersion);
  const refreshForumBadges = useActivityBadgeStore((s) => s.refreshForumBadges);
  const refreshPlansBadges = useActivityBadgeStore((s) => s.refreshPlansBadges);
  const dbSyncDoneRef = useRef(false);
  const forumRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activityIds = useMemo(
    () =>
      (userSkills || [])
        .filter((skill: { activities?: { name: string } | null; activity_id?: string }) => skill?.activities)
        .map((skill) => skill.activity_id)
        .filter(Boolean) as string[],
    [userSkills]
  );

  const refreshAll = useCallback(
    (options?: { force?: boolean }) => {
      if (!user?.id || activityIds.length === 0) return;
      void refreshForumBadges(user.id, activityIds, options);
      void refreshPlansBadges(user.id, activityIds, options);
      void (async () => {
        const loc = await getCurrentLocation();
        void preloadPeopleForActivities(user.id, activityIds, loc);
      })();
    },
    [user?.id, activityIds, refreshForumBadges, refreshPlansBadges]
  );

  // On first load, pull forum_seen_at from DB for any activity where AsyncStorage
  // has no lastSeen value. This covers reinstalls, cache clears, and new devices —
  // previously-read messages will never reappear as unread.
  useEffect(() => {
    if (!user?.id || activityIds.length === 0 || dbSyncDoneRef.current) return;
    dbSyncDoneRef.current = true;

    const syncFromDB = async () => {
      try {
        const key = FORUM_LAST_SEEN_KEY(user.id);
        const stored = await AsyncStorage.getItem(key);
        const map: Record<string, string> = stored ? JSON.parse(stored) : {};

        // Only fetch activities that are missing a local lastSeen.
        const missingIds = activityIds.filter((id) => !map[id]);
        if (missingIds.length === 0) return;

        const { data } = await supabase
          .from('user_activity_skills')
          .select('activity_id, forum_seen_at')
          .eq('user_id', user.id)
          .in('activity_id', missingIds)
          .not('forum_seen_at', 'is', null);

        if (!data?.length) return;

        let updated = false;
        for (const row of data) {
          if (row.forum_seen_at && !map[row.activity_id]) {
            map[row.activity_id] = row.forum_seen_at;
            updated = true;
          }
        }

        if (updated) {
          await AsyncStorage.setItem(key, JSON.stringify(map));
          // Trigger a badge refresh now that AsyncStorage has the correct lastSeen values.
          void refreshForumBadges(user.id, activityIds, { force: true });
        }
      } catch {
        // Non-fatal — local AsyncStorage state is the fallback.
      }
    };

    void syncFromDB();
  }, [user?.id, activityIds, refreshForumBadges]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        refreshAll();
      });
      return () => task.cancel();
    }, [refreshAll])
  );

  useEffect(() => {
    if (!user?.id || activityIds.length === 0) return;
    if (forumRefreshTimerRef.current) {
      clearTimeout(forumRefreshTimerRef.current);
    }
    forumRefreshTimerRef.current = setTimeout(() => {
      void refreshForumBadges(user.id, activityIds, { force: true });
    }, 400);
    return () => {
      if (forumRefreshTimerRef.current) {
        clearTimeout(forumRefreshTimerRef.current);
      }
    };
  }, [forumLastSeenVersion, refreshForumBadges, user?.id, activityIds]);

  // Badge refresh when "plans last seen" bumps — do not depend on refreshAll identity
  // (that was recreating and re-firing whenever activityIds/userSkills churned).
  useEffect(() => {
    if (!user?.id || activityIds.length === 0) return;
    refreshAll({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to last-seen bumps
  }, [plansLastSeenVersion]);

  return null;
}
