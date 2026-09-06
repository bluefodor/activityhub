import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const MAX_BADGE = 99;

/** Home-screen app icon badge (iOS; launcher-dependent on Android). */
export async function setAppIconBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'web') return;
  const safe = Math.max(0, Math.min(MAX_BADGE, Math.floor(count)));
  try {
    await Notifications.setBadgeCountAsync(safe);
  } catch (error) {
    console.warn('Failed to set app icon badge:', error);
  }
}

export async function clearAppIconBadge(): Promise<void> {
  await setAppIconBadgeCount(0);
}
