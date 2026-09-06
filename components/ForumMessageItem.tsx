import React, { useEffect, useRef } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CachedImage } from '@/components/CachedImage';
import { router } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  interpolateColor,
} from 'react-native-reanimated';
import RepliedToMessage from './RepliedToMessage';
import { ReactionDisplay } from './ReactionDisplay';
import { ForumPollCard, normalizeForumPoll } from './ForumPollCard';
import { ForumOpenTextPollCard } from './ForumOpenTextPollCard';
import { ICONS } from '@/lib/helperUtils';
import type { ReactionSummary } from '@/hooks/useMessageReactions';
import { ForumMentionText } from '@/components/ForumMentionText';
import type { MentionLookupEntry } from '@/lib/forumMentions';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const ForumMessageItem = React.memo(
  ({
    item,
    currentUserId,
    profileName,
    messages,
    highlightedId,
    skillLevel,
    onLongPress,
    reactions = [],
    currentUserEmoji = null,
    onOpenGallery,
    onScrollToMessage,
    onRemoveReaction,
    onPressReactions,
    onForumPollChanged,
    mentionEntries = [],
    onMentionPress,
    onMentionPressUnknown,
  }: {
    item: any;
    currentUserId?: string;
    profileName?: string;
    messages: any[];
    highlightedId?: string | null;
    skillLevel?: string;
    onLongPress: (message: any, layout?: { x: number; y: number; width: number; height: number }) => void;
    reactions?: ReactionSummary[];
    currentUserEmoji?: string | null;
    onOpenGallery: (urls: string[], index: number) => void;
    onScrollToMessage: (id: string) => void;
    onRemoveReaction?: (messageId: string, emoji: string) => void;
    onPressReactions?: (messageId: string) => void;
    onForumPollChanged?: () => void;
    mentionEntries?: MentionLookupEntry[];
    onMentionPress: (userId: string, displayName: string) => void;
    onMentionPressUnknown?: (displayName: string) => void;
  }) => {
    const isMe =
      item.profiles?.name?.toLowerCase() === profileName?.toLowerCase();
    const userName = isMe ? 'You' : item.profiles?.name || 'Unknown';
    const avatarUrl = item.profiles?.avatar_url ?? null;
    const hasImages = item.image_urls && item.image_urls.length > 0;
    const poll = normalizeForumPoll(item.forum_polls);
    const isPoll = item.message_kind === 'poll' && poll;
    // 1. Shared Value for animation (0 = normal, 1 = highlighted)
    const highlightProgress = useSharedValue(0);

    // 2. Trigger Animation when ID matches
    useEffect(() => {
      if (highlightedId === item.id) {
        // Sequence: Fade In -> Wait -> Fade Out
        highlightProgress.value = withSequence(
          withTiming(1, { duration: 300 }),
          withDelay(1000, withTiming(0, { duration: 500 }))
        );
      }
    }, [highlightedId, item.id]);

    // 3. Animated Style (Interpolate Color)
    const animatedStyle = useAnimatedStyle(() => {
      const backgroundColor = interpolateColor(
        highlightProgress.value,
        [0, 1],
        ['white', '#FFF3E0']
      );
      return { backgroundColor };
    });

    const getUserSkillLevel = () => {
      // For my own messages, trust the skill level passed in from the current activity store.
      if (isMe) return skillLevel;

      // For other people, look up their skill for THIS activity specifically.
      const skills = item.profiles?.user_activity_skills as
        | { skill_level: string; activity_id: string }[]
        | undefined;

      if (skills && skills.length > 0) {
        // Prefer the skill row that matches the forum message's activity_id.
        const forThisActivity = skills.find(
          (s) => s.activity_id === item.activity_id
        );
        if (forThisActivity?.skill_level) {
          return forThisActivity.skill_level;
        }
        // Fallback: first available skill_level if, for some reason, activity_id doesn't match.
        if (skills[0].skill_level) {
          return skills[0].skill_level;
        }
      }

      // Final fallback so the UI always has a value.
      return 'Intermediate';
    };

    const getSkillColor = (rawLevel: string) => {
      const s = (rawLevel || '').trim();
      const normalized = s
        ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
        : 'Beginner';
      switch (normalized) {
        case 'Beginner':
          return '#4CAF50';
        case 'Intermediate':
          return '#FFCF56';
        case 'Advanced':
          return '#FF8C42';
        default:
          return '#999';
      }
    };

    const userSkillLevel = getUserSkillLevel();

    const formatDateTime = (isoString?: string | null) => {
      if (!isoString) return '';
      const d = new Date(isoString);
      if (Number.isNaN(d.getTime())) return '';
      const base = d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      return item.edited_at ? `${base} · Edited` : base;
    };
    const replyTarget = item.reply_to_id
      ? messages.find((msg: any) => msg.id === item.reply_to_id)
      : null;
    const replyUnavailable =
      !!item.reply_to_id && (!replyTarget || !!replyTarget.deleted_at);
    const replyToMessage =
      replyTarget && !replyTarget.deleted_at ? replyTarget : null;

    const containerRef = useRef<View>(null);

    const handleLongPress = () => {
      containerRef.current?.measureInWindow((x, y, width, height) => {
        onLongPress(item, { x, y, width, height });
      });
    };

    return (
      <View ref={containerRef} collapsable={false} style={styles.messageWrapper}>
        <AnimatedPressable
          style={[styles.messageContainer, { gap: 10 }, animatedStyle]}
          onPress={() => Keyboard.dismiss()}
          onLongPress={handleLongPress}
          delayLongPress={500}
        >
          <View style={styles.messageContent}>
            <TouchableOpacity
              onPress={() => {
                if (item.user_id && item.user_id !== currentUserId) {
                  router.push({
                    pathname: '/(tabs)/people/[id]',
                    params: { id: item.user_id, name: item.profiles?.name, from: 'forum' },
                  });
                }
              }}
              disabled={!item.user_id || item.user_id === currentUserId}
            >
              <CachedImage
                source={avatarUrl ? { uri: avatarUrl } : ICONS.profileIcon}
                style={styles.messageAvatar}
                recyclingKey={item.user_id}
                displayPreset="avatar"
              />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <View style={styles.messageHeader}>
                <TouchableOpacity
                  disabled={!item.user_id || item.user_id === currentUserId}
                  onPress={() => {
                    if (item.user_id && item.user_id !== currentUserId) {
                      router.push({
                        pathname: '/(tabs)/people/[id]',
                        params: { id: item.user_id, name: item.profiles?.name, from: 'forum' },
                      });
                    }
                  }}
                >
                  <Text
                    style={[styles.userName, !isMe && styles.clickableUserName]}
                  >
                    {userName}
                  </Text>
                </TouchableOpacity>
                <View
                  style={[
                    styles.skillDot,
                    { backgroundColor: getSkillColor(userSkillLevel ?? 'Beginner') },
                  ]}
                />
              </View>
              {item.message && !isPoll ? (
                <ForumMentionText
                  text={item.message}
                  mentionEntries={mentionEntries}
                  style={styles.messageText}
                  onMentionPress={onMentionPress}
                  onMentionPressUnknown={onMentionPressUnknown}
                />
              ) : null}

              {isPoll && poll ? (
                poll.poll_style === 'open_text' ? (
                  <ForumOpenTextPollCard
                    poll={poll}
                    currentUserId={currentUserId}
                    onResponded={onForumPollChanged}
                  />
                ) : (
                  <ForumPollCard
                    poll={poll}
                    currentUserId={currentUserId}
                    onVoted={onForumPollChanged}
                  />
                )
              ) : null}

              {!!item.created_at && (
                <Text style={styles.timestampText}>{formatDateTime(item.created_at)}</Text>
              )}

              {hasImages && (
                <View style={styles.imageGrid}>
                  {item.image_urls.map((url: string, index: number) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => onOpenGallery(item.image_urls, index)}
                      activeOpacity={0.9}
                    >
                      <CachedImage
                        source={{ uri: url }}
                        style={[
                          styles.messageImage,
                          item.image_urls.length > 1
                            ? styles.gridImage
                            : styles.singleImage,
                        ]}
                        recyclingKey={url}
                        displayPreset="chat"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          {replyUnavailable ? (
            <View style={styles.replyUnavailable}>
              <Text style={styles.replyUnavailableText}>Original message unavailable</Text>
            </View>
          ) : replyToMessage ? (
            <RepliedToMessage
              replyToId={item.reply_to_id}
              replyToMessage={replyToMessage}
              messageItem={item}
              scrollToMessage={onScrollToMessage}
            />
          ) : null}
        </AnimatedPressable>

        {reactions.length > 0 && (
          <View style={styles.reactionAnchor} pointerEvents="box-none">
            <ReactionDisplay
              reactions={reactions}
              currentUserEmoji={currentUserEmoji}
              compact
              onPressReactions={onPressReactions ? () => onPressReactions(item.id) : undefined}
            />
          </View>
        )}
      </View>
    );
  }
);

export default ForumMessageItem;

const styles = StyleSheet.create({
  messageWrapper: {
    position: 'relative',
    overflow: 'visible',
  },
  replyUnavailable: {
    borderLeftWidth: 2,
    borderLeftColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
    padding: 7,
    borderRadius: 8,
    marginBottom: 6,
  },
  replyUnavailableText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#999',
    fontStyle: 'italic',
  },
  messageContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ececec',
  },
  reactionAnchor: {
    position: 'absolute',
    bottom: 4,
    right: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  messageAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  messageContent: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  userName: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#222',
    marginRight: 6,
  },
  clickableUserName: {
    color: '#1565C0',
    textDecorationLine: 'underline',
  },
  skillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  skillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  skillText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  timestamp: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#aaa',
    marginLeft: 'auto',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  timestampText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#b0b0b0',
    marginTop: 3,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  messageImage: {
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  singleImage: {
    width: 200,
    height: 200,
    resizeMode: 'cover',
  },
  gridImage: {
    width: 80,
    height: 80,
    resizeMode: 'cover',
  },
});
