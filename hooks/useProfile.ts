import { useState, useEffect, useCallback } from 'react'
import { Alert, AppState } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { useProfileStore } from '@/store/useProfileStore'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { appCalendarDateKey } from '@/lib/appCalendarDate'
import { uploadCompressedImage } from '@/lib/imageUpload'

const todayKey = appCalendarDateKey

export function useProfile() {
  const { user } = useAuth()
  const profile = useProfileStore((s) => s.profile)
  const userSkills = useProfileStore((s) => s.userSkills)
  const loadedUserId = useProfileStore((s) => s.loadedUserId)
  const storeLoading = useProfileStore((s) => s.loading)
  const loading = storeLoading || (!!user && loadedUserId !== user.id)
  const ensureLoaded = useProfileStore((s) => s.ensureLoaded)
  const refetchProfileData = useProfileStore((s) => s.refetch)
  const resetProfileStore = useProfileStore((s) => s.reset)
  const [uploading, setUploading] = useState(false)

  // Single shared fetch for the whole app (tab badges, forum, profile, etc.).
  useEffect(() => {
    if (!user) {
      resetProfileStore()
      return
    }
    void ensureLoaded(user.id)
  }, [user, ensureLoaded, resetProfileStore])

  const updateSkillLevel = async (activityId: string, skillLevel: 'Beginner' | 'Intermediate' | 'Local Legend', manualUserId?: string) => {
    const targetUserId = manualUserId || user?.id;

    if (!targetUserId) {
      console.log("No user ID found");
      return false;
    }

    console.log('updateSkillLevel called with:', { userId: targetUserId, activityId, skillLevel });

    try {
      // First check if the row exists
      const { data: existing, error: checkError } = await supabase
        .from('user_activity_skills')
        .select('id, skill_level')
        .eq('user_id', targetUserId)
        .eq('activity_id', activityId)
        .maybeSingle()

      const updateData = {
        user_id: targetUserId,
        activity_id: activityId,
        skill_level: skillLevel,
        ready_today: false, // Default to false for new entries
      }

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 means no rows found, which is fine
        console.error('Error checking existing skill:', checkError)
      }

      let error
      if (existing) {
        // Row exists, update it but preserve ready_today status
        const { error: updateError } = await supabase
          .from('user_activity_skills')
          .update({
            skill_level: skillLevel,
            // Don't reset ready_today when updating skill level
          })
          .eq('user_id', targetUserId)
          .eq('activity_id', activityId)
        error = updateError
      } else {
        // Row doesn't exist, insert it
        const { error: insertError } = await supabase
          .from('user_activity_skills')
          .insert(updateData)
        error = insertError
      }

      if (error) {
        console.error('Error updating skill level:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        return false
      } else {
        await refetchProfileData(targetUserId, { force: true })
        console.log('Profile and skills refreshed after update');
        return true
      }
    } catch (error) {
      console.error('Error updating skill level:', error)
      return false
    }
  }


  const removeActivity = async (activityId: string) => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('user_activity_skills')
        .delete()
        .eq('user_id', user.id)
        .eq('activity_id', activityId)

      if (error) {
        console.error('Error removing activity:', error)
      } else if (user) {
        await refetchProfileData(user.id, { force: true })
      }
    } catch (error) {
      console.error('Error removing activity:', error)
    }
  }

  const uploadProfileImage = async (uri: string) => {
    try {
      setUploading(true);
      if (!user) return { success: false, error: 'No user' };

      const filePath = `${user.id}/${new Date().getTime()}.jpg`;
      const publicUrl = await uploadCompressedImage(uri, {
        bucket: 'avatars',
        path: filePath,
        preset: 'avatar',
      });
      if (!publicUrl) throw new Error('Upload failed');

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      await refetchProfileData(user.id, { force: true });
      
      return { success: true, publicUrl };

    } catch (error: any) {
      console.error('Upload error:', error);
      return { success: false, error: error.message };
    } finally {
      setUploading(false);
    }
  };

  const updateReadyToday = async (activityId: string, readyToday: boolean) => {
    if (!user) return false;

    try {
      // Show one-time explanation the first time a user turns on "Ready today"
      if (readyToday) {
        try {
          const infoKey = `ready_today_info_shown_${user.id}`
          const alreadyShown = await AsyncStorage.getItem(infoKey)

          if (!alreadyShown) {
            Alert.alert(
              'Ready today',
              'Ready today turns off after midnight on your phone’s date. Turn it on again the next day to show you’re active.'
            )
            await AsyncStorage.setItem(infoKey, 'true')
          }
        } catch (e) {
          console.error('Error showing Ready today info:', e)
        }
      }

      const today = todayKey()

      const { error } = await supabase
        .from('user_activity_skills')
        .update({
          ready_today: readyToday,
          ready_today_date: readyToday ? today : null,
        })
        .eq('user_id', user.id)
        .eq('activity_id', activityId);

      if (error) {
        console.error('Error updating ready_today:', error);
        return false;
      }

      // Refresh skills to show updated state
      await refetchProfileData(user.id, { force: true });

      return true;
    } catch (error) {
      console.error('Error updating ready_today:', error);
      return false;
    }
  };

  // Reset stale ready_today when the device’s local calendar day advances (per user).
  // Runs on load and when the app returns to the foreground. `lastResetDate` in AsyncStorage
  // prevents duplicate work the same local day. Optional Supabase cron (see migration) is best-effort only.
  const resetReadyTodayIfNewDay = useCallback(async () => {
    if (!user) return;

    try {
      // Get the last reset date from AsyncStorage
      const lastResetDate = await AsyncStorage.getItem(`ready_reset_date_${user.id}`);
      const today = todayKey();

      // Only reset when the calendar day has changed — never within the same day,
      // so a toggle the user turned on today stays on until the next day.
      if (lastResetDate === today) {
        return;
      }

      // Clear past days so "ready today" is only true when ready_today_date = today
      const { error } = await supabase
        .from('user_activity_skills')
        .update({ ready_today: false, ready_today_date: null })
        .eq('user_id', user.id)
        .lt('ready_today_date', today);

      if (error) {
        console.error('Error resetting ready_today:', error);
        return;
      }

      // Store today's date as the last reset date
      await AsyncStorage.setItem(`ready_reset_date_${user.id}`, today);

      // Refresh skills to show updated state
      await refetchProfileData(user.id, { force: true });
    } catch (error) {
      console.error('Error in resetReadyTodayIfNewDay:', error);
    }
  }, [user, refetchProfileData]);

  // Check and reset on mount, user change, and when returning to the app (handles local date rollover in background).
  useEffect(() => {
    if (!user) return;
    void resetReadyTodayIfNewDay();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void resetReadyTodayIfNewDay();
      }
    });
    return () => sub.remove();
  }, [user, resetReadyTodayIfNewDay]);

  const refetch = useCallback((force?: boolean) => {
    if (user?.id) {
      void refetchProfileData(user.id, force ? { force: true } : undefined)
    }
  }, [user?.id, refetchProfileData])

  return {
    profile,
    userSkills,
    loading,
    uploading,
    updateSkillLevel,
    updateReadyToday,
    removeActivity,
    uploadProfileImage,
    refetch
  }
}