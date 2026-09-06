import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './useAuth';
import { useLocationTracking } from './useLocationTracking';

const LOCATION_DONT_ASK_AGAIN_KEY = 'location_prompt_dont_ask_again';
const LOCATION_LAST_SHOWN_AT_KEY = 'location_prompt_last_shown_at';
const INACTIVE_DAYS = 30;

export function useLocationPrompt() {
  const { user } = useAuth();
  const { requestLocationPermission } = useLocationTracking();
  const [showPrompt, setShowPrompt] = useState(false);
  const [isRePrompt, setIsRePrompt] = useState(false);
  const [checking, setChecking] = useState(true);

  const checkShouldShow = useCallback(async () => {
    if (!user) {
      setChecking(false);
      return;
    }

    setChecking(true);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        setShowPrompt(false);
        setChecking(false);
        return;
      }

      const [dontAskAgain, lastShownAt] = await Promise.all([
        AsyncStorage.getItem(LOCATION_DONT_ASK_AGAIN_KEY),
        AsyncStorage.getItem(LOCATION_LAST_SHOWN_AT_KEY),
      ]);

      if (dontAskAgain === 'true') {
        setShowPrompt(false);
        setChecking(false);
        return;
      }

      const now = Date.now();
      const lastShown = lastShownAt ? new Date(lastShownAt).getTime() : 0;
      const daysSinceShown = (now - lastShown) / (1000 * 60 * 60 * 24);

      // Show on first time (no lastShownAt) or if inactive for 30+ days
      if (!lastShownAt || daysSinceShown >= INACTIVE_DAYS) {
        setShowPrompt(true);
        // Only offer "Don't ask again" when re-prompting after 30 days, not on first time
        setIsRePrompt(!!lastShownAt && daysSinceShown >= INACTIVE_DAYS);
      } else {
        setShowPrompt(false);
        setIsRePrompt(false);
      }
    } catch (e) {
      console.error('Error checking location prompt:', e);
      setShowPrompt(false);
    } finally {
      setChecking(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      checkShouldShow();
    } else {
      setShowPrompt(false);
      setChecking(false);
    }
  }, [user, checkShouldShow]);

  const dismissLocationPrompt = useCallback(async (dontAskAgain: boolean) => {
    // Close the React Native modal immediately so it cannot sit above an OS
    // permission sheet while preferences are being persisted.
    setShowPrompt(false);
    try {
      await AsyncStorage.setItem(LOCATION_LAST_SHOWN_AT_KEY, new Date().toISOString());
      if (dontAskAgain) {
        await AsyncStorage.setItem(LOCATION_DONT_ASK_AGAIN_KEY, 'true');
      }
    } catch (e) {
      console.error('Error saving location prompt preference:', e);
    }
  }, []);

  const requestLocationThenDismiss = useCallback(async (dontAskAgain: boolean) => {
    await dismissLocationPrompt(dontAskAgain);
    // Android needs the custom Modal window to finish closing before its
    // permission dialog is presented; otherwise the dim layer blocks both.
    await new Promise((resolve) => setTimeout(resolve, 350));
    await requestLocationPermission();
  }, [requestLocationPermission, dismissLocationPrompt]);

  return {
    showLocationPrompt: showPrompt,
    isLocationRePrompt: isRePrompt,
    checkingLocationPrompt: checking,
    dismissLocationPrompt,
    requestLocationThenDismiss,
  };
}
