import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  type RefObject,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useActivities } from '@/hooks/useActivities';
import { useTodaySignup } from '@/hooks/useTodaySignup';
import type { UserActivitySkill } from '@/types/database';
import { ActivitySelectionModal } from '@/components/ActivitySelectionModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SMALL_ITEM_WIDTH = 56;
const SMALL_ITEM_SPACING = 10;
const SMALL_SLOT = SMALL_ITEM_WIDTH + SMALL_ITEM_SPACING;
/** Extra scroll for index 0 so “Inactive” lines up in the viewport (emoji + strip layout read slightly right otherwise). */
const CAROUSEL_INACTIVE_SCROLL_NUDGE_PX = 4;
/** On drag-end, persist only if the scroll is basically stopped (fling settles on momentum end). */
const CAROUSEL_VELOCITY_PERSIST_THRESHOLD = 0.25;
// Fallback until onLayout gives us real width (section margin 20*2 + padding 20*2)
const DEFAULT_CAROUSEL_WIDTH = SCREEN_WIDTH - 20 * 2 - 20 * 2;

const INACTIVE_ACTIVITY = {
  activity_id: null as string | null,
  name: 'Inactive',
  emoji: '0',
  isInactive: true,
};

/** Normalize skill_level for display (capitalize first letter). */
function formatSkillLevel(level: string): string {
  const s = (level || '').trim();
  if (!s) return 'Beginner';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function getSkillColor(skillLevel: string): string {
  const n = formatSkillLevel(skillLevel);
  switch (n) {
    case 'Beginner': return '#4CAF50';
    case 'Intermediate': return '#FFCF56';
    case 'Local Legend': return '#FF8C42';
    default: return '#999';
  }
}

interface TodayActivitySectionProps {
  userSkills: UserActivitySkill[];
  updateReadyToday: (activityId: string, readyToday: boolean) => Promise<boolean> | boolean;
  /**
   * Browse-without-login: carousel and matches list work as a preview only (no DB updates).
   */
  guestPreview?: boolean;
  /** Ready Today horizontal carousel (emoji + labels) — tutorial step 1 spotlight */
  tutorialCarouselWrapRef?: RefObject<View | null>;
  onTutorialCarouselLayout?: () => void;
  /** "Matches:" title — tutorial step 2 tail points here */
  tutorialMatchesTitleRef?: RefObject<View | null>;
  onTutorialMatchesTitleLayout?: () => void;
  /** Same − / + row as Forum & Plans (logged-in profile only). */
  showAddRemoveStrip?: boolean;
  removeActivity?: (activityId: string) => Promise<void> | void;
  refetchSkills?: () => void | Promise<void>;
}

export function TodayActivitySection({
  userSkills,
  updateReadyToday,
  guestPreview = false,
  tutorialCarouselWrapRef,
  onTutorialCarouselLayout,
  tutorialMatchesTitleRef,
  onTutorialMatchesTitleLayout,
  showAddRemoveStrip = false,
  removeActivity,
  refetchSkills,
}: TodayActivitySectionProps) {
  const { activities: allActivities } = useActivities();
  const stripMode =
    !!showAddRemoveStrip &&
    !guestPreview &&
    typeof removeActivity === 'function' &&
    typeof refetchSkills === 'function';

  const displayActivities = useMemo(
    () => [
      INACTIVE_ACTIVITY,
      ...(guestPreview
        ? (allActivities ?? []).map((a) => ({
            activity_id: a.id as string,
            name: a.name ?? '',
            emoji: a.emoji ?? '🏃',
            isInactive: false as const,
          }))
        : (userSkills ?? [])
            .filter((skill) => skill.activity_id && skill.activities?.name)
            .map((skill) => ({
              activity_id: String(skill.activity_id),
              name: skill.activities?.name ?? '',
              emoji: skill.activities?.emoji ?? '🏃',
              isInactive: false as const,
            }))
            .sort((a, b) => a.name.localeCompare(b.name))),
    ],
    [guestPreview, allActivities, userSkills]
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(DEFAULT_CAROUSEL_WIDTH);
  /** Viewport width for scroll math when the carousel sits in the Forum/Plans-style strip slot. */
  const [carouselSlotWidth, setCarouselSlotWidth] = useState(SCREEN_WIDTH);
  const [showRemovePicker, setShowRemovePicker] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const carouselRef = useRef<ScrollView>(null);
  const isScrollingRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const hasSyncedFromProfileRef = useRef(false);
  /** If we synced while skills were still empty (readyActivityId null), allow one re-sync when DB catches up. */
  const prevReadyActivityIdRef = useRef<string | null | undefined>(undefined);
  /** Latest carousel tile: `null` = Inactive, else activity id (for preserving focus after strip add/remove). */
  const carouselFocusActivityIdRef = useRef<string | null>(null);
  /**
   * After refetch from + / −: restore this focus. `undefined` = nothing queued; `null` = Inactive.
   */
  const pendingRestoreFocusRef = useRef<string | null | undefined>(undefined);
  /** Last ready_activity_id we scrolled the carousel to — must update when DB ready changes (not only when skills list changes). */
  const lastSyncedReadyActivityIdRef = useRef<string | null | undefined>(undefined);

  const skillsSignature = useMemo(() => {
    if (guestPreview) return 'guest';
    return (userSkills ?? [])
      .map((s) => String(s.activity_id ?? ''))
      .filter(Boolean)
      .sort()
      .join(',');
  }, [guestPreview, userSkills]);

  /** Detect carousel tile order changes (same activities, different sort index). */
  const displayOrderKey = useMemo(
    () =>
      displayActivities.map((a) => (a.isInactive ? 'inactive' : String(a.activity_id))).join('|'),
    [displayActivities]
  );
  const prevDisplayOrderKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (guestPreview) return;
    hasSyncedFromProfileRef.current = false;
    lastSyncedReadyActivityIdRef.current = undefined;
  }, [guestPreview, skillsSignature]);

  useEffect(() => {
    if (!guestPreview) return;
    hasSyncedFromProfileRef.current = false;
    lastSyncedReadyActivityIdRef.current = undefined;
  }, [guestPreview, displayActivities.length]);

  useEffect(() => {
    if (displayActivities.length === 0) return;
    setSelectedIndex((i) => Math.min(i, displayActivities.length - 1));
  }, [displayActivities.length]);

  const effectiveCarouselWidth = stripMode ? carouselSlotWidth : carouselWidth;
  const centerOffset = (effectiveCarouselWidth - SMALL_ITEM_WIDTH) / 2;
  const firstItemCenterX = centerOffset + SMALL_SLOT / 2;

  const carouselSnapOffsets = useMemo(() => {
    const W = effectiveCarouselWidth;
    const n = displayActivities.length;
    if (n === 0 || W <= 0) return undefined;
    const cOff = (W - SMALL_ITEM_WIDTH) / 2;
    const firstCenter = cOff + SMALL_SLOT / 2;
    const contentW = cOff * 2 + n * SMALL_SLOT;
    const maxX = Math.max(0, contentW - W);
    const offsets: number[] = [];
    for (let i = 0; i < n; i++) {
      const nudge = i === 0 ? CAROUSEL_INACTIVE_SCROLL_NUDGE_PX : 0;
      const ideal = firstCenter + i * SMALL_SLOT - W / 2 + nudge;
      offsets.push(Math.max(0, Math.min(ideal, maxX)));
    }
    return offsets;
  }, [displayActivities.length, effectiveCarouselWidth]);

  const removableActivities = useMemo(
    () => displayActivities.filter((a) => !a.isInactive && a.activity_id),
    [displayActivities]
  );
  const hasRemovableSkills = removableActivities.length > 0;
  const excludeActivityIdsForModal = useMemo(
    () =>
      removableActivities
        .map((a) => a.activity_id)
        .filter((id): id is string => id != null),
    [removableActivities]
  );

  const displaySelectedIndex = Math.min(
    selectedIndex,
    Math.max(0, displayActivities.length - 1)
  );

  useLayoutEffect(() => {
    const act = displayActivities[displaySelectedIndex];
    if (!act) return;
    carouselFocusActivityIdRef.current = act.isInactive ? null : String(act.activity_id);
  }, [displayActivities, displaySelectedIndex]);

  const selectedActivity = displayActivities[displaySelectedIndex];
  const activityId = selectedActivity?.activity_id ?? null;
  const isInactive = selectedActivity?.isInactive ?? true;
  const { list, loading } = useTodaySignup(activityId);
  const displayList = isInactive ? [] : list;

  /** Carousel focus when multiple activities are ready; picks most recently updated. */
  const readyActivityId = useMemo(() => {
    const candidates = (userSkills ?? []).filter((s) => s.ready_today && s.activity_id);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return String(candidates[0].activity_id);
    const sorted = [...candidates].sort((a, b) => {
      const ta = new Date(a.updated_at || 0).getTime();
      const tb = new Date(b.updated_at || 0).getTime();
      if (tb !== ta) return tb - ta;
      return String(a.activity_id).localeCompare(String(b.activity_id));
    });
    return String(sorted[0].activity_id);
  }, [userSkills]);

  const scrollCarouselToIndex = useCallback(
    (index: number, animated = true) => {
      const len = displayActivities.length;
      if (!carouselRef.current || len === 0) return;
      const clamped = Math.max(0, Math.min(index, len - 1));
      const nudge = clamped === 0 ? CAROUSEL_INACTIVE_SCROLL_NUDGE_PX : 0;
      const x = Math.max(0, firstItemCenterX + clamped * SMALL_SLOT - effectiveCarouselWidth / 2 + nudge);
      isAutoScrollingRef.current = true;
      carouselRef.current.scrollTo({ x, animated });
      setSelectedIndex(clamped);
      if (animated) setTimeout(() => { isAutoScrollingRef.current = false; }, 700);
      else isAutoScrollingRef.current = false;
    },
    [displayActivities.length, firstItemCenterX, effectiveCarouselWidth]
  );

  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  /** True after the user drags the carousel; cleared on scroll end. Programmatic scrollTo does not set this. */
  const carouselUserGestureRef = useRef(false);

  const persistReadyTodayForIndex = useCallback(
    async (index: number) => {
      if (guestPreview) return;
      const act = displayActivities[index];
      if (!act) return;
      try {
        if (act.isInactive) {
          const toClear = userSkills.filter((s) => s.ready_today && s.activity_id);
          await Promise.all(
            toClear.map((s) => updateReadyToday(String(s.activity_id), false) as Promise<boolean>)
          );
          return;
        }
        await updateReadyToday(String(act.activity_id), true);
      } catch (e) {
        console.error('Error updating Ready Today selection:', e);
      }
    },
    [guestPreview, displayActivities, userSkills, updateReadyToday]
  );

  useEffect(() => {
    if (!stripMode) return;
    requestAnimationFrame(() => {
      scrollCarouselToIndex(selectedIndexRef.current, false);
    });
  }, [carouselSlotWidth, stripMode, scrollCarouselToIndex]);

  /** After skills reorder (e.g. alphabetical), keep the same activity centered — not a stale index. */
  useEffect(() => {
    if (guestPreview || displayActivities.length === 0) return;
    const key = displayOrderKey;
    if (prevDisplayOrderKeyRef.current === null) {
      prevDisplayOrderKeyRef.current = key;
      return;
    }
    if (prevDisplayOrderKeyRef.current === key) return;
    prevDisplayOrderKeyRef.current = key;

    const focusId = carouselFocusActivityIdRef.current;
    const idx =
      focusId == null
        ? 0
        : displayActivities.findIndex(
            (a) => !a.isInactive && String(a.activity_id) === focusId
          );
    const target = idx >= 0 ? idx : 0;
    requestAnimationFrame(() => {
      scrollCarouselToIndex(target, false);
    });
  }, [displayOrderKey, guestPreview, displayActivities, scrollCarouselToIndex]);

  const handleConfirmRemove = useCallback(
    (activityIdToRemove: string, activityName: string) => {
      if (!removeActivity) return;
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
              const savedFocus = carouselFocusActivityIdRef.current;
              await removeActivity(activityIdToRemove);
              await refetchSkills?.();
              pendingRestoreFocusRef.current = savedFocus;
            },
          },
        ]
      );
    },
    [removeActivity, refetchSkills]
  );

  useEffect(() => {
    const prevReady = prevReadyActivityIdRef.current;
    prevReadyActivityIdRef.current = readyActivityId;

    if (
      hasSyncedFromProfileRef.current &&
      (prevReady === null || prevReady === undefined) &&
      readyActivityId
    ) {
      hasSyncedFromProfileRef.current = false;
    }

    if (pendingRestoreFocusRef.current !== undefined) {
      const want = pendingRestoreFocusRef.current;
      pendingRestoreFocusRef.current = undefined;

      if (!displayActivities || displayActivities.length === 0) return;

      if (want === null) {
        scrollCarouselToIndex(0, false);
        hasSyncedFromProfileRef.current = true;
        lastSyncedReadyActivityIdRef.current = readyActivityId ?? null;
        return;
      }

      const idx = displayActivities.findIndex(
        (act) => !act.isInactive && String(act.activity_id) === want
      );

      if (idx >= 0) {
        scrollCarouselToIndex(idx, false);
        hasSyncedFromProfileRef.current = true;
        lastSyncedReadyActivityIdRef.current = readyActivityId ?? null;
        return;
      }

      // Focused activity was removed — fall through to ready_today sync.
      hasSyncedFromProfileRef.current = false;
    }

    const readyKey = readyActivityId ?? null;
    if (
      hasSyncedFromProfileRef.current &&
      lastSyncedReadyActivityIdRef.current === readyKey
    ) {
      return;
    }
    if (!displayActivities || displayActivities.length === 0) return;

    if (!readyActivityId) {
      // Default to Inactive when there is no ready_today activity.
      scrollCarouselToIndex(0, false);
      hasSyncedFromProfileRef.current = true;
      lastSyncedReadyActivityIdRef.current = null;
      return;
    }

    const matchIndex = displayActivities.findIndex(
      (act) => !act.isInactive && String(act.activity_id) === String(readyActivityId)
    );

    if (matchIndex > 0) {
      scrollCarouselToIndex(matchIndex, false);
    } else {
      scrollCarouselToIndex(0, false);
    }
    hasSyncedFromProfileRef.current = true;
    lastSyncedReadyActivityIdRef.current = readyKey;
  }, [displayActivities.length, readyActivityId, scrollCarouselToIndex, skillsSignature]);

  const handleCarouselScrollEnd = useCallback(
    (e: any, source: 'dragEnd' | 'momentumEnd') => {
      if (displayActivities.length === 0 || isAutoScrollingRef.current) return;
      isScrollingRef.current = true;
      const offsetX = e.nativeEvent.contentOffset.x;
      const n = displayActivities.length;
      let clampedIndex: number;

      if (
        carouselSnapOffsets !== undefined &&
        carouselSnapOffsets.length === n
      ) {
        let best = 0;
        let bestDist = Math.abs(carouselSnapOffsets[0] - offsetX);
        for (let i = 1; i < n; i++) {
          const d = Math.abs(carouselSnapOffsets[i] - offsetX);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        }
        clampedIndex = best;
      } else {
        const viewportCenterX = offsetX + effectiveCarouselWidth / 2;
        const rawIndex = Math.round((viewportCenterX - firstItemCenterX) / SMALL_SLOT);
        clampedIndex = Math.max(0, Math.min(rawIndex, n - 1));
      }

      const prevIndex = selectedIndexRef.current;
      const fromUser = carouselUserGestureRef.current;
      const vx = Math.abs(e.nativeEvent.velocity?.x ?? 0);
      const settledEnoughToPersist =
        source === 'momentumEnd' || vx < CAROUSEL_VELOCITY_PERSIST_THRESHOLD;

      setSelectedIndex((prev) => (prev === clampedIndex ? prev : clampedIndex));

      if (fromUser && !guestPreview && settledEnoughToPersist && clampedIndex !== prevIndex) {
        void persistReadyTodayForIndex(clampedIndex);
      }

      if (source === 'momentumEnd' || settledEnoughToPersist) {
        carouselUserGestureRef.current = false;
      }

      setTimeout(() => {
        isScrollingRef.current = false;
      }, 100);
    },
    [
      carouselSnapOffsets,
      displayActivities.length,
      effectiveCarouselWidth,
      firstItemCenterX,
      guestPreview,
      persistReadyTodayForIndex,
    ]
  );

  const handlePressCarouselItem = (index: number) => {
    if (index === selectedIndex) return;
    scrollCarouselToIndex(index, true);
    const act = displayActivities[index];
    if (!act) return;

    if (guestPreview) {
      return;
    }

    // Fire-and-forget; UI should feel instant.
    void persistReadyTodayForIndex(index);
  };

  const handleCarouselScrollBeginDrag = useCallback(() => {
    carouselUserGestureRef.current = true;
  }, []);

  if (displayActivities.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>
        What do you want to do{' '}
        <Text style={styles.titleToday}>today</Text>
        ?
      </Text>
      <Text style={styles.subtitle}>
        Match with active people nearby
      </Text>
      {guestPreview ? (
        <Text style={styles.guestPreviewHint}>
          Preview — sign in to save Active Today and show up in matches.
        </Text>
      ) : null}
      <LinearGradient
        colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.titleDivider}
      />

      <View
        ref={tutorialCarouselWrapRef}
        collapsable={false}
        style={styles.carouselWrap}
        onLayout={(e) => {
          if (!stripMode) setCarouselWidth(e.nativeEvent.layout.width);
          onTutorialCarouselLayout?.();
        }}
      >
        {stripMode ? (
          <View style={styles.addRemoveRow}>
            <TouchableOpacity
              style={[
                styles.addRemoveBtn,
                styles.addRemoveBtnSmall,
                styles.addRemoveBtnMinusNudge,
                !hasRemovableSkills && styles.addRemoveBtnDisabled,
              ]}
              onPress={() => {
                if (hasRemovableSkills) setShowRemovePicker(true);
              }}
              disabled={!hasRemovableSkills}
              accessibilityLabel="Remove an activity"
            >
              <View
                style={[
                  styles.addRemoveIconLine,
                  { backgroundColor: hasRemovableSkills ? '#FF8C42' : '#ccc' },
                ]}
              />
            </TouchableOpacity>
            <View style={styles.carouselSlot}>
              <View
                style={styles.carouselSlotInner}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  if (w > 0) setCarouselSlotWidth(w);
                }}
              >
                <ScrollView
                  ref={carouselRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                  {...(carouselSnapOffsets
                    ? { snapToOffsets: carouselSnapOffsets }
                    : { snapToInterval: SMALL_SLOT })}
                  decelerationRate="fast"
                  bounces
                  onScrollBeginDrag={handleCarouselScrollBeginDrag}
                  onScrollEndDrag={(ev) => handleCarouselScrollEnd(ev, 'dragEnd')}
                  onMomentumScrollEnd={(ev) => handleCarouselScrollEnd(ev, 'momentumEnd')}
                  scrollEventThrottle={16}
                >
                  <View style={{ width: centerOffset }} />
                  {displayActivities.map((act: any, index: number) => (
                    <TouchableOpacity
                      key={act.activity_id ?? 'inactive'}
                      style={styles.carouselItem}
                      onPress={() => handlePressCarouselItem(index)}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.carouselEmojiWrap,
                          index === displaySelectedIndex && styles.carouselEmojiWrapSelected,
                          index === displaySelectedIndex && styles.carouselEmojiWrapRing,
                          { opacity: index === displaySelectedIndex ? 1 : 0.4 },
                        ]}
                      >
                        {act.isInactive ? (
                          <Text style={styles.carouselEmojiInactive}>💤</Text>
                        ) : (
                          <Text style={styles.carouselEmoji}>{act.emoji}</Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.carouselName,
                          index === displaySelectedIndex && styles.carouselNameSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {act.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <View style={{ width: centerOffset }} />
                </ScrollView>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.addRemoveBtn,
                styles.addRemoveBtnSmall,
                styles.addRemoveBtnOutwardRight,
              ]}
              onPress={() => setShowActivityModal(true)}
              accessibilityLabel="Add an activity"
            >
              <View style={styles.addRemovePlusWrap}>
                <View style={[styles.addRemoveIconLine, styles.addRemovePlusHorizontal]} />
                <View style={[styles.addRemoveIconLine, styles.addRemovePlusVertical]} />
              </View>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            ref={carouselRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
            {...(carouselSnapOffsets
              ? { snapToOffsets: carouselSnapOffsets }
              : { snapToInterval: SMALL_SLOT })}
            decelerationRate="fast"
            bounces
            onScrollBeginDrag={handleCarouselScrollBeginDrag}
            onScrollEndDrag={(ev) => handleCarouselScrollEnd(ev, 'dragEnd')}
            onMomentumScrollEnd={(ev) => handleCarouselScrollEnd(ev, 'momentumEnd')}
            scrollEventThrottle={16}
          >
            <View style={{ width: centerOffset }} />
            {displayActivities.map((act: any, index: number) => (
              <TouchableOpacity
                key={act.activity_id ?? 'inactive'}
                style={styles.carouselItem}
                onPress={() => handlePressCarouselItem(index)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.carouselEmojiWrap,
                    index === displaySelectedIndex && styles.carouselEmojiWrapSelected,
                    index === displaySelectedIndex && styles.carouselEmojiWrapRing,
                    { opacity: index === displaySelectedIndex ? 1 : 0.4 },
                  ]}
                >
                  {act.isInactive ? (
                    <Text style={styles.carouselEmojiInactive}>💤</Text>
                  ) : (
                    <Text style={styles.carouselEmoji}>{act.emoji}</Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.carouselName,
                    index === displaySelectedIndex && styles.carouselNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {act.name}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={{ width: centerOffset }} />
          </ScrollView>
        )}
      </View>

      {tutorialMatchesTitleRef ? (
        <View
          ref={tutorialMatchesTitleRef}
          collapsable={false}
          onLayout={() => onTutorialMatchesTitleLayout?.()}
          /** Shrink-wrap so measureInWindow targets the label, not full section width (keeps tail X on “Matches:”). */
          style={styles.matchesTitleMeasureWrap}
        >
          <Text style={styles.readyTodayTitle}>Matches:</Text>
        </View>
      ) : (
        <Text style={styles.readyTodayTitle}>Matches:</Text>
      )}
      {isInactive ? null : loading ? (
        <ActivityIndicator size="small" color="#FF8C42" style={styles.listLoader} />
      ) : displayList.length === 0 ? (
        null
      ) : (
        <View style={styles.list}>
          {displayList.map((entry, idx) => (
            <TouchableOpacity
              key={entry.id}
              style={[
                styles.listRow,
                idx === displayList.length - 1 && styles.listRowLast,
              ]}
              activeOpacity={0.8}
              onPress={() => {
                if (guestPreview) {
                  Alert.alert(
                    'Sign in to continue',
                    'Create an account to view profiles and connect with people who are active today.',
                    [
                      { text: 'Not now', style: 'cancel' },
                      { text: 'Sign in', onPress: () => router.push('/(auth)/login') },
                    ]
                  );
                  return;
                }
                const userId = (entry as { user_id?: string }).user_id;
                if (userId) {
                  router.push({
                    pathname: '/(tabs)/people/[id]',
                    params: { id: userId, name: entry.name, from: 'home' },
                  });
                }
              }}
            >
              <Text style={[styles.listCell, styles.listCellName]} numberOfLines={1} ellipsizeMode="tail">
                {entry.name}
              </Text>
              <Text style={[styles.listCell, styles.listCellDistance]} numberOfLines={1}>
                {entry.distance != null && entry.distance !== '' ? entry.distance : '—'}
              </Text>
              <View style={styles.skillLevelWrap}>
                <View style={[styles.skillDot, { backgroundColor: getSkillColor(entry.skill_level) }]} />
                <Text style={[styles.listCell, styles.skillLevelText]}>
                  {formatSkillLevel(entry.skill_level)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {stripMode ? (
        <>
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
                  {removableActivities.map((activity) => (
                    <TouchableOpacity
                      key={activity.activity_id}
                      style={styles.removePickerItem}
                      onPress={() =>
                        handleConfirmRemove(String(activity.activity_id), activity.name)
                      }
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
            onComplete={async () => {
              const savedFocus = carouselFocusActivityIdRef.current;
              await refetchSkills?.();
              pendingRestoreFocusRef.current = savedFocus;
              setShowActivityModal(false);
            }}
            excludeActivityIds={excludeActivityIdsForModal}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'visible',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 4,
    textAlign: 'center',
  },
  titleToday: {
    textDecorationLine: 'underline',
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: '#333',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#888',
    marginBottom: 8,
    textAlign: 'center',
  },
  guestPreviewHint: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#FF8C42',
    marginBottom: 8,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  titleDivider: {
    height: 3,
    borderRadius: 2,
    marginBottom: 12,
  },
  carouselWrap: {
    width: '100%',
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  addRemoveRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 6,
    paddingHorizontal: 0,
    gap: 2,
    overflow: 'visible',
    width: '100%',
  },
  addRemoveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 2,
    minWidth: 28,
  },
  addRemoveBtnMinusNudge: {
    transform: [{ translateX: -1 }],
  },
  addRemoveBtnOutwardRight: {
    transform: [{ translateX: 7 }],
  },
  addRemoveBtnSmall: {
    paddingVertical: 29,
  },
  addRemoveBtnDisabled: {
    opacity: 0.6,
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
    marginLeft: 10,
  },
  carouselSlotInner: {
    flex: 1,
    minWidth: 0,
    overflow: 'visible',
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
  carouselContent: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  carouselItem: {
    width: SMALL_ITEM_WIDTH,
    marginHorizontal: SMALL_ITEM_SPACING / 2,
    alignItems: 'center',
  },
  carouselEmojiWrap: {
    width: SMALL_ITEM_WIDTH,
    height: SMALL_ITEM_WIDTH,
    borderRadius: 16,
    backgroundColor: '#f8f8f8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  carouselEmojiWrapSelected: {
    backgroundColor: '#fff5e6',
  },
  carouselEmojiWrapRing: {
    borderWidth: 2,
    borderColor: '#FF8C42',
  },
  carouselEmoji: {
    fontSize: 28,
  },
  carouselEmojiInactive: {
    fontSize: 28,
    color: '#888',
    opacity: 0.85,
  },
  carouselName: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: '#999',
    textAlign: 'center',
  },
  carouselNameSelected: {
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  /** Centers the shrink-wrapped “Matches:” measure target under the carousel (same visual as textAlign center). */
  matchesTitleMeasureWrap: {
    alignSelf: 'center',
  },
  readyTodayTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 6,
    textAlign: 'center',
  },
  readyTodayPrompt: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  listLoader: {
    marginVertical: 14,
  },
  emptyList: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    fontStyle: 'italic',
    paddingVertical: 4,
    textAlign: 'center',
  },
  list: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#f9f9f9',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    minWidth: 0,
  },
  listRowLast: {
    borderBottomWidth: 0,
  },
  listCell: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  listCellName: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Inter_500Medium',
    marginRight: 8,
  },
  listCellDistance: {
    fontFamily: 'Inter_400Regular',
    color: '#888',
    marginRight: 8,
    flexShrink: 0,
  },
  skillLevelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  skillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  skillLevelText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#555',
  },
});
