import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SectionList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CachedImage } from '@/components/CachedImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useChats } from '@/hooks/useChats';
import { usePlanGroupChatsList } from '@/hooks/usePlanGroupChatsList';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { ICONS } from '@/lib/helperUtils';
import { formatPlanGroupChatExpiryLabel } from '@/lib/planDateTime';
import { UpdatesTab } from '@/components/UpdatesTab';
import { useAppUpdates } from '@/hooks/useAppUpdates';
import { useLocalSearchParams } from 'expo-router';
import { useNotificationNavStore } from '@/store/useNotificationNavStore';

const UPDATES_SEEN_KEY = 'updates_last_seen_at';
export default function ChatsScreen() {
  const { user } = useAuth();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const { chats, loading, refetch } = useChats();
  const { chats: groupChats, loading: groupChatsLoading, refetch: refetchGroupChats } = usePlanGroupChatsList();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'messages' | 'updates'>(
    tabParam === 'updates' ? 'updates' : 'messages'
  );
  const [hasUnreadUpdate, setHasUnreadUpdate] = useState(false);
  const { updates } = useAppUpdates();
  const handledTabParamRef = useRef(tabParam);

  const handleSwitchToUpdates = useCallback(() => {
    setActiveTab('updates');
    setHasUnreadUpdate(false);
    AsyncStorage.setItem(UPDATES_SEEN_KEY, new Date().toISOString());
  }, []);

  // If navigated here with ?tab=updates (e.g. from the alerts bell), switch tab
  useEffect(() => {
    if (tabParam === 'updates' && handledTabParamRef.current !== tabParam) {
      handledTabParamRef.current = tabParam;
      handleSwitchToUpdates();
    }
  }, [tabParam, handleSwitchToUpdates]);

  // Check if the user has seen the latest update
  useEffect(() => {
    if (updates.length === 0) return;
    AsyncStorage.getItem(UPDATES_SEEN_KEY).then((val) => {
      const lastSeen = val ? new Date(val) : null;
      const latestUpdate = new Date(updates[0].created_at);
      setHasUnreadUpdate(!lastSeen || latestUpdate > lastSeen);
    });
  }, [updates]);

  const notificationNavNonce = useNotificationNavStore((s) => s.nonce);
  const notificationNavTarget = useNotificationNavStore((s) => s.target);
  const lastNotificationNavNonceRef = useRef(0);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const refetchGroupChatsRef = useRef(refetchGroupChats);
  refetchGroupChatsRef.current = refetchGroupChats;

  // Refetches data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refetchRef.current();
      refetchGroupChatsRef.current();
    }, [])
  );

  useEffect(() => {
    if (notificationNavTarget !== 'chats') return;
    if (notificationNavNonce === lastNotificationNavNonceRef.current) return;
    lastNotificationNavNonceRef.current = notificationNavNonce;
    useNotificationNavStore.setState({ target: null });
    refetchRef.current();
    refetchGroupChatsRef.current();
  }, [notificationNavNonce, notificationNavTarget]);

  // Handle pull-to-refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchGroupChats()]);
    setRefreshing(false);
  };

  const openGroupChat = (id: string, title: string) => {
    router.push({ pathname: '/chats/group/[id]', params: { id, planTitle: title } });
  };

  const openChat = (chatId: string, userName: string, otherUserId: string) => {
    router.push({
      pathname: '/chats/[id]',
      params: { id: otherUserId, name: userName },
    });
  };

  const listLoading = (loading || groupChatsLoading) && !refreshing;

  type ChatListItem =
    | { kind: 'group'; id: string; sortAt: Date; data: (typeof groupChats)[number] }
    | { kind: 'dm'; id: string; sortAt: Date; data: (typeof chats)[number] };

  const chatSections = useMemo(() => {
    const groups: ChatListItem[] = groupChats.map((gc) => ({
      kind: 'group' as const,
      id: `group-${gc.id}`,
      sortAt: gc.lastMessageAt ?? gc.createdAt ?? new Date(0),
      data: gc,
    }));
    const dms: ChatListItem[] = chats.map((c) => ({
      kind: 'dm' as const,
      id: `dm-${c.id}`,
      sortAt: c.timestamp ?? new Date(0),
      data: c,
    }));
    groups.sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());
    dms.sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());

    const sections: { key: string; title: string; data: ChatListItem[] }[] = [];
    if (groups.length > 0) {
      sections.push({ key: 'groups', title: 'Plan group chats', data: groups });
    }
    if (dms.length > 0) {
      sections.push({ key: 'dms', title: 'Direct messages', data: dms });
    }
    return sections;
  }, [groupChats, chats]);

  const totalChats = groupChats.length + chats.length;

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      const minutes = Math.floor(diffInHours * 60);
      return `${minutes}m ago`;
    }
    if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    }
    const days = Math.floor(diffInHours / 24);
    return `${days}d ago`;
  };

  const renderListItem = ({ item }: { item: ChatListItem }) =>
    item.kind === 'group' ? renderGroupChat({ item: item.data }) : renderChat({ item: item.data });

  const renderSectionHeader = ({
    section,
  }: {
    section: { key: string; title: string; data: ChatListItem[] };
  }) => (
    <View style={[styles.sectionHeader, section.key === 'dms' && styles.sectionHeaderSeparated]}>
      <View style={styles.sectionHeaderRow}>
        <Ionicons
          name={section.key === 'groups' ? 'people' : 'chatbubble-ellipses'}
          size={14}
          color={section.key === 'groups' ? '#FF8C42' : '#888'}
        />
        <Text style={styles.sectionLabel}>{section.title}</Text>
        <Text style={styles.sectionCount}>{section.data.length}</Text>
      </View>
    </View>
  );

  const renderChat = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.chatItem, styles.dmChatItem, item.awaitingReply && styles.chatItemAwaitingReply]}
      onPress={() => openChat(item.id, item.name, item.otherUserId)}
    >
      <CachedImage source={ item.avatar ? { uri: item.avatar } : ICONS.profileIcon } style={styles.avatar} displayPreset="avatar" />
      
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={[styles.userName, item.awaitingReply && styles.userNameAwaitingReply]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.timestamp}>{formatTime(item.timestamp)}</Text>
        </View>
        <View style={styles.lastMessageRow}>
          <Text
            style={[styles.lastMessage, item.awaitingReply && styles.lastMessageAwaitingReply]}
            numberOfLines={2}
          >
            {item.lastMessage}
          </Text>
          {item.awaitingReply ? (
            <View style={styles.replyBadge}>
              <Text style={styles.replyBadgeText}>Reply</Text>
            </View>
          ) : null}
        </View>
      </View>
      
      {item.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>{item.unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderGroupChat = ({ item }: { item: typeof groupChats[number] }) => (
    <TouchableOpacity
      style={[styles.chatItem, styles.groupChatItem]}
      onPress={() => openGroupChat(item.id, item.planTitle)}
    >
      <View style={styles.groupAvatar}>
        <Ionicons name="people" size={26} color="#FF8C42" />
      </View>
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={styles.userName} numberOfLines={1}>
            {item.planTitle}
          </Text>
          <Text style={styles.timestamp}>
            {item.lastMessageAt ? formatTime(item.lastMessageAt) : 'New'}
          </Text>
        </View>
        <Text style={styles.lastMessage} numberOfLines={2}>
          {item.lastMessage}
        </Text>
        {item.eventDate ? (
          <Text style={styles.groupExpiryHint}>
            {formatPlanGroupChatExpiryLabel(item.eventDate)}
          </Text>
        ) : null}
      </View>
      {item.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>{item.unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  // Require login for chats (account-based feature)
  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <View style={styles.headerGradient} />
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.navigate('/(tabs)/forum')}>
              <Ionicons name="chevron-back" size={20} color="#FF8C42" />
              <Text style={styles.backBtnText}>Forum</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Chats</Text>
            <View style={styles.backBtnPlaceholder} />
          </View>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="chatbubble" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>Sign in to view your chats</Text>
          <Text style={styles.emptySubtitle}>
            Sign in to start messaging with other users
          </Text>
          <TouchableOpacity 
            style={styles.loginButton}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (listLoading && totalChats === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <LoadingSpinner size={32} />
          <Text style={[styles.loadingText, { marginTop: 16 }]}>Loading chats...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerGradient} />
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.navigate('/(tabs)/forum')}>
            <Ionicons name="chevron-back" size={20} color="#FF8C42" />
            <Text style={styles.backBtnText}>Forum</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Chats</Text>
          <View style={styles.backBtnPlaceholder} />
        </View>
        {totalChats > 0 && activeTab === 'messages' && (
          <Text style={styles.subtitle}>
            {[
              groupChats.length > 0
                ? `${groupChats.length} group${groupChats.length === 1 ? '' : 's'}`
                : null,
              chats.length > 0
                ? `${chats.length} direct message${chats.length === 1 ? '' : 's'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'messages' && styles.tabBtnActive]}
          onPress={() => setActiveTab('messages')}
        >
          <Text style={[styles.tabLabel, activeTab === 'messages' && styles.tabLabelActive]}>
            Messages
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'updates' && styles.tabBtnActive]}
          onPress={handleSwitchToUpdates}
        >
          <View style={styles.tabLabelRow}>
            <Text style={[styles.tabLabel, activeTab === 'updates' && styles.tabLabelActive]}>
              Updates & Requests
            </Text>
            {hasUnreadUpdate && activeTab !== 'updates' && (
              <View style={styles.unreadDot} />
            )}
          </View>
        </TouchableOpacity>
      </View>

      {activeTab === 'updates' ? (
        <UpdatesTab />
      ) : totalChats > 0 ? (
        <SectionList
          sections={chatSections}
          renderItem={renderListItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubble" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySubtitle}>
            Start chatting with people from the forum or people section
          </Text>
          <TouchableOpacity onPress={onRefresh} style={{ marginTop: 20 }}>
             <Text style={{ ...styles.emptySubtitle, color: '#FF8C42' }}>Tap to refresh</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#FF8C42',
  },
  tabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#999',
  },
  tabLabelActive: {
    color: '#FF8C42',
    fontFamily: 'Inter_700Bold',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FF8C42',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    position: 'relative',
    overflow: 'hidden',
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#FF8C42',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  backBtnPlaceholder: {
    width: 60,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  listContainer: {
    padding: 16,
  },
  chatItem: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFCF56',
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2,
    transform: [{ scale: 1 }],
  },
  chatItemAwaitingReply: {
    borderLeftColor: '#FF8C42',
    backgroundColor: '#FFFBF7',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  chatInfo: {
    flex: 1,
    minWidth: 0,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  userName: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  userNameAwaitingReply: {
    color: '#B25600',
  },
  timestamp: {
    flexShrink: 0,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#999',
  },
  lastMessage: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    lineHeight: 18,
  },
  lastMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lastMessageAwaitingReply: {
    fontFamily: 'Inter_600SemiBold',
    color: '#444',
  },
  replyBadge: {
    backgroundColor: '#FFF0E0',
    borderWidth: 1,
    borderColor: '#FFCF56',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  replyBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#B25600',
  },
  unreadBadge: {
    backgroundColor: '#FF8C42',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sectionHeader: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 10,
    backgroundColor: '#FAF9F6',
  },
  sectionHeaderSeparated: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E8E4DE',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#666',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#999',
  },
  sectionGap: {
    height: 4,
  },
  groupChatItem: {
    borderLeftColor: '#FF8C42',
    backgroundColor: '#FFFCF9',
  },
  dmChatItem: {
    borderLeftColor: '#FFCF56',
  },
  groupAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
    backgroundColor: '#FFF3E8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFE0C4',
  },
  groupExpiryHint: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: '#B25600',
    marginTop: 4,
  },
  unreadText: {
    fontFamily: 'Inter_700Bold',
    color: 'white',
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  loginButton: {
    backgroundColor: '#FF8C42',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  loginButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
  },
});
