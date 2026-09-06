import { useState, useEffect, useCallback } from 'react';
import { AppState, InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useAuth } from './useAuth';
import { supabase } from '@/lib/supabase';
import { useProfileStore } from '@/store/useProfileStore';

const PHOTO_PROMPT_LAST_KEY = (userId: string) => `photo_prompt_last_${userId}`;
const PHOTO_PROMPT_SKIP_KEY = (userId: string) => `photo_prompt_skip_${userId}`;
const PHOTO_PROMPT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function hasProfilePhoto(avatarUrl: string | null | undefined): boolean {
  return !!avatarUrl?.trim();
}

export function useProfilePhotoPrompt() {
  const { user } = useAuth();
  const [showPrompt, setShowPrompt] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  const evaluate = useCallback(async () => {
    if (!user?.id) {
      setShowPrompt(false);
      return;
    }

    const profile = useProfileStore.getState().profile;
    if (profile?.id === user.id && hasProfilePhoto(profile.avatar_url)) {
      setShowPrompt(false);
      return;
    }

    if (!profile || profile.id !== user.id) {
      const { data: profileRow, error } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking profile photo prompt:', error);
        setShowPrompt(false);
        return;
      }

      if (hasProfilePhoto(profileRow?.avatar_url)) {
        setShowPrompt(false);
        return;
      }
    }

    const skip = await AsyncStorage.getItem(PHOTO_PROMPT_SKIP_KEY(user.id));
    if (skip === '1') {
      setShowPrompt(false);
      return;
    }

    const lastPromptRaw = await AsyncStorage.getItem(PHOTO_PROMPT_LAST_KEY(user.id));
    const lastPrompt = Number(lastPromptRaw || '0');
    const due = !lastPrompt || Date.now() - lastPrompt >= PHOTO_PROMPT_INTERVAL_MS;

    if (due) {
      setDontAskAgain(false);
      setShowPrompt(true);
    } else {
      setShowPrompt(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      evaluate().catch(console.error);
    });
    return () => task.cancel();
  }, [evaluate]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        InteractionManager.runAfterInteractions(() => {
          evaluate().catch(console.error);
        });
      }
    });
    return () => sub.remove();
  }, [evaluate]);

  const dismissPrompt = useCallback(async () => {
    if (!user?.id) {
      setShowPrompt(false);
      return;
    }

    await AsyncStorage.setItem(PHOTO_PROMPT_LAST_KEY(user.id), Date.now().toString());
    if (dontAskAgain) {
      await AsyncStorage.setItem(PHOTO_PROMPT_SKIP_KEY(user.id), '1');
    }
    setShowPrompt(false);
  }, [user?.id, dontAskAgain]);

  const goToProfilePhoto = useCallback(async () => {
    if (user?.id) {
      await AsyncStorage.setItem(PHOTO_PROMPT_LAST_KEY(user.id), Date.now().toString());
    }
    setShowPrompt(false);
    router.push('/(tabs)/profile');
  }, [user?.id]);

  return {
    showProfilePhotoPrompt: showPrompt,
    profilePhotoDontAskAgain: dontAskAgain,
    setProfilePhotoDontAskAgain: setDontAskAgain,
    dismissProfilePhotoPrompt: dismissPrompt,
    goToProfilePhoto,
  };
}
