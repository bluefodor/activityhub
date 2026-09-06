import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Modal,
  TouchableWithoutFeedback,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  usePlanGroupChat,
  fetchPlanGroupChatMembers,
  type PlanGroupChatMessage,
  type PlanGroupChatMember,
} from '@/hooks/usePlanGroupChat';
import type { PlanGroupChatReadReceiptDetails } from '@/lib/planGroupChatReadReceipts';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationNavStore } from '@/store/useNotificationNavStore';
import { clearGroupDraft, loadGroupDraft, saveGroupDraft } from '@/lib/chatDrafts';
import {
  scrollChatListToLatest,
  scrollChatListToLatestWithRetries,
} from '@/lib/chatListScroll';
import { markInboxNotificationsRead } from '@/hooks/useNotificationsInbox';
import { supabase } from '@/lib/supabase';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { AppKeyboardAvoidingView } from '@/components/AppKeyboardAvoidingView';
import { MessageEditModal } from '@/components/MessageEditModal';
import { ICONS } from '@/lib/helperUtils';
import { CachedImage } from '@/components/CachedImage';
import ImageView from '@/components/ImageView';
import { formatPlanGroupChatExpiryLabel } from '@/lib/planDateTime';
import { normalizePlanGroupChatPoll } from '@/lib/planGroupChatPolls';
import { PlanGroupChatPollCard } from '@/components/PlanGroupChatPollCard';
import { CreatePlanGroupChatPollModal } from '@/components/CreatePlanGroupChatPollModal';
import { useMessageReactions } from '@/hooks/useMessageReactions';
import { ReactionDisplay } from '@/components/ReactionDisplay';
import { ReactionPicker, type ReactionPickerLayout } from '@/components/ReactionPicker';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface Sender {
  id: string;
  name: string;
  avatar_url: string | null;
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function formatTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function PlanGroupChatScreen() {
  const insets = useSafeAreaInsets();
  const { id, planTitle } = useLocalSearchParams<{ id: string; planTitle?: string }>();
  const { user } = useAuth();
  const inputBarBottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);
  const {
    meta,
    messages,
    loading,
    error: loadError,
    sendMessage,
    updateMessage,
    deleteMessage,
    markAsRead,
    getReadReceipt,
    getReadReceiptDetails,
    refetch,
  } = usePlanGroupChat(id ?? null);

  const [draft, setDraft] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [senders, setSenders] = useState<Record<string, Sender>>({});
  const sendersRef = useRef<Record<string, Sender>>({});
  sendersRef.current = senders;
  const [editingMessage, setEditingMessage] = useState<PlanGroupChatMessage | null>(null);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [isGalleryVisible, setIsGalleryVisible] = useState(false);
  const [galleryImages, setGalleryImages] = useState<{ uri: string }[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [membersLoading, setMembersLoading] = useState(false);
  const [members, setMembers] = useState<PlanGroupChatMember[]>([]);
  const membersSeqRef = useRef(0);
  const listRef = useRef<FlatList>(null);
  const didInitialScrollRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const pendingInitialScrollRef = useRef(true);
  const messageLayoutRefs = useRef<Record<string, View | null>>({});

  const messageIds = useMemo(
    () => messages.filter((m) => !m.deleted_at && m.message_kind !== 'poll').map((m) => m.id),
    [messages]
  );
  const { getReactions, getCurrentUserEmoji, toggleReaction } = useMessageReactions(
    messageIds,
    'plan_group_chat'
  );
  const [reactionPickerState, setReactionPickerState] = useState<{
    messageId: string;
    layout: ReactionPickerLayout;
  } | null>(null);
  const [messageActionMenu, setMessageActionMenu] = useState<{
    message: PlanGroupChatMessage;
    layout: ReactionPickerLayout;
  } | null>(null);
  const [reactionDetailsVisible, setReactionDetailsVisible] = useState(false);
  const [reactionDetailsLoading, setReactionDetailsLoading] = useState(false);
  const [reactionDetails, setReactionDetails] = useState<
    Array<{ id: string; name: string; emojis: string[] }>
  >([]);
  const [readReceiptDetailsVisible, setReadReceiptDetailsVisible] = useState(false);
  const [readReceiptDetails, setReadReceiptDetails] = useState<PlanGroupChatReadReceiptDetails | null>(
    null
  );

  const markReadAndClearInbox = useCallback(() => {
    void markAsRead();
    if (user?.id && id) {
      void markInboxNotificationsRead(user.id, {
        types: ['plan_group_chat_message'],
        groupChatId: id,
      });
    }
  }, [markAsRead, user?.id, id]);

  // Mark read on focus and on new messages
  useEffect(() => {
    if (!id) return;
    void loadGroupDraft(id).then((text) => setDraft(text));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => {
      void saveGroupDraft(id, draft);
    }, 400);
    return () => clearTimeout(timer);
  }, [id, draft]);

  const notificationNavNonce = useNotificationNavStore((s) => s.nonce);
  const notificationNavTarget = useNotificationNavStore((s) => s.target);
  const lastNotificationNavNonceRef = useRef(0);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const markReadAndClearInboxRef = useRef(markReadAndClearInbox);
  markReadAndClearInboxRef.current = markReadAndClearInbox;

  useFocusEffect(
    useCallback(() => {
      markReadAndClearInboxRef.current();
      void refetchRef.current();
    }, [])
  );

  useEffect(() => {
    if (notificationNavTarget !== 'groupChat') return;
    if (notificationNavNonce === lastNotificationNavNonceRef.current) return;
    lastNotificationNavNonceRef.current = notificationNavNonce;
    useNotificationNavStore.setState({ target: null });
    void refetchRef.current();
  }, [notificationNavNonce, notificationNavTarget]);
  useEffect(() => {
    if (messages.length > 0) markReadAndClearInbox();
  }, [messages.length, markReadAndClearInbox]);

  useEffect(() => {
    pendingInitialScrollRef.current = true;
    didInitialScrollRef.current = false;
    stickToBottomRef.current = true;
  }, [id]);

  const scrollToLatest = useCallback((animated = false) => {
    scrollChatListToLatest(listRef, animated);
  }, []);

  const finishInitialScroll = useCallback(() => {
    if (!pendingInitialScrollRef.current) return;
    pendingInitialScrollRef.current = false;
    didInitialScrollRef.current = true;
  }, []);

  useEffect(() => {
    if (loading || messages.length === 0 || !pendingInitialScrollRef.current) return;
    const cancel = scrollChatListToLatestWithRetries(listRef, finishInitialScroll);
    return cancel;
  }, [loading, messages.length, finishInitialScroll]);

  useEffect(() => {
    if (loading || messages.length === 0 || !didInitialScrollRef.current) return;
    if (stickToBottomRef.current) {
      requestAnimationFrame(() => scrollToLatest(true));
    }
  }, [loading, messages.length, scrollToLatest]);

  const handleListContentSizeChange = useCallback(() => {
    if (messages.length === 0) return;
    if (pendingInitialScrollRef.current) {
      scrollChatListToLatest(listRef, false);
      return;
    }
    if (stickToBottomRef.current) {
      scrollChatListToLatest(listRef, true);
    }
  }, [messages.length]);

  const handleListScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - layoutMeasurement.height - contentOffset.y;
    stickToBottomRef.current = distanceFromBottom < 80;
  }, []);

  // Fetch sender profiles for any unique user_ids we see
  const messageSenderIds = useMemo(
    () => Array.from(new Set(messages.map((m) => m.user_id))).sort().join(','),
    [messages]
  );

  useEffect(() => {
    const uniqueIds = messageSenderIds ? messageSenderIds.split(',') : [];
    if (uniqueIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const missing = uniqueIds.filter((uid) => !sendersRef.current[uid]);
      if (missing.length === 0) return;

      const { data } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', missing);
      if (!data || cancelled) return;
      setSenders((prev) => {
        const next = { ...prev };
        data.forEach((p: any) => {
          next[p.id] = { id: p.id, name: p.name, avatar_url: p.avatar_url };
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [messageSenderIds]);

  const expiryLabel = useMemo(() => {
    if (!meta?.event_date) return '';
    return formatPlanGroupChatExpiryLabel(meta.event_date);
  }, [meta?.event_date]);

  const openMembers = async () => {
    if (!meta?.plan_id) return;
    const seq = ++membersSeqRef.current;
    setShowMembersModal(true);
    setMembersLoading(true);
    setMembers([]);
    try {
      const list = await fetchPlanGroupChatMembers(meta.plan_id);
      if (seq !== membersSeqRef.current) return;
      setMembers(list);
    } finally {
      if (seq === membersSeqRef.current) {
        setMembersLoading(false);
      }
    }
  };

  const openMemberProfile = (member: PlanGroupChatMember) => {
    setShowMembersModal(false);
    router.push({
      pathname: '/(tabs)/people/[id]',
      params: { id: member.id, name: member.name, from: 'chats' },
    });
  };

  const onPickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Photo library access is needed.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.7,
    });
    if (!res.canceled && res.assets) {
      setPendingImages((prev) => [...prev, ...res.assets.map((a) => a.uri)].slice(0, 4));
    }
  };

  const onSend = async () => {
    if (sending) return;
    if (!draft.trim() && pendingImages.length === 0) return;
    setSending(true);
    const ok = await sendMessage(draft, pendingImages);
    if (ok) {
      setDraft('');
      setPendingImages([]);
      void clearGroupDraft(id ?? '');
      requestAnimationFrame(() => scrollToLatest(true));
    } else {
      Alert.alert('Could not send', 'Please try again.');
    }
    setSending(false);
  };

  const handleDelete = (msg: PlanGroupChatMessage) => {
    Alert.alert('Delete message?', 'This will remove your message for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMessage(msg.id);
        },
      },
    ]);
  };

  const handleReactionSelect = (emoji: string) => {
    if (!reactionPickerState) return;
    toggleReaction(reactionPickerState.messageId, emoji);
    setReactionPickerState(null);
  };

  const openReactionPickerFromMenu = () => {
    if (!messageActionMenu) return;
    setReactionPickerState({
      messageId: messageActionMenu.message.id,
      layout: messageActionMenu.layout,
    });
    setMessageActionMenu(null);
  };

  const openEditFromMenu = () => {
    if (!messageActionMenu) return;
    setEditingMessage(messageActionMenu.message);
    setMessageActionMenu(null);
  };

  const confirmDeleteFromMenu = () => {
    if (!messageActionMenu) return;
    const msg = messageActionMenu.message;
    setMessageActionMenu(null);
    handleDelete(msg);
  };

  const openReactionDetails = async (messageId: string) => {
    const summaries = getReactions(messageId);
    if (!summaries.length) return;

    const userIds = Array.from(new Set(summaries.flatMap((s) => s.userIds))).filter(Boolean);
    if (!userIds.length) return;

    setReactionDetailsVisible(true);
    setReactionDetailsLoading(true);
    setReactionDetails([]);
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      if (error) {
        console.error('Error loading reaction users:', error);
        return;
      }
      const byId = new Map((profiles || []).map((p: { id: string; name: string }) => [p.id, p]));
      setReactionDetails(
        userIds
          .map((uid) => {
            const p = byId.get(uid);
            if (!p) return null;
            return {
              id: uid,
              name: p.name || 'Member',
              emojis: summaries.filter((s) => s.userIds.includes(uid)).map((s) => s.emoji),
            };
          })
          .filter((x): x is { id: string; name: string; emojis: string[] } => !!x)
      );
    } finally {
      setReactionDetailsLoading(false);
    }
  };

  const openReadReceiptDetails = (message: PlanGroupChatMessage) => {
    const details = getReadReceiptDetails(message);
    if (!details) return;
    setReadReceiptDetails(details);
    setReadReceiptDetailsVisible(true);
  };

  const renderMessage = ({ item }: { item: PlanGroupChatMessage }) => {
    if (item.deleted_at) return null;

    const isMe = item.user_id === user?.id;
    const sender = senders[item.user_id];
    const readReceipt = isMe ? getReadReceipt(item) : null;
    const allRead = !!readReceipt && readReceipt.readCount === readReceipt.total;
    const poll = normalizePlanGroupChatPoll(item.plan_group_chat_polls);
    const isPoll = item.message_kind === 'poll' && poll;
    const handleLongPress = () => {
      if (isPoll) return;
      const view = messageLayoutRefs.current[item.id];
      view?.measureInWindow((x, y, width, height) => {
        setMessageActionMenu({
          message: item,
          layout: { x, y, width, height },
        });
      });
    };
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={handleLongPress}
        delayLongPress={500}
        style={[styles.msgRow, isMe && styles.msgRowMe]}
      >
        {!isMe && (
          <CachedImage
            source={sender?.avatar_url ? { uri: sender.avatar_url } : ICONS.profileIcon}
            style={styles.msgAvatar}
            recyclingKey={item.user_id}
          />
        )}
        <View
          ref={(r) => {
            messageLayoutRefs.current[item.id] = r;
          }}
          style={[styles.msgWrapper, isMe && styles.msgWrapperMe]}
        >
          <View
            style={[
              styles.msgBubble,
              isPoll
                ? [styles.msgBubblePoll, isMe ? styles.msgBubblePollMe : styles.msgBubblePollOther]
                : isMe
                  ? styles.msgBubbleMe
                  : styles.msgBubbleOther,
            ]}
          >
            {!isMe && <Text style={styles.msgSenderName}>{sender?.name ?? 'Member'}</Text>}
            {isPoll && poll ? (
              <PlanGroupChatPollCard poll={poll} currentUserId={user?.id} onVoted={() => void refetch()} />
            ) : (
              <>
                {item.image_urls?.length > 0 && (
                  <View style={styles.msgImageRow}>
                    {item.image_urls.map((url, index) => (
                      <TouchableOpacity
                        key={url}
                        onPress={() => {
                          setGalleryImages(item.image_urls.map((u) => ({ uri: u })));
                          setGalleryIndex(index);
                          setIsGalleryVisible(true);
                        }}
                        activeOpacity={0.9}
                      >
                        <CachedImage source={{ uri: url }} style={styles.msgImage} recyclingKey={url} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {!!item.message && (
                  <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.message}</Text>
                )}
              </>
            )}
            <View style={styles.msgMetaRow}>
              <Text style={[styles.msgMeta, isMe && styles.msgMetaMe]}>
                {formatTime(new Date(item.created_at))}
                {item.edited_at ? ' · Edited' : ''}
              </Text>
              {readReceipt ? (
                <>
                  <Text style={[styles.msgMeta, isMe && styles.msgMetaMe]}> · </Text>
                  <TouchableOpacity
                    onPress={() => openReadReceiptDetails(item)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  >
                    <Text
                      style={[
                        styles.msgMeta,
                        styles.msgMetaReceipt,
                        isMe && styles.msgMetaMe,
                        allRead && styles.msgMetaAllRead,
                      ]}
                    >
                      {`Read by ${readReceipt.readCount}/${readReceipt.total}`}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          </View>
          {getReactions(item.id).length > 0 && (
            <View style={styles.reactionAnchor}>
              <ReactionDisplay
                reactions={getReactions(item.id)}
                currentUserEmoji={getCurrentUserEmoji(item.id)}
                compact
                onPressReactions={() => openReactionDetails(item.id)}
              />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (!id) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.errorTitle}>Chat not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ReactionPicker
        visible={!!reactionPickerState}
        anchorLayout={reactionPickerState?.layout ?? null}
        onSelect={handleReactionSelect}
        onClose={() => setReactionPickerState(null)}
      />
      <View style={styles.header}>
        <View style={[styles.headerSide, styles.headerSideLeft]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#FF8C42" />
            <Text style={styles.backBtnText}>Chats</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {meta?.plan_title || planTitle || 'Group Chat'}
          </Text>
          <Text style={styles.headerSubtitle}>Group Chat</Text>
        </View>
        <View style={[styles.headerSide, styles.headerSideRight]}>
          <TouchableOpacity
            style={styles.membersBtn}
            onPress={openMembers}
            disabled={!meta?.plan_id}
            accessibilityLabel="View chat members"
          >
            <Ionicons name="people-outline" size={22} color={meta?.plan_id ? '#FF8C42' : '#ccc'} />
          </TouchableOpacity>
        </View>
      </View>

      {!!meta && (
        <View style={styles.expiryBanner}>
          <Ionicons name="time-outline" size={14} color="#B25600" />
          <Text style={styles.expiryBannerText}>{expiryLabel}</Text>
        </View>
      )}

      <AppKeyboardAvoidingView
        style={{ flex: 1 }}
      >
        {loading && messages.length === 0 ? (
          <View style={styles.center}>
            <LoadingSpinner size={28} />
          </View>
        ) : loadError && messages.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={48} color="#ccc" />
            <Text style={styles.emptyTitle}>Could not load messages</Text>
            <Text style={styles.emptySubtitle}>{loadError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void refetch()}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="chatbubbles-outline" size={48} color="#ccc" />
            <Text style={styles.emptyTitle}>Say hi to the group</Text>
            <Text style={styles.emptySubtitle}>
              Anyone who has joined this plan can chat here until end of day.
            </Text>
          </View>
        ) : (
          <View style={styles.messagesListWrap}>
            <FlatList
              key={id}
              ref={listRef}
              style={styles.messagesList}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.list}
              initialNumToRender={Math.min(messages.length, 30)}
              onContentSizeChange={handleListContentSizeChange}
              onScroll={handleListScroll}
              scrollEventThrottle={16}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
            />
          </View>
        )}

        {/* Pending image previews */}
        {pendingImages.length > 0 && (
          <View style={styles.pendingImagesRow}>
            {pendingImages.map((uri) => (
              <View key={uri} style={styles.pendingImageWrap}>
                <CachedImage source={{ uri }} style={styles.pendingImage} />
                <TouchableOpacity
                  style={styles.pendingImageRemove}
                  onPress={() => setPendingImages((prev) => prev.filter((u) => u !== uri))}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.inputBar, { paddingBottom: inputBarBottomPad }]}>
          <TouchableOpacity onPress={onPickImages} style={styles.attachBtn}>
            <Ionicons name="image-outline" size={22} color="#FF8C42" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowPollModal(true)} style={styles.attachBtn}>
            <Ionicons name="bar-chart-outline" size={22} color="#FF8C42" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Type your message..."
            placeholderTextColor="#999"
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (sending || (!draft.trim() && pendingImages.length === 0)) && styles.sendBtnDisabled]}
            onPress={onSend}
            disabled={sending || (!draft.trim() && pendingImages.length === 0)}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </AppKeyboardAvoidingView>

      {/* Long-press action menu */}
      <Modal
        visible={!!messageActionMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setMessageActionMenu(null)}
      >
        <TouchableWithoutFeedback onPress={() => setMessageActionMenu(null)}>
          <View style={styles.messageActionOverlay}>
            {messageActionMenu && (
              <TouchableWithoutFeedback>
                <View
                  style={[
                    styles.messageActionMenu,
                    (() => {
                      const msg = messageActionMenu.message;
                      const own = msg.user_id === user?.id;
                      let rows = 2;
                      if (own) rows += 2;
                      const menuHeight = rows * 44 + 12;
                      const menuWidth = 176;
                      const left = Math.max(
                        8,
                        Math.min(
                          messageActionMenu.layout.x + messageActionMenu.layout.width / 2 - menuWidth / 2,
                          SCREEN_WIDTH - menuWidth - 8
                        )
                      );
                      const placeAbove = messageActionMenu.layout.y - menuHeight - 8 > 56;
                      const top = placeAbove
                        ? messageActionMenu.layout.y - menuHeight - 8
                        : messageActionMenu.layout.y + messageActionMenu.layout.height + 8;
                      return { left, top };
                    })(),
                  ]}
                >
                  <TouchableOpacity style={styles.messageActionRow} onPress={openReactionPickerFromMenu}>
                    <Ionicons name="happy-outline" size={16} color="#333" />
                    <Text style={styles.messageActionText}>React</Text>
                  </TouchableOpacity>
                  {messageActionMenu.message.user_id === user?.id && (
                    <>
                      <TouchableOpacity style={styles.messageActionRow} onPress={openEditFromMenu}>
                        <Ionicons name="pencil-outline" size={16} color="#333" />
                        <Text style={styles.messageActionText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.messageActionRow} onPress={confirmDeleteFromMenu}>
                        <Ionicons name="trash-outline" size={16} color="#C62828" />
                        <Text style={[styles.messageActionText, { color: '#C62828' }]}>Delete</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  <TouchableOpacity style={styles.messageActionRow} onPress={() => setMessageActionMenu(null)}>
                    <Ionicons name="close-outline" size={16} color="#666" />
                    <Text style={[styles.messageActionText, { color: '#666' }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            )}
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={reactionDetailsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionDetailsVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setReactionDetailsVisible(false)}>
          <View style={styles.messageActionOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.reactionDetailsModal}>
                {reactionDetailsLoading ? (
                  <ActivityIndicator size="small" color="#FF8C42" style={{ marginVertical: 12 }} />
                ) : reactionDetails.length === 0 ? (
                  <Text style={styles.reactionDetailsEmpty}>No reactions yet.</Text>
                ) : (
                  reactionDetails.map((u) => (
                    <View key={u.id} style={styles.reactionDetailsRow}>
                      <Text style={styles.reactionDetailsName}>{u.name}</Text>
                      <View style={styles.reactionDetailsEmojis}>
                        {u.emojis.map((e) => (
                          <Text key={e} style={styles.reactionDetailsEmoji}>
                            {e}
                          </Text>
                        ))}
                      </View>
                    </View>
                  ))
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={readReceiptDetailsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReadReceiptDetailsVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setReadReceiptDetailsVisible(false)}>
          <View style={styles.messageActionOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.readReceiptModal}>
                <Text style={styles.readReceiptTitle}>
                  Read by {readReceiptDetails?.readCount ?? 0} of {readReceiptDetails?.total ?? 0}
                </Text>
                {(readReceiptDetails?.read.length ?? 0) > 0 ? (
                  <>
                    <Text style={styles.readReceiptSectionLabel}>Read</Text>
                    {readReceiptDetails?.read.map((member) => (
                      <View key={member.id} style={styles.readReceiptRow}>
                        <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                        <Text style={styles.readReceiptName}>{member.name}</Text>
                      </View>
                    ))}
                  </>
                ) : null}
                {(readReceiptDetails?.unread.length ?? 0) > 0 ? (
                  <>
                    <Text style={styles.readReceiptSectionLabel}>Not yet</Text>
                    {readReceiptDetails?.unread.map((member) => (
                      <View key={member.id} style={styles.readReceiptRow}>
                        <Ionicons name="ellipse-outline" size={14} color="#bbb" />
                        <Text style={styles.readReceiptNameMuted}>{member.name}</Text>
                      </View>
                    ))}
                  </>
                ) : null}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <CreatePlanGroupChatPollModal
        visible={showPollModal}
        chatId={id}
        onClose={() => setShowPollModal(false)}
        onCreated={() => {
          void refetch();
          requestAnimationFrame(() => scrollToLatest(true));
        }}
      />

      <MessageEditModal
        visible={!!editingMessage}
        initialText={editingMessage?.message ?? ''}
        title="Edit message"
        onClose={() => setEditingMessage(null)}
        onSave={async (text) => {
          if (!editingMessage) return false;
          const ok = await updateMessage(editingMessage.id, text);
          if (ok) setEditingMessage(null);
          return ok;
        }}
      />

      <Modal
        visible={showMembersModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          membersSeqRef.current += 1;
          setShowMembersModal(false);
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            membersSeqRef.current += 1;
            setShowMembersModal(false);
          }}
        >
          <View style={styles.membersOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.membersCard}>
                <View style={styles.membersHeader}>
                  <Text style={styles.membersTitle}>
                    {membersLoading
                      ? 'Members'
                      : members.length === 1
                        ? '1 member'
                        : `${members.length} members`}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      membersSeqRef.current += 1;
                      setShowMembersModal(false);
                    }}
                  >
                    <Ionicons name="close" size={20} color="#666" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.membersSubtitle}>
                  Everyone who has joined this plan can access the chat.
                </Text>
                {membersLoading ? (
                  <ActivityIndicator size="small" color="#FF8C42" style={{ marginVertical: 18 }} />
                ) : members.length === 0 ? (
                  <Text style={styles.membersEmpty}>No members yet.</Text>
                ) : (
                  <ScrollView style={styles.membersList} showsVerticalScrollIndicator={false}>
                    {members.map((person) => {
                      const isHost = person.id === meta?.creator_id;
                      return (
                        <TouchableOpacity
                          key={person.id}
                          style={styles.memberRow}
                          onPress={() => openMemberProfile(person)}
                        >
                          <CachedImage
                            source={person.avatar_url ? { uri: person.avatar_url } : ICONS.profileIcon}
                            style={styles.memberAvatar}
                            recyclingKey={person.id}
                          />
                          <Text style={styles.memberName}>{person.name}</Text>
                          {isHost ? (
                            <View style={styles.hostBadge}>
                              <Text style={styles.hostBadgeText}>Host</Text>
                            </View>
                          ) : null}
                          <Ionicons name="chevron-forward" size={16} color="#ccc" />
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <ImageView
        images={galleryImages}
        imageIndex={galleryIndex}
        visible={isGalleryVisible}
        onRequestClose={() => setIsGalleryVisible(false)}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerSide: {
    flexShrink: 0,
    justifyContent: 'center',
  },
  headerSideLeft: { width: 72, alignItems: 'flex-start' },
  headerSideRight: { width: 40, alignItems: 'flex-end' },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backBtnText: { color: '#FF8C42', fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#222', textAlign: 'center', width: '100%' },
  headerSubtitle: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#999', marginTop: 1, textAlign: 'center' },
  membersBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  membersOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  membersCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
  },
  membersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  membersTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#333' },
  membersSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#777',
    marginBottom: 8,
  },
  membersEmpty: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    paddingVertical: 8,
  },
  membersList: { maxHeight: 320 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1F1',
  },
  memberAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EEE' },
  memberName: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium', color: '#333' },
  hostBadge: {
    backgroundColor: '#FFF3E8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  hostBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#B25600' },
  expiryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF3E8',
    borderBottomWidth: 1,
    borderBottomColor: '#F8E0C6',
  },
  expiryBannerText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#B25600' },
  messagesListWrap: {
    flex: 1,
    position: 'relative',
  },
  messagesList: {
    flex: 1,
  },
  list: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    padding: 12,
  },
  msgRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
  msgWrapper: { position: 'relative', maxWidth: '78%', flexShrink: 1 },
  msgWrapperMe: { alignSelf: 'flex-end' },
  msgBubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  msgBubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee' },
  msgBubbleMe: { backgroundColor: '#FF8C42' },
  msgBubblePoll: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
  },
  msgBubblePollMe: {},
  msgBubblePollOther: {},
  msgSenderName: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#FF8C42', marginBottom: 2 },
  msgText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#222', lineHeight: 19 },
  msgTextMe: { color: '#fff' },
  msgDeleted: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#aaa', fontStyle: 'italic' },
  msgMeta: { fontSize: 10, fontFamily: 'Inter_400Regular', color: '#999' },
  msgMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4 },
  msgMetaMe: { color: 'rgba(255,255,255,0.85)' },
  msgMetaReceipt: { textDecorationLine: 'underline' },
  msgMetaAllRead: { color: '#FFE2B5' },
  reactionAnchor: {
    position: 'absolute',
    bottom: -8,
    right: -4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  messageActionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  messageActionMenu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 176,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  messageActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  messageActionText: { fontSize: 15, fontFamily: 'Inter_500Medium', color: '#333' },
  reactionDetailsModal: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    minWidth: '70%',
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignSelf: 'center',
    marginTop: '40%',
  },
  reactionDetailsEmpty: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#666', paddingVertical: 8 },
  reactionDetailsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  reactionDetailsName: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#111' },
  reactionDetailsEmojis: { flexDirection: 'row', marginLeft: 8 },
  reactionDetailsEmoji: { fontSize: 18, marginLeft: 4 },
  readReceiptModal: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    minWidth: '70%',
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignSelf: 'center',
    marginTop: '40%',
  },
  readReceiptTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#111',
    marginBottom: 12,
  },
  readReceiptSectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
    marginBottom: 6,
  },
  readReceiptRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  readReceiptName: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#111' },
  readReceiptNameMuted: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#666' },
  msgImageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  msgImage: { width: 140, height: 140, borderRadius: 8 },
  pendingImagesRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  pendingImageWrap: { position: 'relative' },
  pendingImage: { width: 56, height: 56, borderRadius: 6 },
  pendingImageRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 8,
  },
  attachBtn: { padding: 8 },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#222',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FF8C42',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#333', marginTop: 12 },
  emptySubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#777', textAlign: 'center', marginTop: 4 },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FF8C42',
  },
  retryBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  errorTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#333', textAlign: 'center', marginTop: 24 },
});
