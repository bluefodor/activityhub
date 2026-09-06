import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityProvider } from '@/contexts/ActivityContext';
import { useChats } from '@/hooks/useChats';
import { usePlanGroupChatsList } from '@/hooks/usePlanGroupChatsList';
import { useNotifications, registerPushNotificationsForLoggedInUser } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';
import { useLocationPrompt } from '@/hooks/useLocationPrompt';
import { useProfilePhotoPrompt } from '@/hooks/useProfilePhotoPrompt';
import { View, Text, StyleSheet, Modal, TouchableOpacity, AppState, Linking, InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback } from 'react';
import { WhatsNewModal } from '@/components/WhatsNewModal';
import { ActivityBadgeSync } from '@/components/ActivityBadgeSync';
import { AppIconBadgeSync } from '@/components/AppIconBadgeSync';
import { useActivityBadgeStore } from '@/store/useActivityBadgeStore';
import { useTutorialStore } from '@/store/useTutorialStore';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
const NOTIF_PROMPT_LAST_KEY = (userId: string) => `notif_prompt_last_${userId}`;
const NOTIF_PROMPT_SKIP_KEY = (userId: string) => `notif_prompt_skip_${userId}`;
const NOTIF_PROMPT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
// Automatic native Modals have produced a cardless, touch-blocking dim layer
// on Android. Keep optional prompts contextual until they can be redesigned.
const AUTOMATIC_STARTUP_PROMPTS_ENABLED = false;

function ChatTabIcon({ size, color }: { size: number; color: string }) {
  const { chats } = useChats();
  const { chats: groupChats } = usePlanGroupChatsList();
  const unreadChatCount =
    chats.filter((c) => c.unreadCount > 0).length +
    groupChats.filter((gc) => gc.unreadCount > 0).length;

  return (
    <View style={styles.tabIconContainer}>
      <Ionicons name="chatbubble-outline" size={size} color={color} />
      {unreadChatCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>
            {unreadChatCount > 99 ? '99+' : unreadChatCount.toString()}
          </Text>
        </View>
      )}
    </View>
  );
}

function ForumTabIcon({ size, color }: { size: number; color: string }) {
  const unreadTotal = useActivityBadgeStore((s) => s.forumUnreadTotal);

  return (
    <View style={styles.tabIconContainer}>
      <Ionicons name="chatbubbles-outline" size={size} color={color} />
      {unreadTotal > 0 && (
        <View style={styles.forumUnreadBadge}>
          <Text style={styles.unreadText}>
            {unreadTotal > 99 ? '99+' : unreadTotal.toString()}
          </Text>
        </View>
      )}
    </View>
  );
}

function PlansTabIcon({ size, color }: { size: number; color: string }) {
  const newPlansCount = useActivityBadgeStore((s) => s.newPlansTotal);

  return (
    <View style={styles.tabIconContainer}>
      <Ionicons name="calendar-outline" size={size} color={color} />
      {newPlansCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>
            {newPlansCount > 99 ? '99+' : newPlansCount.toString()}
          </Text>
        </View>
      )}
    </View>
  );
}

// Default bar on both platforms: icon on top, label below.

const styles = StyleSheet.create({
  tabIconContainer: {
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF8C42',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  unreadText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  forumUnreadBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF6B35',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  locationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  locationModalBox: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  locationModalTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  locationModalMessage: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    lineHeight: 22,
    marginBottom: 20,
  },
  locationModalCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  locationModalCheckbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#ccc',
    borderRadius: 6,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationModalCheckboxChecked: {
    backgroundColor: '#FF8C42',
    borderColor: '#FF8C42',
  },
  locationModalCheckboxLabel: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: '#333',
  },
  locationModalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  locationModalButtonSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  locationModalButtonSecondaryText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  locationModalButtonPrimary: {
    backgroundColor: '#FF8C42',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  locationModalButtonPrimaryText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    fontWeight: 'bold',
    color: '#fff',
  },
});

export default function TabLayout() {
  const { user } = useAuth();
  const tutorialActive = useTutorialStore((s) => s.isActive);
  const {
    showLocationPrompt,
    isLocationRePrompt,
    dismissLocationPrompt,
    requestLocationThenDismiss,
  } = useLocationPrompt();
  const [locationDontAskAgain, setLocationDontAskAgain] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [notificationDontAskAgain, setNotificationDontAskAgain] = useState(false);
  const {
    showProfilePhotoPrompt,
    profilePhotoDontAskAgain,
    setProfilePhotoDontAskAgain,
    dismissProfilePhotoPrompt,
    goToProfilePhoto,
  } = useProfilePhotoPrompt();

  useEffect(() => {
    if (showLocationPrompt) setLocationDontAskAgain(false);
  }, [showLocationPrompt]);

  const evaluateNotificationPrompt = useCallback(async () => {
    if (!user?.id) {
      setShowNotificationPrompt(false);
      return;
    }

    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted' || status === 'provisional') {
      setShowNotificationPrompt(false);
      return;
    }

    const skip = await AsyncStorage.getItem(NOTIF_PROMPT_SKIP_KEY(user.id));
    if (skip === '1') {
      setShowNotificationPrompt(false);
      return;
    }

    const lastPromptRaw = await AsyncStorage.getItem(NOTIF_PROMPT_LAST_KEY(user.id));
    const lastPrompt = Number(lastPromptRaw || '0');
    const due = !lastPrompt || Date.now() - lastPrompt >= NOTIF_PROMPT_INTERVAL_MS;

    if (due) {
      setNotificationDontAskAgain(false);
      setShowNotificationPrompt(true);
    }
  }, [user?.id]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      evaluateNotificationPrompt().catch(console.error);
    });
    return () => task.cancel();
  }, [evaluateNotificationPrompt]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        InteractionManager.runAfterInteractions(() => {
          evaluateNotificationPrompt().catch(console.error);
        });
      }
    });
    return () => sub.remove();
  }, [evaluateNotificationPrompt]);

  // Set up notification listeners and silently refresh push token when permission already exists
  useNotifications();

  const handleLocationNotNow = () => {
    dismissLocationPrompt(locationDontAskAgain);
  };

  const handleLocationTurnOn = () => {
    requestLocationThenDismiss(locationDontAskAgain);
  };

  const dismissNotificationPrompt = async () => {
    if (!user?.id) {
      setShowNotificationPrompt(false);
      return;
    }

    await AsyncStorage.setItem(NOTIF_PROMPT_LAST_KEY(user.id), Date.now().toString());
    if (notificationDontAskAgain) {
      await AsyncStorage.setItem(NOTIF_PROMPT_SKIP_KEY(user.id), '1');
    }
    setShowNotificationPrompt(false);
  };

  const handleNotificationNotNow = () => {
    dismissNotificationPrompt().catch(console.error);
  };

  const handleNotificationGo = async () => {
    if (!user?.id) return;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      // Already blocked at OS level — only path is Settings
      if (status === 'denied' || status === 'restricted') {
        await dismissNotificationPrompt();
        await Linking.openSettings();
        return;
      }
      // First time (or not yet decided): system sheet in-app via Expo — no Settings hop
      const ok = await registerPushNotificationsForLoggedInUser(user.id);
      if (ok) {
        await dismissNotificationPrompt();
      }
    } catch (error) {
      console.error('Error requesting notifications:', error);
    }
  };

  return (
    <ActivityProvider>
        <ActivityBadgeSync />
        <AppIconBadgeSync />
        <WhatsNewModal />
        <Modal
          visible={AUTOMATIC_STARTUP_PROMPTS_ENABLED && showLocationPrompt && !tutorialActive}
          transparent
          animationType="fade"
          onRequestClose={handleLocationNotNow}
        >
          <View style={styles.locationModalOverlay}>
            <View style={styles.locationModalBox}>
              <Text style={styles.locationModalTitle}>Turn on location?</Text>
              <Text style={styles.locationModalMessage}>
                Use your location to find people nearby and share where you are for meetups.
              </Text>
              {isLocationRePrompt && (
                <TouchableOpacity
                  style={styles.locationModalCheckboxRow}
                  onPress={() => setLocationDontAskAgain((prev) => !prev)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.locationModalCheckbox, locationDontAskAgain && styles.locationModalCheckboxChecked]}>
                    {locationDontAskAgain && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                  <Text style={styles.locationModalCheckboxLabel}>Don't ask again</Text>
                </TouchableOpacity>
              )}
              <View style={styles.locationModalButtons}>
                <TouchableOpacity style={styles.locationModalButtonPrimary} onPress={handleLocationTurnOn}>
                  <Text style={styles.locationModalButtonPrimaryText}>Turn on</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.locationModalButtonSecondary} onPress={handleLocationNotNow}>
                  <Text style={styles.locationModalButtonSecondaryText}>Not now</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          visible={
            AUTOMATIC_STARTUP_PROMPTS_ENABLED &&
            showProfilePhotoPrompt &&
            !showLocationPrompt &&
            !showNotificationPrompt &&
            !tutorialActive
          }
          transparent
          animationType="fade"
          onRequestClose={() => dismissProfilePhotoPrompt().catch(console.error)}
        >
          <View style={styles.locationModalOverlay}>
            <View style={styles.locationModalBox}>
              <Text style={styles.locationModalTitle}>Add a profile photo?</Text>
              <Text style={styles.locationModalMessage}>
                Add a photo so people recognize you in the forum, chats, and on plans.
              </Text>
              <TouchableOpacity
                style={styles.locationModalCheckboxRow}
                onPress={() => setProfilePhotoDontAskAgain((prev) => !prev)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.locationModalCheckbox,
                    profilePhotoDontAskAgain && styles.locationModalCheckboxChecked,
                  ]}
                >
                  {profilePhotoDontAskAgain && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
                <Text style={styles.locationModalCheckboxLabel}>Don't ask again</Text>
              </TouchableOpacity>
              <View style={styles.locationModalButtons}>
                <TouchableOpacity style={styles.locationModalButtonPrimary} onPress={() => goToProfilePhoto()}>
                  <Text style={styles.locationModalButtonPrimaryText}>Add photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.locationModalButtonSecondary}
                  onPress={() => dismissProfilePhotoPrompt().catch(console.error)}
                >
                  <Text style={styles.locationModalButtonSecondaryText}>Not now</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          visible={
            AUTOMATIC_STARTUP_PROMPTS_ENABLED &&
            showNotificationPrompt &&
            !showLocationPrompt &&
            !tutorialActive
          }
          transparent
          animationType="fade"
          onRequestClose={handleNotificationNotNow}
        >
          <View style={styles.locationModalOverlay}>
            <View style={styles.locationModalBox}>
              <Text style={styles.locationModalTitle}>Allow notifications?</Text>
              <Text style={styles.locationModalMessage}>
                Get chat, forum, and meetup reminders on time. You can change this any time in phone settings.
              </Text>
              <TouchableOpacity
                style={styles.locationModalCheckboxRow}
                onPress={() => setNotificationDontAskAgain((prev) => !prev)}
                activeOpacity={0.8}
              >
                <View style={[styles.locationModalCheckbox, notificationDontAskAgain && styles.locationModalCheckboxChecked]}>
                  {notificationDontAskAgain && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
                <Text style={styles.locationModalCheckboxLabel}>Don't ask again</Text>
              </TouchableOpacity>
              <View style={styles.locationModalButtons}>
                <TouchableOpacity style={styles.locationModalButtonPrimary} onPress={handleNotificationGo}>
                  <Text style={styles.locationModalButtonPrimaryText}>Allow</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.locationModalButtonSecondary} onPress={handleNotificationNotNow}>
                  <Text style={styles.locationModalButtonSecondaryText}>Not now</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: '#FF8C42',
            tabBarInactiveTintColor: '#999',
            tabBarShowLabel: true,
            tabBarStyle: { display: 'none' },
          }}>
          <Tabs.Screen
            name="index"
            options={{
              href: null, // Hide from tab bar
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'Home',
              tabBarIcon: ({ size, color }) => (
                <Ionicons name="home-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="forum"
            options={{
              title: 'Forum',
              tabBarIcon: ({ size, color }) => (
                <ForumTabIcon size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="plans"
            options={{
              title: 'Plans',
              tabBarIcon: ({ size, color }) => (
                <PlansTabIcon size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="people"
            options={{
              href: null, // People list lives in Forum only; keep route for people/[id] navigation
              title: 'People',
              tabBarIcon: ({ size, color }) => (
                <Ionicons name="people-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="chats"
            options={{
              title: 'Chats',
              tabBarIcon: ({ size, color }) => (
                <ChatTabIcon size={size} color={color} />
              ),
              listeners: {
                tabPress: () => {
                  router.replace('/chats');
                },
              },
            }}
          />
          <Tabs.Screen
            name="people/[id]"
            options={{
              href: null, // Hide from tab bar but keep navigation visible
            }}
          />
        </Tabs>
    </ActivityProvider>
  );
}
