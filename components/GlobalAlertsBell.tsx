import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NotificationsInboxModal } from '@/components/NotificationsInboxModal';
import {
  useNotificationsInbox,
  type InboxNotification,
  parseInboxNotificationData,
} from '@/hooks/useNotificationsInbox';
import { useAuth } from '@/hooks/useAuth';
import { useActivityStore } from '@/store/useActivityStore';
import { useNotificationNavStore } from '@/store/useNotificationNavStore';
import { useProfile } from '@/hooks/useProfile';

export function GlobalAlertsBell() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { userSkills } = useProfile();
  const { unreadCount, items, loading, markRead, markAllRead, refetch } = useNotificationsInbox();
  const [visible, setVisible] = React.useState(false);
  const setActivity = useActivityStore((s) => s.setActivity);

  const handlePressItem = useCallback(
    async (item: InboxNotification) => {
      await markRead(item.id);
      setVisible(false);
      const d = parseInboxNotificationData(item.data);

      if (item.type === 'direct_message') {
        const chatUserId = d.otherUserId || d.senderId;
        if (chatUserId) {
          useNotificationNavStore.getState().trigger({
            target: 'dm',
            chatUserId,
          });
          router.push({
            pathname: '/(tabs)/chats/[id]',
            params: { id: chatUserId, name: d.senderName || 'User' },
          });
        }
        return;
      }

      if (item.type === 'plan_group_chat_message' && d.groupChatId) {
        useNotificationNavStore.getState().trigger({
          target: 'groupChat',
          groupChatId: d.groupChatId,
        });
        router.push({
          pathname: '/(tabs)/chats/group/[id]',
          params: { id: d.groupChatId, planTitle: d.planTitle || 'Group chat' },
        });
        return;
      }

      if (d.activityId) {
        const skillForActivity =
          userSkills.find((s) => s.activity_id === d.activityId)?.skill_level || 'Beginner';
        setActivity({
          activityId: d.activityId,
          activity: d.activityName || 'Activity',
          skillLevel: skillForActivity,
          emoji: d.activityEmoji || '📌',
        });
      }

      if (
        item.type === 'new_plan' ||
        item.type === 'plan_join_request' ||
        item.type === 'plan_join_approved' ||
        item.type === 'plan_join_declined' ||
        d.planId
      ) {
        useNotificationNavStore.getState().trigger({
          target: 'plans',
          planId: d.planId || null,
          openJoinRequests: item.type === 'plan_join_request',
        });
        router.push('/(tabs)/plans');
        return;
      }

      if (item.type === 'app_update') {
        useNotificationNavStore.getState().trigger({ target: 'chats' });
        router.navigate({ pathname: '/(tabs)/chats', params: { tab: 'updates' } });
        return;
      }

      if (item.type === 'forum_mention') {
        useNotificationNavStore.getState().trigger({ target: 'forum' });
        router.push('/(tabs)/forum');
      }
    },
    [markRead, setActivity, userSkills]
  );

  if (!user) return null;

  // Forum has its own inline Alerts control; avoid duplicate floating bell there.
  if (pathname?.includes('/forum')) return null;

  // DM + plan group chat headers have their own right-side actions (e.g. Private invite).
  if (pathname?.includes('/chats/group/')) return null;
  if (pathname?.match(/\/chats\/[^/]+$/)) return null;

  return (
    <>
      <TouchableOpacity
        style={[styles.fab, { top: insets.top + 6 }]}
        onPress={() => {
          void refetch(true);
          setVisible(true);
        }}
        activeOpacity={0.85}
        accessibilityLabel="Notifications"
      >
        <Ionicons name="notifications-outline" size={22} color="#555" />
        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <NotificationsInboxModal
        visible={visible}
        onClose={() => setVisible(false)}
        items={items}
        loading={loading}
        onMarkAllRead={() => void markAllRead()}
        onPressItem={(item) => void handlePressItem(item)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 14,
    zIndex: 100,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF8C42',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
  },
});
