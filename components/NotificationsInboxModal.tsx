import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { InboxNotification } from '@/hooks/useNotificationsInbox';

type Props = {
  visible: boolean;
  onClose: () => void;
  items: InboxNotification[];
  loading: boolean;
  onMarkAllRead: () => void;
  onPressItem: (item: InboxNotification) => void;
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function inboxIconName(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'new_plan':
      return 'calendar-outline';
    case 'direct_message':
      return 'chatbubble-outline';
    case 'plan_group_chat_message':
      return 'people-outline';
    case 'plan_join_request':
      return 'person-add-outline';
    case 'plan_join_approved':
      return 'checkmark-circle-outline';
    case 'plan_join_declined':
      return 'close-circle-outline';
    case 'app_update':
      return 'sparkles-outline';
    default:
      return 'at';
  }
}

export function NotificationsInboxModal({
  visible,
  onClose,
  items,
  loading,
  onMarkAllRead,
  onPressItem,
}: Props) {
  const hasUnread = items.some((i) => !i.read_at);

  // Auto-mark all as read the moment the modal becomes visible
  useEffect(() => {
    if (visible && hasUnread) {
      onMarkAllRead();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Notifications</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#FF8C42" />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="notifications-off-outline" size={40} color="#ccc" />
              <Text style={styles.emptyText}>No notifications yet</Text>
              <Text style={styles.emptySubtext}>
                @mentions, new plans, direct messages, group chats, and plan RSVP updates appear here.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {items.map((item) => {
                const isUpdate = item.type === 'app_update';
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.row,
                      !item.read_at && styles.rowUnread,
                      isUpdate && styles.rowUpdate,
                    ]}
                    onPress={() => onPressItem(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.rowIcon, isUpdate && styles.rowIconUpdate]}>
                      <Ionicons
                        name={inboxIconName(item.type)}
                        size={18}
                        color={isUpdate ? '#FF8C42' : '#FF8C42'}
                      />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, isUpdate && styles.rowTitleUpdate]} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.rowSubtitle} numberOfLines={2}>
                        {item.body}
                      </Text>
                      <Text style={styles.rowTime}>{formatWhen(item.created_at)}</Text>
                    </View>
                    {!item.read_at ? <View style={[styles.unreadDot, isUpdate && styles.unreadDotUpdate]} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-start',
    paddingTop: 56,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    maxHeight: '80%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#222',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markAllText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  closeBtn: {
    padding: 4,
  },
  list: {
    maxHeight: 480,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 12,
  },
  rowUnread: {
    backgroundColor: '#FFF8F3',
  },
  rowUpdate: {
    borderLeftWidth: 3,
    borderLeftColor: '#FF8C42',
    backgroundColor: '#FFFAF6',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF0E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconUpdate: {
    backgroundColor: '#FFE8D0',
  },
  rowTitleUpdate: {
    color: '#FF8C42',
  },
  unreadDotUpdate: {
    backgroundColor: '#FF8C42',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#222',
  },
  rowSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginTop: 2,
  },
  rowTime: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#999',
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF8C42',
    marginTop: 6,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#444',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#888',
    textAlign: 'center',
    lineHeight: 18,
  },
});
