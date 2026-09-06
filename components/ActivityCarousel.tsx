import React, {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type RefObject,
} from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, Dimensions, TouchableOpacity, Alert, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useActivityStore } from '@/store/useActivityStore';
import { useProfile } from '@/hooks/useProfile';
import { useActivities, EXCLUDED_ACTIVITY_NAMES } from '@/hooks/useActivities';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useActivityBadgeStore } from '@/store/useActivityBadgeStore';
import { ActivitySelectionModal } from '@/components/ActivitySelectionModal';

export { PLANS_LAST_SEEN_KEY } from '@/lib/activityStorageKeys';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_WIDTH = 70;
const ITEM_SPACING = 10;
const ITEM_SLOT = ITEM_WIDTH + ITEM_SPACING;
const SMALL_ITEM_WIDTH = 56;
const SMALL_ITEM_SPACING = 10;
const SMALL_ITEM_SLOT = SMALL_ITEM_WIDTH + SMALL_ITEM_SPACING;
const CENTER_OFFSET = (SCREEN_WIDTH - ITEM_WIDTH) / 2;
const FIRST_ITEM_CENTER_X = CENTER_OFFSET + ITEM_SLOT / 2;

/** Android edge-to-edge often reports 0 bottom inset; keep carousel above system nav. */
const ANDROID_CAROUSEL_BOTTOM_PADDING = 24;

interface UserActivity {
  id: string;
  activity_id: string;
  skill_level: string;
  activities: {
    name: string;
    emoji: string;
  };
}

interface ActivityItem {
  id: string;
  activity_id: string;
  name: string;
  emoji: string;
  skill_level?: string;
}

interface ActivityCarouselProps {
  /** Show minus/plus add-remove row (Plans & Forum) */
  showAddRemove?: boolean;
  /** Which unread counts to show: forum messages (Forum tab) or new plans (Plans tab). Default: plans when showAddRemove, else forum. */
  notificationSource?: 'forum' | 'plans';
  /** Tutorial: measure carousel row in window coordinates */
  tutorialCarouselTargetRef?: RefObject<View | null>;
  onTutorialCarouselTargetLayout?: () => void;
  /** Tutorial: selected activity name under emoji (Forum / Plans bubbles) */
  tutorialSelectedActivityNameRef?: RefObject<View | null>;
  onTutorialSelectedActivityNameLayout?: () => void;
  /**
   * Forum / Plans: extra px below the top of the white strip so emoji row sits lower.
   * Applied as explicit paddingTop (not outer margin) so layout always updates.
   */
  extraStripTopInset?: number;
  /** When provided in showAddRemove mode, renders a chat bubble button to the right of the carousel. */
  onChatPress?: () => void;
  /** Bottom padding to apply to the strip (e.g. safe area inset). */
  bottomInset?: number;
  /** Render the donut/wheel style (animated scale + oval track + circle buttons). */
  wheelMode?: boolean;
}

export function ActivityCarousel({
  showAddRemove = false,
  notificationSource,
  tutorialCarouselTargetRef,
  onTutorialCarouselTargetLayout,
  tutorialSelectedActivityNameRef,
  onTutorialSelectedActivityNameLayout,
  extraStripTopInset = 0,
  onChatPress,
  bottomInset = 0,
  wheelMode = false,
}: ActivityCarouselProps = {}) {
  const carouselBottomPadding =
    Platform.OS === 'android'
      ? Math.max(ANDROID_CAROUSEL_BOTTOM_PADDING, bottomInset)
      : Math.max(10, bottomInset);
  const badgeSource: 'forum' | 'plans' = notificationSource ?? (showAddRemove ? 'plans' : 'forum');
  const forumUnreadByActivity = useActivityBadgeStore((s) => s.forumUnreadByActivity);
  const newPlansByActivity = useActivityBadgeStore((s) => s.newPlansByActivity);
  const unreadCounts = badgeSource === 'plans' ? newPlansByActivity : forumUnreadByActivity;
  const activityId = useActivityStore((s) => s.activityId);
  const setActivity = useActivityStore((s) => s.setActivity);
  const setActivityWithPendingAlign = useActivityStore((s) => s.setActivityWithPendingAlign);
  const pendingAlignActivityId = useActivityStore((s) => s.pendingAlignActivityId);
  const setPendingAlignActivityId = useActivityStore((s) => s.setPendingAlignActivityId);
  const { user } = useAuth();
  const { userSkills, loading: profileLoading, refetch, removeActivity } = useProfile();
  const { activities: allActivities, loading: activitiesLoading } = useActivities();

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollXAnimated = useRef(new Animated.Value(0)).current;
  const itemCentersRef = useRef<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showRemovePicker, setShowRemovePicker] = useState(false);
  /** When showAddRemove is true, the carousel lives in a narrow slot; we use this for spacer and scroll math. */
  const [carouselSlotWidth, setCarouselSlotWidth] = useState(SCREEN_WIDTH);

  // Track scrolling state to prevent loops
  const isScrollingRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  /** After a tap we use this index in handleScrollEnd so scroll-end doesn't overwrite with wrong item. */
  const lastTappedIndexRef = useRef<number | null>(null);
  // Only show "Loading activities..." on true first load, not when switching activities
  const hasLoadedOnceRef = useRef(false);

  // When logged in: show user's activities
  // When not logged in: show all activities
  const displayActivities: ActivityItem[] = useMemo(() => {
    if (user) {
      // User is logged in - show their activities
    if (!userSkills || userSkills.length === 0) return [];
    const filtered = userSkills?.filter(
      (skill: any) => skill.activities && !EXCLUDED_ACTIVITY_NAMES.includes(skill.activities.name)
    ) as unknown as UserActivity[];
      return filtered.map(skill => ({
        id: skill.id,
        activity_id: skill.activity_id,
        name: skill.activities.name,
        emoji: skill.activities.emoji,
        skill_level: skill.skill_level,
      })).sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
      return nameA.localeCompare(nameB);
    });
    } else {
      // User is not logged in - show all activities (allActivities already filtered in useActivities)
      if (!allActivities || allActivities.length === 0) return [];
      return allActivities.filter(a => !EXCLUDED_ACTIVITY_NAMES.includes(a.name)).map(activity => ({
        id: activity.id,
        activity_id: activity.id,
        name: activity.name,
        emoji: activity.emoji,
      }));
    }
  }, [user, userSkills, allActivities]);

  if (displayActivities.length > 0) hasLoadedOnceRef.current = true;

  const selectedActivityIds = useMemo(
    () => (user && userSkills ? userSkills.map((s: any) => s.activity_id).filter(Boolean) : []),
    [user, userSkills]
  );

  const handleConfirmRemove = useCallback(
    (activityIdToRemove: string, activityName: string) => {
      setShowRemovePicker(false);
      Alert.alert(
        `Remove ${activityName}?`,
        'Are you sure you want to remove this activity from your profile?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              await removeActivity(activityIdToRemove);
              refetch();
            },
          },
        ]
      );
    },
    [removeActivity, refetch]
  );

  // When showAddRemove is true, the carousel is in a narrow slot and uses homepage (small) item size.
  // Wheel mode uses its own sizing (52px items + 8px gap = 60px slot).
  const WHEEL_ITEM_SLOT_CONST = 60; // must match what's used in wheelMode render
  const effectiveViewportWidth = showAddRemove ? carouselSlotWidth : SCREEN_WIDTH;
  const itemWidth = (showAddRemove && wheelMode) ? 52 : showAddRemove ? SMALL_ITEM_WIDTH : ITEM_WIDTH;
  const itemSlot = (showAddRemove && wheelMode) ? WHEEL_ITEM_SLOT_CONST : showAddRemove ? SMALL_ITEM_SLOT : ITEM_SLOT;
  const centerOffsetDynamic = (effectiveViewportWidth - itemWidth) / 2;
  const firstItemCenterXDynamic = centerOffsetDynamic + itemSlot / 2;

  // Clear stored centers when the list changes so we don't use stale positions
  useEffect(() => {
    itemCentersRef.current = [];
  }, [displayActivities.length]);

  // Listen for Real-time database changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user_activity_skills_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_activity_skills',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          refetch();
        }
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [user, refetch]);

  // scroll calculation with offset (accounts for leading spacer); uses slot width when in add/remove row
  const scrollToIndex = (index: number, animated = true) => {
    if (scrollViewRef.current) {
      isAutoScrollingRef.current = true;

      const knownCenter = itemCentersRef.current[index];
      const offset =
        typeof knownCenter === 'number'
          ? Math.max(0, knownCenter - effectiveViewportWidth / 2)
          : Math.max(0, firstItemCenterXDynamic + index * itemSlot - effectiveViewportWidth / 2);

      scrollViewRef.current.scrollTo({
        x: offset,
        animated: animated,
      });

      // For instant snaps, sync the Animated.Value directly: onScroll may not fire
      // when contentSize changes simultaneously (e.g. after removing an activity),
      // which would leave the new active emoji visually faded.
      if (!animated) {
        scrollXAnimated.setValue(offset);
      }

      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 500);
    }
  };

  // When carousel slot width is measured (Plans/Forum), re-center the current item so selector stays correct
  useEffect(() => {
    if (!showAddRemove || displayActivities.length === 0) return;
    itemCentersRef.current = [];
    const idx = currentIndex;
    requestAnimationFrame(() => {
      scrollToIndex(idx, false);
    });
  }, [carouselSlotWidth, showAddRemove]);

  const handlePressActivity = (index: number) => {
    if (index < 0 || index >= displayActivities.length) return;
    const selected = displayActivities[index];

    if (index !== currentIndex) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    useActivityStore.getState().markExplicitCarouselSelection();
    lastTappedIndexRef.current = index;
    // Clear after scroll-end has had time to run (longer than isAutoScrollingRef 500ms)
    // so tap selection isn't overwritten when itemCentersRef was empty (e.g. after adding new activity)
    setTimeout(() => {
      lastTappedIndexRef.current = null;
    }, 1000);

    setCurrentIndex(index);
    scrollToIndex(index, true);

    setActivity({
      activityId: selected.activity_id,
      activity: selected.name,
      skillLevel: selected.skill_level || 'Beginner',
      emoji: selected.emoji,
    });
  };

  useEffect(() => {
    if (displayActivities.length === 0) return;
    // User just tapped an activity on any carousel — don't let other mounted instances fight the store.
    if (Date.now() < useActivityStore.getState().explicitCarouselSelectionUntil) return;
    // Don't override selection when user just tapped an item on this instance.
    if (lastTappedIndexRef.current !== null) return;

    const foundIndex = displayActivities.findIndex(
      (activity) => activity.activity_id === activityId
    );

    if (foundIndex >= 0) {
      const atCurrentSlot = displayActivities[currentIndexRef.current]?.activity_id;
      const storeDoesNotMatchCarousel = atCurrentSlot !== activityId;
      // If global store says X but the centered slot is another activity, force scroll (e.g. after add-activity lag).
      if (storeDoesNotMatchCarousel || (foundIndex !== currentIndexRef.current && !isScrollingRef.current)) {
        setCurrentIndex(foundIndex);
        scrollToIndex(foundIndex, false);
      }
      // New activity is in the carousel — release the align lock so scroll can change selection.
      if (pendingAlignActivityId && pendingAlignActivityId === activityId) {
        setPendingAlignActivityId(null);
      }
    } else {
      // List doesn't include store's activity yet (refetch after add) — never clobber store with "first item".
      if (activityId && pendingAlignActivityId === activityId) {
        return;
      }
      // Still loading profile/skills — wait before assuming the activity was removed.
      if (user && profileLoading) {
        return;
      }
      // Confirmed missing after load (e.g. removed from profile): fall back to first.
      const firstActivity = displayActivities[0];
      if (firstActivity && activityId !== firstActivity.activity_id) {
        setPendingAlignActivityId(null);
        setCurrentIndex(0);
        scrollToIndex(0, false);
        setActivity({
          activityId: firstActivity.activity_id,
          activity: firstActivity.name,
          skillLevel: firstActivity.skill_level || 'Beginner',
          emoji: firstActivity.emoji,
        });
      }
    }
  }, [
    activityId,
    pendingAlignActivityId,
    displayActivities,
    setActivity,
    setPendingAlignActivityId,
    user,
    profileLoading,
  ]);

  // Re-measure selected activity label when selection changes (tutorial arrow)
  useEffect(() => {
    if (!tutorialSelectedActivityNameRef || !onTutorialSelectedActivityNameLayout) return;
    const id = requestAnimationFrame(() => onTutorialSelectedActivityNameLayout());
    const t = setTimeout(onTutorialSelectedActivityNameLayout, 120);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, [currentIndex, tutorialSelectedActivityNameRef, onTutorialSelectedActivityNameLayout]);

  const handleScrollEnd = (event: any) => {
    if (displayActivities.length === 0) return;
    if (isAutoScrollingRef.current) return;

    isScrollingRef.current = true;
    const offsetX = event.nativeEvent.contentOffset.x;

    let clampedIndex: number;
    const tappedIndex = lastTappedIndexRef.current;
    if (tappedIndex !== null) {
      clampedIndex = Math.max(0, Math.min(tappedIndex, displayActivities.length - 1));
      // Don't clear ref here so a second scroll-end (e.g. momentum) also uses tap index; timeout clears it
    } else {
      const viewportCenterX = offsetX + effectiveViewportWidth / 2;
      const rawIndex = Math.round((viewportCenterX - firstItemCenterXDynamic) / itemSlot);
      clampedIndex = Math.max(
        0,
        Math.min(rawIndex, displayActivities.length - 1)
      );
    }

    const selected = displayActivities[clampedIndex];
    // Always align global store with whichever item is centered — fixes mismatch when index
    // matched local state but activityId was still stale (e.g. scroll-end skipped during auto-scroll).
    if (selected) {
      if (clampedIndex !== currentIndex) {
        setCurrentIndex(clampedIndex);
      }
      if (selected.activity_id !== activityId) {
        const pending = useActivityStore.getState().pendingAlignActivityId;
        // While the new activity row is still loading, ignore scroll-end that lands on a different item.
        const waitingForPendingRow =
          pending && activityId === pending && selected.activity_id !== pending &&
          !displayActivities.some((a) => a.activity_id === pending);
        if (!waitingForPendingRow) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setActivity({
            activityId: selected.activity_id,
            activity: selected.name,
            skillLevel: selected.skill_level || 'Beginner',
            emoji: selected.emoji,
          });
        }
      }
    }

    setTimeout(() => {
      isScrollingRef.current = false;
    }, 100);
  };

  const isLoading = user ? profileLoading : activitiesLoading;

  if (isLoading && displayActivities.length === 0 && !hasLoadedOnceRef.current) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading activities...</Text>
        </View>
      </View>
    );
  }

  if (displayActivities.length === 0 && !showAddRemove) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {user ? 'No activities selected' : 'No activities available'}
          </Text>
          <Text style={styles.emptySubtext}>
            {user 
              ? 'Add activities from your Profile tab'
              : 'Please try again later'}
          </Text>
        </View>
      </View>
    );
  }

  const scrollContentStyle = showAddRemove
    ? [styles.scrollContent, styles.scrollContentAddRemove]
    : styles.scrollContent;
  const carouselContent = (
    <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={scrollContentStyle}
        snapToInterval={itemSlot}
        decelerationRate="fast"
        onScrollEndDrag={handleScrollEnd}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        bounces={true}
      >
        {/* Spacer at start: center first item in viewport (full screen or carousel slot) */}
        <View style={{ width: centerOffsetDynamic }} />

        {displayActivities.map((activity, index) => {
          const isSelected = index === currentIndex;
          const unreadCount = unreadCounts[activity.activity_id] || 0;
          return (
            <TouchableOpacity
              key={`${activity.id}-${activity.activity_id}`}
              style={[
                styles.itemContainer,
                showAddRemove && {
                  width: SMALL_ITEM_WIDTH,
                  marginHorizontal: SMALL_ITEM_SPACING / 2,
                },
              ]}
              activeOpacity={0.8}
              onPress={() => handlePressActivity(index)}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                itemCentersRef.current[index] = x + width / 2;
              }}
            >
              <View
                style={[
                  styles.activityItem,
                  showAddRemove && {
                    width: SMALL_ITEM_WIDTH,
                    height: SMALL_ITEM_WIDTH - 4,
                    borderRadius: 16,
                    marginTop: 2,
                  },
                  isSelected && styles.activityItemSelected,
                  { opacity: isSelected ? 1 : 0.35 },
                ]}
              >
                <Text style={[styles.emoji, showAddRemove && { fontSize: 28 }]}>
                  {activity.emoji}
                </Text>
                {unreadCount > 0 && (
                  <View style={[styles.unreadBadge, showAddRemove && { top: 4, right: 4, minWidth: 14, height: 14, borderRadius: 7 }]}>
                    <Text style={styles.unreadBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              {isSelected && tutorialSelectedActivityNameRef ? (
                <View
                  ref={tutorialSelectedActivityNameRef}
                  collapsable={false}
                  onLayout={() => onTutorialSelectedActivityNameLayout?.()}
                  /** Shrink-wrap label so tutorial tail X matches text (Plans/Forum), not full item width. */
                  style={styles.activityNameMeasureWrap}
                >
                  <Text
                    style={[styles.activityName, styles.activityNameSelected]}
                    numberOfLines={1}
                  >
                    {activity.name}
                  </Text>
                </View>
              ) : (
                <Text
                  style={[
                    styles.activityName,
                    isSelected && styles.activityNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {activity.name}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Spacer at end */}
        <View style={{ width: centerOffsetDynamic }} />
      </ScrollView>
  );

  if (showAddRemove) {
    const hasActivities = displayActivities.length > 0;

    // ── Wheel mode: animated donut carousel ──────────────────────────────
    if (wheelMode) {
      // Smaller items so more are visible = stronger wheel illusion
      const WHEEL_ITEM_W = 52;
      const WHEEL_ITEM_GAP = 8;
      const WHEEL_ITEM_SLOT = WHEEL_ITEM_W + WHEEL_ITEM_GAP;

      // Build animated wheel scroll content
      const wheelContent = (
        <View style={styles.wheelTrackContainer}>
          {/* Oval "donut" track — the visible ring the icons sit on */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill} >
            <View style={styles.wheelOval} />
          </View>

          <Animated.ScrollView
            ref={scrollViewRef as any}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={WHEEL_ITEM_SLOT}
            decelerationRate="fast"
            onScrollEndDrag={handleScrollEnd}
            onMomentumScrollEnd={handleScrollEnd}
            scrollEventThrottle={16}
            bounces={false}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollXAnimated } } }],
              { useNativeDriver: true }
            )}
            contentContainerStyle={styles.wheelScrollContent}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0) setCarouselSlotWidth(w);
            }}
          >
            {/* Leading spacer so first item centers */}
            <View style={{ width: (carouselSlotWidth - WHEEL_ITEM_W) / 2 }} />

            {displayActivities.map((activity, index) => {
              const isSelected = index === currentIndex;
              const unreadCount = unreadCounts[activity.activity_id] || 0;
              // scrollX when item i is centered = i * WHEEL_ITEM_SLOT
              const sc = index * WHEEL_ITEM_SLOT;

              // Scale: gentle falloff so side items stay visible
              const scale = scrollXAnimated.interpolate({
                inputRange: [sc - 3 * WHEEL_ITEM_SLOT, sc - 2 * WHEEL_ITEM_SLOT, sc - WHEEL_ITEM_SLOT, sc, sc + WHEEL_ITEM_SLOT, sc + 2 * WHEEL_ITEM_SLOT, sc + 3 * WHEEL_ITEM_SLOT],
                outputRange:                   [0.52,                 0.68,                 0.84,              1.0,   0.84,                  0.68,                  0.52],
                extrapolate: 'clamp',
              });

              // Opacity: center=1, edges stay fairly visible
              const opacity = scrollXAnimated.interpolate({
                inputRange: [sc - 3 * WHEEL_ITEM_SLOT, sc - 2 * WHEEL_ITEM_SLOT, sc - WHEEL_ITEM_SLOT, sc, sc + WHEEL_ITEM_SLOT, sc + 2 * WHEEL_ITEM_SLOT, sc + 3 * WHEEL_ITEM_SLOT],
                outputRange:                   [0.40,                 0.60,                 0.80,              1.0,   0.80,                  0.60,                  0.40],
                extrapolate: 'clamp',
              });

              // rotateY: subtle twist on iOS; Android native driver can hide items
              const rotateY = Platform.OS === 'android'
                ? '0deg'
                : scrollXAnimated.interpolate({
                    inputRange: [sc - 3 * WHEEL_ITEM_SLOT, sc - 2 * WHEEL_ITEM_SLOT, sc - WHEEL_ITEM_SLOT, sc, sc + WHEEL_ITEM_SLOT, sc + 2 * WHEEL_ITEM_SLOT, sc + 3 * WHEEL_ITEM_SLOT],
                    outputRange:         ['-30deg',               '-20deg',               '-10deg',          '0deg',    '10deg',               '20deg',               '30deg'],
                    extrapolate: 'clamp',
                  });

              // translateY: very gentle arc
              const translateY = scrollXAnimated.interpolate({
                inputRange: [sc - 2 * WHEEL_ITEM_SLOT, sc - WHEEL_ITEM_SLOT, sc, sc + WHEEL_ITEM_SLOT, sc + 2 * WHEEL_ITEM_SLOT],
                outputRange:         [-4,                    -2,               0,      -2,                    -4],
                extrapolate: 'clamp',
              });

              return (
                <TouchableOpacity
                  key={`${activity.id}-${activity.activity_id}`}
                  style={{ width: WHEEL_ITEM_W, marginHorizontal: WHEEL_ITEM_GAP / 2, alignItems: 'center' }}
                  activeOpacity={0.8}
                  onPress={() => handlePressActivity(index)}
                  onLayout={(event) => {
                    const { x, width } = event.nativeEvent.layout;
                    itemCentersRef.current[index] = x + width / 2;
                  }}
                >
                  <Animated.View
                    style={[
                      styles.wheelActivityItem,
                      isSelected && styles.wheelActivityItemSelected,
                      {
                        opacity,
                        transform: Platform.OS === 'android'
                          ? [{ scale }, { translateY }]
                          : [
                              { perspective: 500 },
                              { rotateY },
                              { scale },
                              { translateY },
                            ],
                      },
                    ]}
                  >
                    <Text style={styles.wheelEmoji}>{activity.emoji}</Text>
                    {unreadCount > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </Text>
                      </View>
                    )}
                  </Animated.View>
                </TouchableOpacity>
              );
            })}

            {/* Trailing spacer */}
            <View style={{ width: (carouselSlotWidth - WHEEL_ITEM_W) / 2 }} />
          </Animated.ScrollView>
        </View>
      );

      const wheelRow = (
        <View style={styles.wheelRow}>
          {/* Remove (circle) */}
          <View style={styles.wheelBtnWrap}>
            <TouchableOpacity
              style={[styles.wheelCircleBtn, styles.wheelCircleBtnSymbol, !hasActivities && styles.wheelCircleBtnDisabled]}
              onPress={() => { if (hasActivities) setShowRemovePicker(true); }}
              disabled={!hasActivities}
            >
              <Text style={[styles.wheelBtnSymbol, !hasActivities && { color: '#ccc' }]}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.wheelBtnLabel, !hasActivities && { color: '#bbb' }]}>Remove</Text>
          </View>

          {/* Wheel scroll area */}
          <View style={styles.wheelSlot}>
            {hasActivities ? (
              wheelContent
            ) : isLoading ? (
              <View style={styles.emptyStrip}>
                <Text style={styles.emptyStripText}>Loading activities…</Text>
              </View>
            ) : (
              <View style={styles.emptyStrip}>
                <Text style={styles.emptyStripText}>Add your first activity →</Text>
              </View>
            )}
          </View>

          {/* Add (circle) */}
          <View style={styles.wheelBtnWrap}>
            <TouchableOpacity style={[styles.wheelCircleBtn, styles.wheelCircleBtnSymbol]} onPress={() => setShowActivityModal(true)}>
              <Text style={styles.wheelBtnSymbol}>+</Text>
            </TouchableOpacity>
            <Text style={styles.wheelBtnLabel}>Add</Text>
          </View>
        </View>
      );

      return (
        <View style={[styles.containerWheelMode, { paddingBottom: carouselBottomPadding }]}>
          {tutorialCarouselTargetRef ? (
            <View ref={tutorialCarouselTargetRef} collapsable={false} onLayout={() => onTutorialCarouselTargetLayout?.()}>
              {wheelRow}
            </View>
          ) : (
            wheelRow
          )}
          {/* Modals */}
          <Modal visible={showRemovePicker} transparent animationType="fade" onRequestClose={() => setShowRemovePicker(false)}>
            <TouchableOpacity style={styles.removePickerOverlay} activeOpacity={1} onPress={() => setShowRemovePicker(false)}>
              <View style={styles.removePickerBox}>
                <Text style={styles.removePickerTitle}>Remove an activity</Text>
                <ScrollView style={styles.removePickerList} keyboardShouldPersistTaps="handled">
                  {displayActivities.map((activity) => (
                    <TouchableOpacity key={activity.activity_id} style={styles.removePickerItem} onPress={() => handleConfirmRemove(activity.activity_id, activity.name)}>
                      <Text style={styles.removePickerEmoji}>{activity.emoji}</Text>
                      <Text style={styles.removePickerName}>{activity.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity style={styles.removePickerCancel} onPress={() => setShowRemovePicker(false)}>
                  <Text style={styles.removePickerCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
          <ActivitySelectionModal
            visible={showActivityModal}
            onClose={() => setShowActivityModal(false)}
            onComplete={(selections) => {
              const sel = selections?.[0];
              if (sel?.activityId && sel.name != null && sel.emoji != null) {
                setActivityWithPendingAlign({ activityId: sel.activityId, activity: sel.name, skillLevel: sel.skillLevel, emoji: sel.emoji });
              }
              refetch();
              setShowActivityModal(false);
            }}
            excludeActivityIds={selectedActivityIds}
          />
        </View>
      );
    }

    // ── Flat mode (Plans screen) ─────────────────────────────────────────
    const addRemoveRow = (
      <View style={styles.addRemoveRow}>
        <TouchableOpacity
          style={[styles.addRemoveBtn, styles.addRemoveBtnSmall, !hasActivities && styles.addRemoveBtnDisabled]}
          onPress={() => {
            if (hasActivities) setShowRemovePicker(true);
          }}
          disabled={!hasActivities}
        >
          <View style={[styles.addRemoveIconLine, { backgroundColor: hasActivities ? '#FF8C42' : '#ccc' }]} />
        </TouchableOpacity>
        <View style={styles.carouselSlot}>
          {hasActivities ? (
            <View
              style={styles.carouselSlotInner}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w > 0) setCarouselSlotWidth(w);
              }}
            >
              {carouselContent}
            </View>
          ) : (
            <View style={styles.emptyStrip}>
              <Text style={styles.emptyStripText}>select first activity →</Text>
            </View>
          )}
        </View>
        {onChatPress && (
          <TouchableOpacity
            style={[styles.addRemoveBtn, styles.addRemoveBtnSmall, styles.chatBtn]}
            onPress={onChatPress}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#FF8C42" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.addRemoveBtn, styles.addRemoveBtnSmall]}
          onPress={() => setShowActivityModal(true)}
        >
          <View style={styles.addRemovePlusWrap}>
            <View style={[styles.addRemoveIconLine, styles.addRemovePlusHorizontal]} />
            <View style={[styles.addRemoveIconLine, styles.addRemovePlusVertical]} />
          </View>
        </TouchableOpacity>
      </View>
    );
    const stripTop = 8 + extraStripTopInset;
    return (
      <View style={[styles.containerStripAddRemove, { paddingTop: stripTop, paddingBottom: carouselBottomPadding }]}>
        {tutorialCarouselTargetRef ? (
          <View
            ref={tutorialCarouselTargetRef}
            collapsable={false}
            onLayout={() => onTutorialCarouselTargetLayout?.()}
          >
            {addRemoveRow}
          </View>
        ) : (
          addRemoveRow
        )}
        {/* Remove activity picker modal */}
        <Modal
          visible={showRemovePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRemovePicker(false)}
        >
          <TouchableOpacity
            style={styles.removePickerOverlay}
            activeOpacity={1}
            onPress={() => setShowRemovePicker(false)}
          >
            <View style={styles.removePickerBox}>
              <Text style={styles.removePickerTitle}>Remove an activity</Text>
              <ScrollView style={styles.removePickerList} keyboardShouldPersistTaps="handled">
                {displayActivities.map((activity) => (
                  <TouchableOpacity
                    key={activity.activity_id}
                    style={styles.removePickerItem}
                    onPress={() => handleConfirmRemove(activity.activity_id, activity.name)}
                  >
                    <Text style={styles.removePickerEmoji}>{activity.emoji}</Text>
                    <Text style={styles.removePickerName}>{activity.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={styles.removePickerCancel}
                onPress={() => setShowRemovePicker(false)}
              >
                <Text style={styles.removePickerCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
        <ActivitySelectionModal
          visible={showActivityModal}
          onClose={() => setShowActivityModal(false)}
          onComplete={(selections) => {
            const sel = selections?.[0];
            if (sel?.activityId && sel.name != null && sel.emoji != null) {
              setActivityWithPendingAlign({
                activityId: sel.activityId,
                activity: sel.name,
                skillLevel: sel.skillLevel,
                emoji: sel.emoji,
              });
            }
            refetch();
            setShowActivityModal(false);
          }}
          excludeActivityIds={selectedActivityIds}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {carouselContent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  // When showAddRemove is used (Plans / Forum): no paddingVertical here — top comes from { paddingTop: stripTop } on the root View
  // so it isn’t overridden by merging with `container` (which uses paddingVertical: 16).
  containerStripAddRemove: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    paddingBottom: 8,
  },
  addRemoveRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 6,
    paddingHorizontal: 6,
    gap: 4,
    overflow: 'visible',
  },
  addRemoveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 4,
    minWidth: 36,
  },
  addRemoveBtnSmall: {
    paddingVertical: 29,
  },
  addRemoveBtnDisabled: {
    opacity: 0.6,
  },
  chatBtn: {
    paddingHorizontal: 8,
  },
  /* ── Wheel mode styles ── */
  containerWheelMode: {
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
  },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 2,
  },
  wheelBtnWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginTop: 4,
  },
  wheelCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelCircleBtnRemove: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1.5,
    borderColor: '#d0d0d0',
  },
  wheelCircleBtnSymbol: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1.5,
    borderColor: '#d0d0d0',
  },
  wheelCircleBtnOutline: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1.5,
    borderColor: '#d0d0d0',
  },
  wheelBtnSymbol: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#888',
    lineHeight: 26,
    includeFontPadding: false,
  },
  wheelCircleBtnDisabled: {
    opacity: 0.4,
  },
  wheelBtnLabel: {
    fontSize: 9,
    fontFamily: 'Inter_500Medium',
    color: '#888',
    marginTop: 3,
  },
  wheelSlot: {
    flex: 1,
    minWidth: 0,
    overflow: 'visible',
  },
  wheelTrackContainer: {
    height: 76,
    justifyContent: 'center',
    overflow: 'visible',
    marginTop: -2,
  },
  wheelOval: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 8,
    bottom: 8,
    borderRadius: 30,
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  wheelScrollContent: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  wheelActivityItem: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  wheelActivityItemSelected: {
    backgroundColor: '#fff0e0',
    borderWidth: 3,
    borderColor: '#FF8C42',
    shadowColor: '#FF8C42',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  wheelEmoji: {
    fontSize: 26,
  },
  addRemoveIconLine: {
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FF8C42',
  },
  addRemovePlusWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
  },
  addRemovePlusVertical: {
    position: 'absolute',
    width: 3,
    height: 18,
    left: 7.5,
    top: 0,
    borderRadius: 2,
  },
  addRemovePlusHorizontal: {
    position: 'absolute',
    left: 0,
    top: 7.5,
  },
  carouselSlot: {
    flex: 1,
    minWidth: 0,
    overflow: 'visible',
  },
  carouselSlotInner: {
    flex: 1,
    minWidth: 0,
    overflow: 'visible',
  },
  carouselScrollViewFill: {
    flex: 1,
    minWidth: 0,
  },
  emptyStrip: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyStripText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#999',
  },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  scrollContentAddRemove: {
    paddingVertical: 4,
  },
  itemContainer: {
    width: ITEM_WIDTH,
    marginHorizontal: ITEM_SPACING / 2,
    alignItems: 'center',
  },
  activityItem: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH,
    borderRadius: 16,
    backgroundColor: '#f8f8f8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#C62828',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_800ExtraBold',
    color: '#FFFFFF',
  },
  activityItemSelected: {
    backgroundColor: '#fff5e6',
    borderWidth: 2,
    borderColor: '#FF8C42',
  },
  emoji: {
    fontSize: 36,
  },
  activityNameMeasureWrap: {
    alignSelf: 'center',
    maxWidth: '100%',
  },
  activityName: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: '#999',
    textAlign: 'center',
  },
  activityNameSelected: {
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  emptySubtext: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#999',
  },
  removePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  removePickerBox: {
    backgroundColor: 'white',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 320,
    maxHeight: '70%',
  },
  removePickerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginBottom: 12,
  },
  removePickerList: {
    maxHeight: 280,
  },
  removePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  removePickerEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  removePickerName: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    color: '#333',
  },
  removePickerCancel: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  removePickerCancelText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
});
