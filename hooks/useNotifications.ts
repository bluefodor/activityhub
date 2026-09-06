import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

/** Android push is not supported in Expo Go (SDK 53+); skip to avoid failed network spam after login. */
const shouldSkipPushRegistration = () =>
  Platform.OS === 'android' && Constants.appOwnership === 'expo';
import { useAuth } from './useAuth';
import { useAuthStore } from '@/store/useAuthStore';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { useActivityStore } from '@/store/useActivityStore';
import { useNotificationNavStore } from '@/store/useNotificationNavStore';
import { parseDeviceLocalEventDateTime } from '@/lib/planDateTime';

const NOTIFICATION_PREFERENCE_FIELDS = {
  forum_notifications_enabled: true,
  chat_notifications_enabled: true,
  new_event_notifications_enabled: true,
  private_invite_notifications_enabled: true,
  plan_reminder_notifications_enabled: true,
} as const;

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    const currentUserId = useAuthStore.getState().user?.id;
    const senderId = data?.senderId ?? data?.otherUserId ?? data?.creatorId ?? data?.userId;
    if (currentUserId && senderId && String(senderId) === currentUserId) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }

    // No in-app banner for generic forum posts while the app is open.
    if (data?.type === 'forum_message') {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: true,
      };
    }

    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
});

export function useNotifications() {
  const { user } = useAuth();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const lastHandledNotificationId = useRef<string | null>(null);

  const handleNotificationTap = (data: any) => {
    const nav = useNotificationNavStore.getState();

    // Navigate based on notification type
    if (data?.type === 'new_message' && data?.otherUserId) {
      nav.trigger({ target: 'dm', chatUserId: String(data.otherUserId) });
      router.push({
        pathname: '/(tabs)/chats/[id]',
        params: {
          id: data.otherUserId,
          name: data.userName || 'User',
        },
      });
      return;
    }

    if (data?.type === 'plan_group_chat_message' && data?.groupChatId) {
      nav.trigger({ target: 'groupChat', groupChatId: String(data.groupChatId) });
      router.push({
        pathname: '/(tabs)/chats/group/[id]',
        params: {
          id: data.groupChatId,
          planTitle: data.planTitle || 'Group chat',
        },
      });
      return;
    }

    if ((data?.type === 'invite_created' || data?.type === 'invite_reminder') && data?.senderId) {
      nav.trigger({ target: 'dm', chatUserId: String(data.senderId) });
      router.push({
        pathname: '/chats/[id]',
        params: {
          id: data.senderId,
          name: data.senderName || 'User',
          inviteId: data.inviteId,
        },
      });
      return;
    }

    if (data?.type === 'event_reminder' && data?.otherUserId) {
      nav.trigger({ target: 'dm', chatUserId: String(data.otherUserId) });
      router.push({
        pathname: '/chats/[id]',
        params: {
          id: data.otherUserId,
          name: data.userName || 'User',
        },
      });
      return;
    }

    if (data?.type === 'forum_message' && data?.activityId) {
      useActivityStore.getState().setActivity({
        activityId: data.activityId,
        activity: data.activityName || 'Activity',
        skillLevel: 'Beginner',
        emoji: data.activityEmoji || '📌',
      });
      nav.trigger({ target: 'forum' });
      router.push('/(tabs)/forum');
      return;
    }

    if (data?.type === 'new_event' && data?.activityId) {
      useActivityStore.getState().setActivity({
        activityId: data.activityId,
        activity: data.activityName || 'Activity',
        skillLevel: 'Beginner',
        emoji: data.activityEmoji || '📌',
      });
      nav.trigger({
        target: 'plans',
        planId: data.planId ? String(data.planId) : null,
      });
      router.push('/(tabs)/plans');
      return;
    }

    if (data?.type === 'ready_today' && data?.activityId) {
      useActivityStore.getState().setActivity({
        activityId: data.activityId,
        activity: data.activityName || 'Activity',
        skillLevel: 'Beginner',
        emoji: data.activityEmoji || '📌',
      });
      nav.trigger({ target: 'forum' });
      router.push('/(tabs)/forum');
      return;
    }

    if (data?.type === 'weekly_nudge') {
      nav.trigger({ target: 'forum' });
      router.push('/(tabs)/forum');
      return;
    }

    if (data?.type === 'plan_reminder' && data?.activityId) {
      useActivityStore.getState().setActivity({
        activityId: data.activityId,
        activity: data.activityName || 'Activity',
        skillLevel: 'Beginner',
        emoji: data.activityEmoji || '📌',
      });
      nav.trigger({
        target: 'plans',
        planId: data.planId ? String(data.planId) : null,
      });
      router.push('/(tabs)/plans');
    }
  };

  useEffect(() => {
    if (user) {
      if (shouldSkipPushRegistration()) {
        console.log('⏸️ Skipping push token sync on Android Expo Go');
      } else {
        console.log('🔔 Checking existing notification permission for user:', user.id);
        ensurePushTokenStoredForPermittedUser(user.id).catch(error => {
          console.error('❌ Error syncing existing notification permission:', error);
          console.error('Error stack:', error.stack);
        });
      }
    } else {
      console.log('⏸️ No user logged in, skipping notification token sync');
    }

    // Listener for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // Listener for when user taps on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped:', response);
      const data = response.notification.request.content.data;
      const notificationId = response.notification.request.identifier;
      lastHandledNotificationId.current = notificationId;
      handleNotificationTap(data);
    });

    // Handle cold-start notification taps (app launched from killed state)
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const notificationId = response.notification.request.identifier;
        if (lastHandledNotificationId.current === notificationId) return;
        lastHandledNotificationId.current = notificationId;
        handleNotificationTap(response.notification.request.content.data);
      })
      .catch((error) => {
        console.error('❌ Error reading last notification response:', error);
      });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user]);

  return {
    sendNotification: sendLocalNotification,
  };
}

async function registerForPushNotificationsAsync() {
  const hasPermission = await ensureNotificationPermission(true);
  if (!hasPermission) {
    console.log('Failed to get push permission for push notification!');
    return null;
  }

  return getExpoPushTokenAsync();
}

async function ensureNotificationPermission(requestIfNeeded: boolean): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF8C42',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Ask system permission only on first-time undetermined state.
  // If user already denied, we'll use our in-app monthly reminder and deep-link to settings.
  if (existingStatus === 'undetermined' && requestIfNeeded) {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted' && finalStatus !== 'provisional') {
    return false;
  }

  return true;
}

async function getExpoPushTokenAsync(): Promise<string | null> {
  // Get Expo push token
  try {
    // Try multiple ways to get project ID (works in dev and production)
    let projectId = Constants.expoConfig?.extra?.eas?.projectId;
    
    // Fallback: try Constants.manifest if expoConfig doesn't work
    if (!projectId && (Constants as any).manifest?.extra?.eas?.projectId) {
      projectId = (Constants as any).manifest.extra.eas.projectId;
    }
    
    // Fallback: hardcode if needed (from app.json)
    if (!projectId) {
      projectId = '08f6f8e6-0c4c-497a-988f-6b6b895984fe'; // From app.json
      console.log('⚠️ Using hardcoded project ID as fallback');
    }
    
    console.log('🔍 Looking for Expo project ID...');
    console.log('Constants.expoConfig:', Constants.expoConfig ? 'exists' : 'null');
    console.log('Project ID found:', projectId);
    
    if (!projectId) {
      console.error('❌ Expo project ID not found anywhere!');
      return null;
    }

    console.log('✅ Using project ID:', projectId);
    console.log('📞 Requesting Expo push token...');
    
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId,
    });
    
    console.log('✅ Expo push token received:', tokenData.data.substring(0, 30) + '...');
    return tokenData.data;
  } catch (error: any) {
    console.error('❌ Error getting Expo push token:', error);
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    if (error?.stack) {
      console.error('Error stack:', error.stack);
    }
    return null;
  }
}

async function ensurePushTokenStoredForPermittedUser(userId: string): Promise<boolean> {
  const hasPermission = await ensureNotificationPermission(false);
  if (!hasPermission) return false;

  const token = await getExpoPushTokenAsync();
  if (!token) {
    console.warn('⚠️ Notification permission exists, but no push token was received.');
    return true;
  }

  await storePushToken(userId, token);
  return true;
}

/**
 * Store push token in the database
 */
async function storePushToken(userId: string, expoPushToken: string) {
  const upsertToken = async () =>
    supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          expo_push_token: expoPushToken,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,expo_push_token',
        }
      )
      .select();

  try {
    console.log('📱 Attempting to store push token:', {
      userId,
      token: expoPushToken.substring(0, 20) + '...', // Log first 20 chars only
    });

    // Use upsert to update if token exists, insert if new
    let { data, error } = await upsertToken();

    // Remove any other tokens for this user (stale tokens from old devices/reinstalls)
    // so the user always has exactly one active token and never receives duplicate notifications.
    if (!error) {
      await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', userId)
        .neq('expo_push_token', expoPushToken);
    }

    // Self-heal if profile row is missing (FK push_tokens_user_id_fkey)
    if (error?.code === '23503') {
      console.warn('⚠️ Missing profile row for user. Attempting to create profile, then retry token upsert.');
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user;

      const profilePayload = {
        id: userId,
        email: authUser?.email || '',
        name:
          (authUser?.user_metadata?.name as string | undefined) ||
          (authUser?.email ? authUser.email.split('@')[0] : 'User'),
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      if (profileError) {
        console.error('❌ Failed to self-heal missing profile row:', profileError);
      } else {
        ({ data, error } = await upsertToken());
      }
    }

    if (error) {
      console.error('❌ Error storing push token:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Push token stored successfully:', data);
    }
  } catch (error) {
    console.error('❌ Exception in storePushToken:', error);
  }
}

/**
 * Use when the user explicitly opts in (e.g. in-app "Turn on notifications" primary button).
 * Shows the system permission dialog when status is still "undetermined", then registers the Expo push token.
 * Does not open Settings — call Linking.openSettings() only when permission is already denied.
 */
export async function registerPushNotificationsForLoggedInUser(userId: string): Promise<boolean> {
  if (shouldSkipPushRegistration()) {
    return false;
  }
  const hasPermission = await ensureNotificationPermission(true);
  if (!hasPermission) return false;

  const { error } = await supabase
    .from('profiles')
    .update(NOTIFICATION_PREFERENCE_FIELDS)
    .eq('id', userId);

  if (error) {
    console.error('❌ Error enabling notification preferences:', error);
    return false;
  }

  const token = await getExpoPushTokenAsync();
  if (token) {
    await storePushToken(userId, token);
  } else {
    console.warn('⚠️ Notification permission granted, but push token registration did not complete.');
  }

  return true;
}

export async function sendLocalNotification(title: string, body: string, data?: any) {
  try {
    // Ensure Android notification channel is set up
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF8C42',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    // Check permissions first
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Notification permissions not granted. Status:', status);
      // Try requesting again
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== 'granted') {
        console.error('Cannot send notification - permissions denied');
        return;
      }
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data: data || {},
      },
      trigger: null, // Show immediately
    });
    
    console.log('✅ Notification sent:', title, body);
  } catch (error) {
    console.error('❌ Error sending notification:', error);
  }
}

/**
 * Schedule a notification for an event 1 hour before it starts
 * This works even when the app is closed (scheduled notifications)
 */
export async function scheduleEventNotification(
  meetingId: string,
  eventDate: string,
  eventTime: string,
  location: string,
  otherPersonName: string
): Promise<string | null> {
  try {
    // Ensure Android notification channel is set up
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF8C42',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    // Check permissions
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== 'granted') {
        console.error('Cannot schedule notification - permissions denied');
        return null;
      }
    }

    // Device-local wall clock (not ISO UTC) so “1 hour before” matches the phone.
    const eventDateTime = parseDeviceLocalEventDateTime(eventDate, eventTime);
    if (!eventDateTime) {
      console.error('Cannot parse event date/time for notification:', eventDate, eventTime);
      return null;
    }
    const notificationTime = new Date(eventDateTime.getTime() - 60 * 60 * 1000); // 1 hour before
    const now = new Date();

    // Only schedule if the notification time is in the future
    if (notificationTime <= now) {
      console.log('Event is too soon or already passed, not scheduling notification');
      return null;
    }

    const secondsUntilNotification = Math.floor((notificationTime.getTime() - now.getTime()) / 1000);

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: '⏰ Event Reminder',
            body: `Your meetup with ${otherPersonName} at ${location} starts in 1 hour!`,
            sound: true,
            data: {
              type: 'event_reminder',
              meetingId,
              eventDate,
              eventTime,
              location,
              otherPersonName,
            },
          },
          trigger: {
            seconds: secondsUntilNotification,
          },
        });

    console.log(`✅ Scheduled event notification for ${notificationTime.toLocaleString()}, ID: ${notificationId}`);
    return notificationId;
  } catch (error) {
    console.error('❌ Error scheduling event notification:', error);
    return null;
  }
}

/**
 * Cancel a scheduled notification by ID
 */
export async function cancelScheduledNotification(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log(`✅ Cancelled notification ${notificationId}`);
  } catch (error) {
    console.error('❌ Error cancelling notification:', error);
  }
}

/**
 * Get all scheduled notifications (useful for debugging)
 */
export async function getAllScheduledNotifications() {
  return await Notifications.getAllScheduledNotificationsAsync();
}
