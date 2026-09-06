import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Profile, UserActivitySkill } from '@/types/database';
import { appCalendarDateKey } from '@/lib/appCalendarDate';
import { DEFAULT_FETCH_THROTTLE_MS, isFetchThrottled, markFetchCompleted } from '@/lib/fetchThrottle';

const todayKey = appCalendarDateKey;

interface ProfileState {
  profile: Profile | null;
  userSkills: UserActivitySkill[];
  loading: boolean;
  loadedUserId: string | null;
  ensureLoaded: (userId: string) => Promise<void>;
  refetch: (userId: string, options?: { force?: boolean }) => Promise<void>;
  setProfile: (profile: Profile | null) => void;
  setUserSkills: (skills: UserActivitySkill[]) => void;
  reset: () => void;
}

let fetchInFlight: Promise<void> | null = null;
let fetchInFlightUserId: string | null = null;

async function loadProfileData(userId: string): Promise<{
  profile?: Profile | null;
  userSkills?: UserActivitySkill[];
}> {
  const [profileResult, skillsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase
      .from('user_activity_skills')
      .select(`
        id,
        user_id,
        activity_id,
        skill_level,
        ready_today,
        ready_today_date,
        created_at,
        updated_at,
        activities (
          name,
          emoji
        )
      `)
      .eq('user_id', userId),
  ]);

  const result: { profile?: Profile | null; userSkills?: UserActivitySkill[] } = {};

  if (profileResult.error) {
    console.error('Error fetching profile:', profileResult.error);
  } else {
    result.profile = profileResult.data ?? null;
  }

  if (skillsResult.error) {
    console.error('Error fetching user skills:', skillsResult.error);
  } else {
    const today = todayKey();
    result.userSkills = (skillsResult.data || []).map((row: any) => ({
      ...row,
      ready_today: row.ready_today_date === today,
    }));
  }

  return result;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  userSkills: [],
  loading: false,
  loadedUserId: null,

  ensureLoaded: async (userId: string) => {
    const state = get();
    if (state.loadedUserId === userId && !state.loading) {
      return;
    }

    if (fetchInFlight && fetchInFlightUserId === userId) {
      await fetchInFlight;
      return;
    }

    set({ loading: true });
    fetchInFlightUserId = userId;
    fetchInFlight = (async () => {
      try {
        const loaded = await loadProfileData(userId);
        if (fetchInFlightUserId !== userId) {
          return;
        }
        const state = get();
        set({
          profile: loaded.profile !== undefined ? loaded.profile : state.profile,
          userSkills: loaded.userSkills !== undefined ? loaded.userSkills : state.userSkills,
          loadedUserId: userId,
          loading: false,
        });
      } catch (error) {
        console.error('Error loading profile data:', error);
        set({ loading: false });
      } finally {
        if (fetchInFlightUserId === userId) {
          fetchInFlight = null;
          fetchInFlightUserId = null;
        }
      }
    })();

    await fetchInFlight;
  },

  refetch: async (userId: string, options?: { force?: boolean }) => {
    const throttleKey = `profile:${userId}`;
    const state = get();
    if (
      isFetchThrottled(throttleKey, DEFAULT_FETCH_THROTTLE_MS, options?.force) &&
      state.loadedUserId === userId &&
      state.userSkills.length > 0
    ) {
      return;
    }

    set({ loading: true });
    try {
      const loaded = await loadProfileData(userId);
      const current = get();
      set({
        profile: loaded.profile !== undefined ? loaded.profile : current.profile,
        userSkills: loaded.userSkills !== undefined ? loaded.userSkills : current.userSkills,
        loadedUserId: userId,
        loading: false,
      });
      if (loaded.profile !== undefined || loaded.userSkills !== undefined) {
        markFetchCompleted(throttleKey);
      }
    } catch (error) {
      console.error('Error refetching profile data:', error);
      set({ loading: false });
    }
  },

  setProfile: (profile) => set({ profile }),
  setUserSkills: (userSkills) => set({ userSkills }),

  reset: () => {
    fetchInFlight = null;
    fetchInFlightUserId = null;
    set({ profile: null, userSkills: [], loading: false, loadedUserId: null });
  },
}));
