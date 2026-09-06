import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { calculateDistance, formatDistance, getCurrentLocation } from '@/lib/locationUtils';
import { appCalendarDateKey } from '@/lib/appCalendarDate';

const MAX_READY_TODAY = 5;

export interface TodaySignupEntry {
  id: string;
  user_id: string;
  name: string;
  time_slot: string;
  location: string | null;
  /** From user_activity_skills for this activity; e.g. Beginner, Intermediate, Advanced */
  skill_level: string;
  /** Formatted distance from current user, e.g. "0.5 mi" or "—" */
  distance: string;
  /** Numeric distance in miles for sorting (999999 if unknown) */
  distanceValue: number;
}

function distanceForProfile(profile: any, currentLoc: { latitude: number; longitude: number } | null): number {
  if (!currentLoc || !profile?.latitude || !profile?.longitude) return 999999;
  return calculateDistance(currentLoc, { latitude: profile.latitude, longitude: profile.longitude });
}

function distanceDisplay(profile: any, currentLoc: { latitude: number; longitude: number } | null): string {
  if (!profile?.location_sharing_enabled) return '—';
  if (!profile?.latitude || !profile?.longitude) return '—';
  if (!currentLoc) return '—';
  const dist = calculateDistance(currentLoc, { latitude: profile.latitude, longitude: profile.longitude });
  return formatDistance(dist);
}

export function useTodaySignup(activityId: string | null) {
  const { user } = useAuth();
  const [list, setList] = useState<TodaySignupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  /** Latest auth id when the network response returns (avoids “include myself” if `user` was still null when the query started). */
  const userIdRef = useRef<string | undefined>(undefined);
  userIdRef.current = user?.id;
  /** Ignore stale list responses when activity or fetch generation moves on. */
  const listFetchGenerationRef = useRef(0);
  const requestedActivityIdRef = useRef<string | null>(null);
  requestedActivityIdRef.current = activityId;

  useEffect(() => {
    const timeoutMs = 8000;
    Promise.race([
      getCurrentLocation(),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]).then((loc) => {
      if (loc) setUserLocation(loc);
    });
  }, []);

  const fetchList = useCallback(async () => {
    if (!activityId) {
      listFetchGenerationRef.current += 1;
      setList([]);
      setLoading(false);
      return;
    }
    const fetchGeneration = ++listFetchGenerationRef.current;
    const requestedActivityId = activityId;
    setLoading(true);
    try {
      const today = appCalendarDateKey();
      let query = supabase
        .from('user_activity_skills')
        .select('id, user_id, skill_level, profiles!user_activity_skills_user_id_fkey(name, latitude, longitude, location_sharing_enabled)')
        .eq('activity_id', activityId)
        .eq('ready_today_date', today);
      if (user?.id) {
        query = query.neq('user_id', user.id);
      }
      const { data: skillsRows, error } = await query;

      if (fetchGeneration !== listFetchGenerationRef.current) {
        return;
      }
      if (requestedActivityIdRef.current !== requestedActivityId) {
        return;
      }

      if (error) {
        console.error('Error fetching ready today list:', error);
        if (
          fetchGeneration === listFetchGenerationRef.current &&
          requestedActivityIdRef.current === requestedActivityId
        ) {
          setList([]);
        }
        return;
      }

      const uid = userIdRef.current;
      const rows = (skillsRows || []).filter((row: any) => !uid || row.user_id !== uid);
      const currentLoc = userLocation ?? null;
      const listData: TodaySignupEntry[] = rows.map((row: any) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const name = profile?.name ?? 'Someone';
        const distVal = distanceForProfile(profile, currentLoc);
        const distStr = distanceDisplay(profile, currentLoc);
        return {
          id: row.id,
          user_id: row.user_id,
          name,
          time_slot: '',
          location: null,
          skill_level: row.skill_level ?? 'Beginner',
          distance: distStr,
          distanceValue: distVal,
        };
      });
      listData.sort((a, b) => a.distanceValue - b.distanceValue);
      if (fetchGeneration !== listFetchGenerationRef.current) {
        return;
      }
      if (requestedActivityIdRef.current !== requestedActivityId) {
        return;
      }
      setList(listData.slice(0, MAX_READY_TODAY));
    } catch (e) {
      console.error('useTodaySignup fetch:', e);
      if (fetchGeneration === listFetchGenerationRef.current) {
        setList([]);
      }
    } finally {
      if (fetchGeneration === listFetchGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [activityId, user?.id, userLocation]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void fetchList();
      }
    });
    return () => sub.remove();
  }, [fetchList]);

  const submit = useCallback(
    async (timeSlot: string, location: string | null) => {
      if (!user?.id || !activityId) return { ok: false, error: 'Missing user or activity' };
      setSubmitting(true);
      try {
        const today = appCalendarDateKey();
        const { error } = await supabase.from('today_activity_signups').upsert(
          {
            user_id: user.id,
            activity_id: activityId,
            time_slot: timeSlot,
            location: location?.trim() || null,
            signup_date: today,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,signup_date' }
        );
        if (error) {
          console.error('Today signup error:', error);
          return { ok: false, error: error.message };
        }
        await fetchList();
        return { ok: true };
      } catch (e) {
        console.error('Today signup:', e);
        return { ok: false, error: String(e) };
      } finally {
        setSubmitting(false);
      }
    },
    [user?.id, activityId, fetchList]
  );

  return { list, loading, submitting, submit, refetch: fetchList };
}
