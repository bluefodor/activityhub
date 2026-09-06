import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { calculateDistance, formatPeopleListDistance, getCurrentLocation } from '@/lib/locationUtils'
import { useActivityStore } from '@/store/useActivityStore';
import { appCalendarDateKey } from '@/lib/appCalendarDate'
import { createSessionCache } from '@/lib/sessionCache'
import { isFetchThrottled, markFetchCompleted } from '@/lib/fetchThrottle'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

/** People lists are large and stable — cache for 5 minutes between activity switches. */
export const PEOPLE_FETCH_TTL_MS = 5 * 60 * 1000;

interface PersonWithSkill {
  id: string
  name: string
  email: string
  avatar_url: string | null
  skill_level: string
  ready_today: boolean
  latitude: number | null
  longitude: number | null
  location_sharing_enabled: boolean
  distance: string
  distanceValue: number
}

function distanceLabelForProfile(
  profile: {
    latitude: number | null
    longitude: number | null
    location_sharing_enabled: boolean
  },
  currentLoc: { latitude: number; longitude: number } | null
): string {
  if (!profile.location_sharing_enabled) return ''
  if (!profile.latitude || !profile.longitude) return ''
  if (!currentLoc) return ''
  const dist = calculateDistance(currentLoc, {
    latitude: profile.latitude,
    longitude: profile.longitude,
  })
  return formatPeopleListDistance(dist)
}

function distanceValueForProfile(
  profile: {
    latitude: number | null
    longitude: number | null
    location_sharing_enabled: boolean
  },
  currentLoc: { latitude: number; longitude: number } | null
): number {
  if (!profile.location_sharing_enabled) return 999999
  if (!currentLoc || !profile.latitude || !profile.longitude) return 999998
  return calculateDistance(currentLoc, {
    latitude: profile.latitude,
    longitude: profile.longitude,
  })
}

function applyDistancesAndSort(
  rows: PersonWithSkill[],
  currentLoc: { latitude: number; longitude: number } | null
): PersonWithSkill[] {
  const withDistances = rows.map((person) => ({
    ...person,
    distance: distanceLabelForProfile(person, currentLoc),
    distanceValue: distanceValueForProfile(person, currentLoc),
  }))
  withDistances.sort((a, b) => {
    if (a.ready_today && !b.ready_today) return -1
    if (!a.ready_today && b.ready_today) return 1
    return a.distanceValue - b.distanceValue
  })
  return withDistances
}

function isLegacyPeopleCache(cached: PersonWithSkill[]): boolean {
  return cached.length > 0 && !('latitude' in cached[0])
}

function normalizeCachedPerson(person: PersonWithSkill): PersonWithSkill {
  return {
    ...person,
    latitude: person.latitude ?? null,
    longitude: person.longitude ?? null,
    location_sharing_enabled: person.location_sharing_enabled ?? false,
  }
}

const peopleCache = createSessionCache<PersonWithSkill[]>()

export function usePeople() {
  const { user } = useAuth()
  const { activityId: rawActivityId } = useActivityStore()
  // Debounce rapid carousel swipes so we don't fire a fetch for every intermediate activity.
  const activityId = useDebouncedValue(rawActivityId, 400)
  const [peopleRaw, setPeopleRaw] = useState<PersonWithSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null)
  const hadLocationRef = useRef(false)
  /** Ignore late responses from a previous activity (same pattern as useForumMessages). */
  const currentActivityIdRef = useRef<string>('')

  // Effect 1: Get location once on mount (like main). Non-blocking with timeout so list loads fast.
  useEffect(() => {
    const timeoutMs = 8000;
    Promise.race([
      getCurrentLocation(),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]).then((location) => {
      if (location) setUserLocation(location);
    });
  }, []);

  // Retry location when a people screen is focused but we still don't have GPS yet.
  useFocusEffect(
    useCallback(() => {
      if (userLocation) return;
      void getCurrentLocation().then((location) => {
        if (location) setUserLocation(location);
      });
    }, [userLocation])
  );

  // Effect 2: Fetch People when dependencies change
  useEffect(() => {
    if (activityId) {
      currentActivityIdRef.current = activityId;
      const cached = peopleCache.get(activityId);
      if (cached) {
        setPeopleRaw(cached.map(normalizeCachedPerson));
        setLoading(false);
      } else {
        setPeopleRaw([]);
        setLoading(true);
      }
      const legacyCache = cached ? isLegacyPeopleCache(cached) : false;
      fetchPeople(activityId, {
        force: legacyCache || !peopleCache.isFresh(activityId),
      });
    } else {
      currentActivityIdRef.current = '';
      setPeopleRaw([]);
      setLoading(false);
    }
  }, [activityId, user]);

  // Effect 3: When location first becomes available, re-fetch so coords are current
  useEffect(() => {
    if (userLocation && activityId) {
      if (!hadLocationRef.current) {
        hadLocationRef.current = true;
        fetchPeople(activityId, { force: true });
      }
    } else if (!userLocation) {
      hadLocationRef.current = false;
    }
  }, [userLocation, activityId]);

  const people = useMemo(
    () => applyDistancesAndSort(peopleRaw, userLocation),
    [peopleRaw, userLocation]
  );

  const fetchPeople = async (
    scopedActivityId?: string,
    options?: { tryLocation?: boolean; force?: boolean }
  ) => {
    const forActivityId = scopedActivityId ?? activityId
    if (!forActivityId) {
      setLoading(false)
      return
    }

    const throttleKey = `people:${forActivityId}`
    if (isFetchThrottled(throttleKey, PEOPLE_FETCH_TTL_MS, options?.force)) {
      if (currentActivityIdRef.current === forActivityId) {
        setLoading(false)
      }
      return
    }

    setLoading(true)

    // If refetch with tryLocation (e.g. after pull-to-refresh), try to get location so we pick it up after user grants permission
    let currentLoc = userLocation
    if (options?.tryLocation && !currentLoc) {
      currentLoc = await Promise.race([
        getCurrentLocation(),
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
      ])
      if (currentLoc) setUserLocation(currentLoc)
    }

    const fetchData = async () => {
      let blockedUserIds = new Set<string>();
      if (user) {
        const { data: blockedData } = await supabase
          .from('blocked_users')
          .select('blocked_user_id')
          .eq('user_id', user.id);
        blockedUserIds = new Set(blockedData?.map(b => b.blocked_user_id) || []);
      }
      const { data, error } = await supabase
        .from('user_activity_skills')
        .select(`
          id,
          user_id,
          activity_id,
          skill_level,
          ready_today,
          ready_today_date,
          profiles!user_activity_skills_user_id_fkey (
            id,
            name,
            email,
            avatar_url,
            created_at,
            updated_at,
            latitude,
            longitude,
            location_sharing_enabled
          )
        `)
        .eq('activity_id', forActivityId)
        .not('profiles', 'is', null);
      return { data, error, blockedUserIds };
    };

    const { data, error, blockedUserIds } = await fetchData();

    try {
      if (currentActivityIdRef.current !== forActivityId) {
        return
      }
      if (error) {
        console.error('Error fetching people:', error)
      } else if (data) {
        const filteredData = data?.filter(item => {
          const profileData = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
          // Filter out self (only if user is logged in) and blocked users
          if (!profileData) return false;
          if (user && item.user_id === user.id) return false;
          if (blockedUserIds.has(item.user_id)) return false;
          return true;
        })
        
        const peopleWithSkills = filteredData?.map(item => {
          const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
          const today = appCalendarDateKey();
          return {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            avatar_url: profile.avatar_url,
            skill_level: item.skill_level,
            ready_today: item.ready_today_date === today,
            latitude: profile.latitude ?? null,
            longitude: profile.longitude ?? null,
            location_sharing_enabled: !!profile.location_sharing_enabled,
            distance: '',
            distanceValue: 999998,
          };
        })
        
        setPeopleRaw(peopleWithSkills)
        peopleCache.set(forActivityId, peopleWithSkills)
        markFetchCompleted(throttleKey)
      } else {
        setPeopleRaw([])
      }
    } catch (error) {
      if (currentActivityIdRef.current !== forActivityId) {
        return
      }
      console.error('Unexpected error fetching people:', error)
    } finally {
      if (currentActivityIdRef.current === forActivityId) {
        setLoading(false)
      }
    }
  }

  return {
    people,
    loading,
    refetch: (options?: { tryLocation?: boolean }) =>
      fetchPeople(undefined, { ...options, force: true }),
  };
}

/**
 * Fire-and-forget preloader.  Uses a SINGLE batch query (.in) for all
 * activities instead of N parallel queries, then groups the results in JS.
 * Total cost: 2 queries (blocked users + all people), regardless of how many
 * activities the user has.
 *
 * Writes into `peopleCache` using the same throttle keys as `usePeople`, so
 * subsequent renders within 5 minutes skip the network call entirely.
 * Safe to call on every app-open focus — it short-circuits immediately if
 * all activities are already cached.
 */
export async function preloadPeopleForActivities(
  userId: string,
  activityIds: string[],
  userLocation: { latitude: number; longitude: number } | null = null
): Promise<void> {
  if (!userId || activityIds.length === 0) return;

  // Only fetch activities that don't already have a fresh cache entry.
  const uncachedIds = activityIds.filter(
    (id) => !isFetchThrottled(`people:${id}`, PEOPLE_FETCH_TTL_MS)
  );
  if (uncachedIds.length === 0) return;

  // Query 1: blocked users (one query shared across all activities).
  let blockedUserIds = new Set<string>();
  try {
    const { data: blockedData } = await supabase
      .from('blocked_users')
      .select('blocked_user_id')
      .eq('user_id', userId);
    blockedUserIds = new Set((blockedData || []).map((b: any) => b.blocked_user_id));
  } catch {
    // Non-fatal
  }

  // Query 2: single batch for ALL uncached activities.
  try {
    const { data, error } = await supabase
      .from('user_activity_skills')
      .select(`
        id,
        user_id,
        activity_id,
        skill_level,
        ready_today,
        ready_today_date,
        profiles!user_activity_skills_user_id_fkey (
          id,
          name,
          email,
          avatar_url,
          created_at,
          updated_at,
          latitude,
          longitude,
          location_sharing_enabled
        )
      `)
      .in('activity_id', uncachedIds)
      .not('profiles', 'is', null);

    if (error || !data) return;

    const today = appCalendarDateKey();

    // Group rows by activity_id so we can cache each activity separately.
    const byActivity = new Map<string, typeof data>();
    for (const item of data) {
      const arr = byActivity.get(item.activity_id) ?? [];
      arr.push(item);
      byActivity.set(item.activity_id, arr);
    }

    for (const [activityId, rows] of byActivity) {
      const people = rows
        .filter((item) => {
          const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
          if (!profile) return false;
          if (item.user_id === userId) return false;
          if (blockedUserIds.has(item.user_id)) return false;
          return true;
        })
        .map((item) => {
          const profile: any = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
          return {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            avatar_url: profile.avatar_url,
            skill_level: item.skill_level,
            ready_today: item.ready_today_date === today,
            latitude: profile.latitude ?? null,
            longitude: profile.longitude ?? null,
            location_sharing_enabled: !!profile.location_sharing_enabled,
            distance: '',
            distanceValue: 999998,
          };
        });

      peopleCache.set(activityId, people);
      markFetchCompleted(`people:${activityId}`);
    }
  } catch {
    // Non-fatal — usePeople will fetch on demand when the user navigates there
  }
}