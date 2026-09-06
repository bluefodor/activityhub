import { ActivityCarousel } from '@/components/ActivityCarousel';
import { CreatePlanModal } from '@/components/CreatePlanModal';
import { PastPlansModal } from '@/components/PastPlansModal';
import { CreateForumPollModal } from '@/components/CreateForumPollModal';
import ForumMessageItem from '@/components/ForumMessageItem';
import { MessageEditModal } from '@/components/MessageEditModal';
import { ReactionPicker, type ReactionPickerLayout } from '@/components/ReactionPicker';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ReadyTodayToggle } from '@/components/ReadyTodayToggle';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadChatCount } from '@/hooks/useUnreadChatCount';
import { useForumMessages } from '@/hooks/useForumMessages';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useMessageReactions } from '@/hooks/useMessageReactions';
import { useProfile } from '@/hooks/useProfile';
import { usePeople } from '@/hooks/usePeople';
import { usePlans, type ActivityPlan } from '@/hooks/usePlans';
import { requireAuth } from '@/lib/authHelpers';
import { formatPlanTime12hShort } from '@/lib/planDateTime';
import { useActivityStore } from '@/store/useActivityStore';
import { useNotificationNavStore } from '@/store/useNotificationNavStore';
import { useActivityBadgeStore } from '@/store/useActivityBadgeStore';
import { ICONS } from '@/lib/helperUtils';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import ImageView from '@/components/ImageView';
import { CachedImage } from '@/components/CachedImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTutorialStore } from '@/store/useTutorialStore';
import { TutorialBubble } from '@/components/TutorialBubble';
import { AppKeyboardAvoidingView } from '@/components/AppKeyboardAvoidingView';
import {
  PlanJoinCallout,
  PLAN_JOIN_CALLOUT_BUBBLE_WIDTH,
  PLAN_JOIN_CALLOUT_DAILY_KEY,
} from '@/components/PlanJoinCallout';
import { NotificationsInboxModal } from '@/components/NotificationsInboxModal';
import { useNotificationsInbox, markInboxNotificationsRead, type InboxNotification, parseInboxNotificationData } from '@/hooks/useNotificationsInbox';
import { lookupProfileIdByName } from '@/lib/lookupProfileByName';
import { FORUM_LAST_SEEN_KEY } from '@/lib/activityStorageKeys';
import { appCalendarDateKey } from '@/lib/appCalendarDate';
import { type MentionLookupEntry } from '@/lib/forumMentions';

type WindowRect = { x: number; y: number; width: number; height: number };

const TUTORIAL_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TUTORIAL_MEASURE_MS = Platform.OS === 'android' ? [150, 500, 900] : [100, 400];
// Step 1 targets the retired "Active Today" control. Keep the tutorial
// disabled until its steps are redesigned around controls that still render.
const FORUM_TUTORIAL_ENABLED = false;
const tutorialCountKey = (userId: string) => `tutorial_v4_count_${userId}`;
const tutorialNeverKey = (userId: string) => `tutorial_v4_never_${userId}`;
const tutorialLastShownKey = (userId: string) => `tutorial_v4_last_shown_${userId}`;
/** Android Modal/status bar: measured window Y sits high vs visible layout. */
const TUTORIAL_ANDROID_Y_NUDGE = Platform.OS === 'android' ? 45 : 0;

/** Right sidebar width when expanded. */
const FORUM_SIDEBAR_EXPANDED_WIDTH = 120;

const nudgeTutorialRect = (rect: WindowRect): WindowRect => ({
  ...rect,
  y: rect.y + TUTORIAL_ANDROID_Y_NUDGE,
});

function PulsingJoinLabel({
  active,
  style,
  children,
}: {
  active: boolean;
  style: object;
  children: string;
}) {
  const colorAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      colorAnim.setValue(0);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(colorAnim, { toValue: 1, duration: 550, useNativeDriver: false }),
        Animated.timing(colorAnim, { toValue: 0, duration: 550, useNativeDriver: false }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [active, colorAnim]);

  const color = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#4CAF50', '#222222'],
  });

  return (
    <Animated.Text style={[style, active ? { color } : null]}>{children}</Animated.Text>
  );
}

export default function ForumScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const SCREEN_WIDTH = windowWidth;
  const { activityId, activity, skillLevel, emoji, touchForumLastSeen, setActivity,
    pendingOpenCreatePlan, setPendingOpenCreatePlan,
    showReadyTodayPrompt, setShowReadyTodayPrompt } =
    useActivityStore();
  // Debounce activity-switch events so data hooks only fire once the user
  // settles on an activity (~400 ms), not for every carousel swipe.
  const debouncedActivityId = useDebouncedValue(activityId, 400);
  const { userSkills, updateReadyToday, refetch: refetchProfile, profile, loading: profileLoading } = useProfile();
  const currentSkill = activityId ? userSkills.find((s) => s.activity_id === activityId) : null;
  const isReadyToday = !!currentSkill?.ready_today;

  const {
    messages,
    loading,
    sendMessage,
    updateMessage,
    deleteMessage,
    refetch: refetchForumMessages,
  } = useForumMessages(debouncedActivityId);
  const messageIds = messages.map((m) => m.id);
  const { getReactions, getCurrentUserEmoji, toggleReaction } = useMessageReactions(
    messageIds,
    'forum'
  );
  const [reactionPickerState, setReactionPickerState] = useState<{
    messageId: string;
    layout: ReactionPickerLayout;
  } | null>(null);
  const [messageActionMenu, setMessageActionMenu] = useState<{
    message: any;
    layout: ReactionPickerLayout;
  } | null>(null);
  const [editForumMessage, setEditForumMessage] = useState<{ id: string; text: string } | null>(null);
  const { user } = useAuth();
  const [newMessage, setNewMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [createPollVisible, setCreatePollVisible] = useState(false);
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const {
    items: inboxNotifications,
    loading: inboxLoading,
    unreadCount: inboxUnreadCount,
    markRead: markInboxRead,
    markAllRead: markAllInboxRead,
    refetch: refetchInbox,
  } = useNotificationsInbox();
  const { unreadCount: unreadChatCount, refetchChats, refetchGroupChats } = useUnreadChatCount();

  const { plans, joiningPlanId, toggleJoin, refetch: refetchPlans } = usePlans(debouncedActivityId);

  const notificationNavNonce = useNotificationNavStore((s) => s.nonce);
  const notificationNavTarget = useNotificationNavStore((s) => s.target);
  const lastNotificationNavNonceRef = useRef(0);

  const refetchProfileRef = useRef(refetchProfile);
  refetchProfileRef.current = refetchProfile;
  const refetchInboxRef = useRef(refetchInbox);
  refetchInboxRef.current = refetchInbox;
  const refetchPlansRef = useRef(refetchPlans);
  refetchPlansRef.current = refetchPlans;
  const refetchForumMessagesRef = useRef(refetchForumMessages);
  refetchForumMessagesRef.current = refetchForumMessages;
  const refetchChatsRef = useRef(refetchChats);
  refetchChatsRef.current = refetchChats;
  const refetchGroupChatsRef = useRef(refetchGroupChats);
  refetchGroupChatsRef.current = refetchGroupChats;
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;
  const debouncedActivityIdRef = useRef(debouncedActivityId);
  debouncedActivityIdRef.current = debouncedActivityId;

  // Keep focus refresh stable — unstable refetch identities were re-running this
  // every render and causing "Maximum update depth exceeded" / blank messages.
  useFocusEffect(
    useCallback(() => {
      Keyboard.dismiss();
      refetchProfileRef.current();
      void refetchInboxRef.current(true);
      void refetchPlansRef.current(true);
      void refetchForumMessagesRef.current();
      refetchChatsRef.current();
      refetchGroupChatsRef.current();
      const uid = userIdRef.current;
      const actId = debouncedActivityIdRef.current;
      if (uid && actId) {
        void markInboxNotificationsRead(uid, {
          types: ['forum_mention'],
          activityId: actId,
        }).then(() => refetchInboxRef.current(true));
      }
    }, [])
  );

  useEffect(() => {
    if (notificationNavTarget !== 'forum') return;
    if (notificationNavNonce === lastNotificationNavNonceRef.current) return;
    lastNotificationNavNonceRef.current = notificationNavNonce;
    useNotificationNavStore.setState({ target: null });
    void refetchForumMessagesRef.current();
    void refetchPlansRef.current(true);
    void refetchInboxRef.current(true);
  }, [notificationNavNonce, notificationNavTarget]);

  // Open the create plan modal when arriving via the Ready Today prompt
  useEffect(() => {
    if (pendingOpenCreatePlan && activityId) {
      setPendingOpenCreatePlan(false);
      setCreatePlanVisible(true);
    }
  }, [pendingOpenCreatePlan, activityId, setPendingOpenCreatePlan]);

  const [isGalleryVisible, setIsGalleryVisible] = useState(false);
  const [galleryImages, setGalleryImages] = useState<{ uri: string }[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);

  // Collapsible sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const planCalloutMarkedRef = useRef(false);
  const calloutPlanRowRef = useRef<View>(null);
  const calloutPositionReadyRef = useRef(false);
  const [planCalloutPos, setPlanCalloutPos] = useState<{ top: number; left: number } | null>(null);
  /** Default true until AsyncStorage load — avoids marking/showing before we know today's state. */
  const [planCalloutShownToday, setPlanCalloutShownToday] = useState(true);
  const [planCalloutDailyLoaded, setPlanCalloutDailyLoaded] = useState(false);
  const [planCalloutRevealed, setPlanCalloutRevealed] = useState(false);
  const [planCalloutHiddenSession, setPlanCalloutHiddenSession] = useState(false);
  const [createPlanVisible, setCreatePlanVisible] = useState(false);
  const [pastPlansVisible, setPastPlansVisible] = useState(false);

  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [showForumHeader, setShowForumHeader] = useState(false);
  const lastSeenKey = user?.id ? FORUM_LAST_SEEN_KEY(user.id) : null;
  const headerSeenKey = `forum_header_seen_${user?.id || 'guest'}`;
  const [dividerLastSeenAt, setDividerLastSeenAt] = useState<string | null>(null);
  // Tracks which activityIds have been initially marked as seen this session.
  // Using a Set (not a single boolean) so switching activities never loses in-flight fetches.
  const markedSeenActivitiesRef = useRef<Set<string>>(new Set());

  const { people, loading: peopleLoading } = usePeople();
  const [tutorialShowDismissOption, setTutorialShowDismissOption] = useState(false);
  const [tutorialDontShowAgain, setTutorialDontShowAgain] = useState(false);
  const {
    isActive: tutorialActive,
    currentStep,
    nextStep,
    endTutorial,
    goToStep,
    startTutorial,
  } = useTutorialStore();
  const tutorialReadyTodayRef = useRef<View>(null);
  const tutorialPlanBtnRef = useRef<View>(null);
  const tutorialChatBarRef = useRef<View>(null);
  const tutorialForumPeopleHeaderRef = useRef<View>(null);
  const tutorialForumFirstPersonRef = useRef<View>(null);
  const [tutorialReadyTodayRect, setTutorialReadyTodayRect] = useState<WindowRect | null>(null);
  const [tutorialPlanBtnRect, setTutorialPlanBtnRect] = useState<WindowRect | null>(null);
  const [tutorialChatBarRect, setTutorialChatBarRect] = useState<WindowRect | null>(null);
  const [tutorialForumFirstPersonRect, setTutorialForumFirstPersonRect] = useState<WindowRect | null>(null);

  const measureReadyTodaySpotlight = useCallback(() => {
    tutorialReadyTodayRef.current?.measureInWindow((x, y, w, h) => {
      setTutorialReadyTodayRect({ x, y, width: w, height: h });
    });
  }, []);

  const measurePlanBtnSpotlight = useCallback(() => {
    tutorialPlanBtnRef.current?.measureInWindow((x, y, w, h) => {
      setTutorialPlanBtnRect({ x, y, width: w, height: h });
    });
  }, []);

  const measureChatBarSpotlight = useCallback(() => {
    tutorialChatBarRef.current?.measureInWindow((x, y, w, h) => {
      setTutorialChatBarRect({ x, y, width: w, height: h });
    });
  }, []);

  /** Union of "People" header + first row (or header only when empty). */
  const measureForumPeopleSpotlight = useCallback(() => {
    const headerEl = tutorialForumPeopleHeaderRef.current;
    if (!headerEl) {
      setTutorialForumFirstPersonRect(null);
      return;
    }
    headerEl.measureInWindow((hx, hy, hw, hh) => {
      const firstEl = tutorialForumFirstPersonRef.current;
      if (!firstEl) {
        setTutorialForumFirstPersonRect({ x: hx, y: hy, width: hw, height: hh });
        return;
      }
      firstEl.measureInWindow((fx, fy, fw, fh) => {
        const x = Math.min(hx, fx);
        const y = Math.min(hy, fy);
        const right = Math.max(hx + hw, fx + fw);
        const bottom = Math.max(hy + hh, fy + fh);
        setTutorialForumFirstPersonRect({
          x,
          y,
          width: Math.max(0, right - x),
          height: Math.max(0, bottom - y),
        });
      });
    });
  }, []);

  const tryStartForumTutorial = useCallback(async () => {
    if (!FORUM_TUTORIAL_ENABLED) return;
    if (!user?.id || !activityId) return;

    try {
      const [never, countRaw, lastShownRaw] = await Promise.all([
        AsyncStorage.getItem(tutorialNeverKey(user.id)),
        AsyncStorage.getItem(tutorialCountKey(user.id)),
        AsyncStorage.getItem(tutorialLastShownKey(user.id)),
      ]);
      if (never === 'true') return;

      const count = parseInt(countRaw || '0', 10) || 0;
      const showDismiss = count >= 1;

      if (count >= 1) {
        const lastShown = parseInt(lastShownRaw || '0', 10) || 0;
        if (lastShown > 0 && Date.now() - lastShown < TUTORIAL_WEEK_MS) {
          return;
        }
      }

      if (useTutorialStore.getState().isActive) return;

      setTutorialShowDismissOption(showDismiss);
      setTutorialDontShowAgain(false);
      startTutorial();
    } catch (e) {
      console.error('Tutorial seen check failed:', e);
    }
  }, [user?.id, activityId, startTutorial]);

  useFocusEffect(
    useCallback(() => {
      void tryStartForumTutorial();
    }, [tryStartForumTutorial])
  );

  useEffect(() => {
    if (!FORUM_TUTORIAL_ENABLED && tutorialActive) {
      endTutorial();
    }
  }, [tutorialActive, endTutorial]);

  // Android: one delayed start if focus ran before carousel/activity was ready.
  useEffect(() => {
    if (Platform.OS !== 'android' || !user?.id) return;
    const t = setTimeout(() => void tryStartForumTutorial(), activityId ? 600 : 1200);
    return () => clearTimeout(t);
  }, [user?.id, activityId, tryStartForumTutorial]);

  const completeTutorial = useCallback(async () => {
    if (user?.id) {
      try {
        const countRaw = await AsyncStorage.getItem(tutorialCountKey(user.id));
        const count = parseInt(countRaw || '0', 10) || 0;
        await AsyncStorage.multiSet([
          [tutorialCountKey(user.id), String(count + 1)],
          [tutorialLastShownKey(user.id), String(Date.now())],
        ]);
        if (tutorialDontShowAgain) {
          await AsyncStorage.setItem(tutorialNeverKey(user.id), 'true');
        }
      } catch {
        // Ignore storage errors
      }
    }
    setTutorialDontShowAgain(false);
    setTutorialShowDismissOption(false);
    endTutorial();
  }, [user?.id, tutorialDontShowAgain, endTutorial]);

  useEffect(() => {
    if (!tutorialActive || (currentStep !== 2 && currentStep !== 4)) return;
    setSidebarCollapsed(false);
  }, [tutorialActive, currentStep]);

  useEffect(() => {
    if (!tutorialActive || currentStep !== 1) {
      setTutorialReadyTodayRect(null);
      return;
    }
    const run = () => requestAnimationFrame(() => measureReadyTodaySpotlight());
    run();
    const timers = TUTORIAL_MEASURE_MS.map((ms) => setTimeout(measureReadyTodaySpotlight, ms));
    const sub = Dimensions.addEventListener('change', measureReadyTodaySpotlight);
    return () => {
      timers.forEach(clearTimeout);
      sub?.remove();
    };
  }, [tutorialActive, currentStep, activityId, isReadyToday, measureReadyTodaySpotlight]);

  useEffect(() => {
    if (!tutorialActive || currentStep !== 2 || !activityId) {
      setTutorialPlanBtnRect(null);
      return;
    }
    const run = () => requestAnimationFrame(() => measurePlanBtnSpotlight());
    run();
    const timers = TUTORIAL_MEASURE_MS.map((ms) => setTimeout(measurePlanBtnSpotlight, ms));
    const sub = Dimensions.addEventListener('change', measurePlanBtnSpotlight);
    return () => {
      timers.forEach(clearTimeout);
      sub?.remove();
    };
  }, [tutorialActive, currentStep, activityId, sidebarCollapsed, measurePlanBtnSpotlight]);

  useEffect(() => {
    if (!tutorialActive || currentStep !== 3 || !activityId) {
      setTutorialChatBarRect(null);
      return;
    }
    const run = () => requestAnimationFrame(() => measureChatBarSpotlight());
    run();
    const timers = TUTORIAL_MEASURE_MS.map((ms) => setTimeout(measureChatBarSpotlight, ms));
    const sub = Dimensions.addEventListener('change', measureChatBarSpotlight);
    return () => {
      timers.forEach(clearTimeout);
      sub?.remove();
    };
  }, [tutorialActive, currentStep, activityId, measureChatBarSpotlight]);

  useEffect(() => {
    if (!tutorialActive || currentStep !== 4 || !activityId) {
      setTutorialForumFirstPersonRect(null);
      return;
    }
    const run = () => requestAnimationFrame(() => measureForumPeopleSpotlight());
    run();
    const timers = TUTORIAL_MEASURE_MS.map((ms) => setTimeout(measureForumPeopleSpotlight, ms));
    const sub = Dimensions.addEventListener('change', measureForumPeopleSpotlight);
    return () => {
      timers.forEach(clearTimeout);
      sub?.remove();
    };
  }, [tutorialActive, currentStep, activityId, people, peopleLoading, sidebarCollapsed, measureForumPeopleSpotlight]);
  const [reactionDetailsVisible, setReactionDetailsVisible] = useState(false);
  const [reactionDetailsLoading, setReactionDetailsLoading] = useState(false);
  const [reactionDetails, setReactionDetails] = useState<{ id: string; name: string; emojis: string[] }[]>([]);

  const renderTutorial = () => {
    if (!tutorialActive) return null;

    if (currentStep === 1 && tutorialReadyTodayRect) {
      const { x, y, width, height } = nudgeTutorialRect(tutorialReadyTodayRect);
      const step1SpotlightHole = { x, y, width, height };
      const targetCenterX = x + width / 2;
      const top = y + height + 14;
      return (
        <TutorialBubble
          step={1}
          totalSteps={4}
          title="Notify to everyone you're ready today"
          position={{ top, left: 16, right: 16 }}
          tailAt="top"
          targetCenterX={targetCenterX}
          layoutAnchorKey={`ready-${y}-${x}-${width}-${height}`}
          spotlightHole={step1SpotlightHole}
          onNext={() => nextStep()}
        />
      );
    }

    if (currentStep === 2 && tutorialPlanBtnRect && activityId) {
      const { x, y, width, height } = nudgeTutorialRect(tutorialPlanBtnRect);
      const step2SpotlightHole = { x, y, width, height };
      const targetCenterY = y + height / 2;
      const top = Math.max(56, targetCenterY - 88);
      const rightInset = windowWidth - x + 14;
      return (
        <TutorialBubble
          step={2}
          totalSteps={4}
          title="Anyone can add a plan, everyone can join"
          position={{ top, left: 12, right: rightInset }}
          tailAt="right"
          targetCenterY={targetCenterY}
          layoutAnchorKey={`plan-${y}-${x}-${width}-${height}`}
          spotlightHole={step2SpotlightHole}
          onNext={() => nextStep()}
          onBack={() => goToStep(1)}
        />
      );
    }

    if (currentStep === 3 && tutorialChatBarRect && activityId) {
      const { x, y, width, height } = nudgeTutorialRect(tutorialChatBarRect);
      const step3SpotlightHole = { x, y, width, height };
      const targetCenterX = x + width / 2;
      const top = Math.max(56, y - 120);
      return (
        <TutorialBubble
          step={3}
          totalSteps={4}
          title="Coordinate & share tips"
          position={{ top, left: 16, right: 16 }}
          tailAt="bottom"
          targetCenterX={targetCenterX}
          layoutAnchorKey={`chat-${y}-${x}-${width}-${height}`}
          spotlightHole={step3SpotlightHole}
          onNext={() => nextStep()}
          onBack={() => goToStep(2)}
        />
      );
    }

    if (currentStep === 4 && tutorialForumFirstPersonRect && activityId) {
      const { x, y, width, height } = nudgeTutorialRect(tutorialForumFirstPersonRect);
      const step4SpotlightHole = { x, y, width, height };
      const targetCenterY = y + height / 2;
      const top = Math.max(56, targetCenterY - 88);
      const rightInset = windowWidth - x + 14;
      return (
        <TutorialBubble
          step={4}
          totalSteps={4}
          title="Message people who also like this activity"
          position={{ top, left: 12, right: rightInset }}
          tailAt="right"
          targetCenterY={targetCenterY}
          layoutAnchorKey={`people-${y}-${x}-${width}-${height}`}
          spotlightHole={step4SpotlightHole}
          showDontShowAgain={tutorialShowDismissOption}
          dontShowAgain={tutorialDontShowAgain}
          onDontShowAgainChange={setTutorialDontShowAgain}
          onNext={() => void completeTutorial()}
          onBack={() => goToStep(3)}
        />
      );
    }

    // Wait for spotlight measure — avoids a flash of a misplaced fallback bubble.
    return null;
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

  useEffect(() => {
    if (!activityId) {
      setShowForumHeader(false);
      return;
    }

    const loadHeaderSeen = async () => {
      try {
        const stored = await AsyncStorage.getItem(headerSeenKey);
        const seenMap = stored ? JSON.parse(stored) : {};
        const hasSeen = !!seenMap?.[activityId];
        setShowForumHeader(!hasSeen);
      } catch (error) {
        console.error('Error loading forum header state:', error);
        setShowForumHeader(true);
      }
    };

    loadHeaderSeen();
  }, [activityId, headerSeenKey]);

  useEffect(() => {
    if (!activityId || !showForumHeader) return;

    const markHeaderSeen = async () => {
      try {
        const stored = await AsyncStorage.getItem(headerSeenKey);
        const seenMap = stored ? JSON.parse(stored) : {};
        if (!seenMap?.[activityId]) {
          seenMap[activityId] = true;
          await AsyncStorage.setItem(headerSeenKey, JSON.stringify(seenMap));
        }
      } catch (error) {
        console.error('Error saving forum header state:', error);
      }
    };

    markHeaderSeen();
  }, [activityId, headerSeenKey, showForumHeader]);

  useEffect(() => {
    if (!lastSeenKey || !activityId) {
      setDividerLastSeenAt(null);
      return;
    }

    const loadLastSeen = async () => {
      try {
        const stored = await AsyncStorage.getItem(lastSeenKey);
        const lastSeenMap = stored ? JSON.parse(stored) : {};
        setDividerLastSeenAt(lastSeenMap?.[activityId] || null);
      } catch (error) {
        console.error('Error loading last seen time:', error);
        setDividerLastSeenAt(null);
      }
    };

    loadLastSeen();
  }, [activityId, lastSeenKey]);

  // Initial mark-as-seen: fires once per activity (per session) as soon as
  // debouncedActivityId has settled and its messages have loaded.
  // Keyed on debouncedActivityId because `messages` always belongs to that id.
  // The Set is marked synchronously before any await so a concurrent re-fire
  // (e.g. background fetch arriving while the first async call is in flight) can't
  // start a second overlapping write for the same activity.
  useEffect(() => {
    if (!user || !debouncedActivityId || loading) return;
    if (!lastSeenKey) return;
    if (markedSeenActivitiesRef.current.has(debouncedActivityId)) return;

    // Claim the slot synchronously — prevents a second async call racing in.
    markedSeenActivitiesRef.current.add(debouncedActivityId);

    const seenAt = messages[0]?.created_at || new Date().toISOString();
    const targetId = debouncedActivityId; // capture for the async closure

    const updateLastSeen = async () => {
      try {
        const stored = await AsyncStorage.getItem(lastSeenKey);
        const lastSeenMap = stored ? JSON.parse(stored) : {};
        lastSeenMap[targetId] = seenAt;
        await AsyncStorage.setItem(lastSeenKey, JSON.stringify(lastSeenMap));
        touchForumLastSeen();
        // Persist to DB so this survives reinstalls / device switches.
        void supabase
          .from('user_activity_skills')
          .update({ forum_seen_at: seenAt })
          .eq('user_id', user.id)
          .eq('activity_id', targetId);
      } catch (error) {
        console.error('Error saving last seen time:', error);
      }
    };

    updateLastSeen();
  }, [user, debouncedActivityId, loading, messages[0]?.created_at, lastSeenKey, touchForumLastSeen]);

  // Silent update: when messages change for debouncedActivityId (background fetch or
  // realtime), advance lastSeen AND re-trigger a badge refresh.
  //
  // Using debouncedActivityId (not activityId) means this still fires for the OLD
  // activity during the 400 ms window after the user switches away — exactly the case
  // where the initial mark-as-seen saved a stale timestamp from the cache, the badge
  // refresh found new DB messages, and we need to correct it once the fresh data lands.
  useEffect(() => {
    if (!debouncedActivityId) return;
    if (!markedSeenActivitiesRef.current.has(debouncedActivityId)) return;
    if (!lastSeenKey) return;
    const latestAt = messages[0]?.created_at;
    if (!latestAt) return;

    const targetId = debouncedActivityId;

    const silentUpdate = async () => {
      try {
        const stored = await AsyncStorage.getItem(lastSeenKey);
        const map = stored ? JSON.parse(stored) : {};
        if (!map[targetId] || latestAt > map[targetId]) {
          map[targetId] = latestAt;
          await AsyncStorage.setItem(lastSeenKey, JSON.stringify(map));
          touchForumLastSeen();
          // Persist to DB so this survives reinstalls / device switches.
          if (user?.id) {
            void supabase
              .from('user_activity_skills')
              .update({ forum_seen_at: latestAt })
              .eq('user_id', user.id)
              .eq('activity_id', targetId);
          }
        }
      } catch {
        // Non-fatal
      }
    };

    silentUpdate();
  }, [messages[0]?.created_at, debouncedActivityId, lastSeenKey, user?.id]);

  // Guarantee zero badge while the forum is visible for this activity.
  // Badge refreshes query the DB with a potentially stale lastSeen and can briefly
  // return a non-zero count before silentUpdate corrects it. This effect is the
  // final safety net: the moment the store shows a badge for the activity the user
  // is actively looking at, it is zeroed out synchronously (no visible flash).
  const forumUnreadForActivity = useActivityBadgeStore(
    (s) => (debouncedActivityId ? s.forumUnreadByActivity[debouncedActivityId] ?? 0 : 0)
  );
  const zeroOutForumBadge = useActivityBadgeStore((s) => s.zeroOutForumBadge);
  useEffect(() => {
    if (!debouncedActivityId) return;
    if (forumUnreadForActivity > 0) {
      zeroOutForumBadge(debouncedActivityId);
    }
  }, [debouncedActivityId, forumUnreadForActivity, zeroOutForumBadge]);

  /** Never carry draft / reply / attachments from another activity's forum. */
  useEffect(() => {
    setNewMessage('');
    setReplyingTo(null);
    setSelectedImages([]);
    setReactionPickerState(null);
    setMessageActionMenu(null);
    setHighlightedMessageId(null);
  }, [activityId]);

  const performSidebarPlanJoin = async (plan: ActivityPlan) => {
    const result = await toggleJoin(plan.id);
    if (!result.ok) {
      Alert.alert('Could not update RSVP', result.error ?? 'Please try again.');
    }
  };

  const handleSidebarPlanJoin = (plan: ActivityPlan) => {
    if (!user) {
      requireAuth('join a plan');
      return;
    }

    const requiresApproval =
      !!plan.join_approval_required &&
      plan.creator_id !== user.id &&
      !plan.current_user_joined &&
      plan.current_user_request_status !== 'pending';

    if (requiresApproval) {
      Alert.alert(
        'Host approval required',
        'This plan requires the host to approve your request before you can join. You will be notified once they respond.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Join', onPress: () => void performSidebarPlanJoin(plan) },
        ]
      );
      return;
    }

    void performSidebarPlanJoin(plan);
  };

  const getSidebarJoinLabel = (plan: ActivityPlan) => {
    if (plan.current_user_joined) return 'Joined';
    if (plan.current_user_request_status === 'pending') return 'Request sent';
    const seatsTaken = plan.join_count ?? 0;
    const seatsMax = plan.max_rsvps ?? null;
    const seatsFull = seatsMax !== null && seatsTaken >= seatsMax;
    const requiresApprovalForUser = !!plan.join_approval_required && plan.creator_id !== user?.id;
    if (seatsFull) return 'Full';
    if (requiresApprovalForUser) return 'Request';
    return 'Join';
  };

  const isSidebarJoinDisabled = useCallback(
    (plan: ActivityPlan) => {
      const seatsTaken = plan.join_count ?? 0;
      const seatsMax = plan.max_rsvps ?? null;
      const seatsFull = seatsMax !== null && seatsTaken >= seatsMax;
      const requestPending = plan.current_user_request_status === 'pending';

      return (
        joiningPlanId === plan.id ||
        plan.current_user_joined ||
        requestPending ||
        seatsFull
      );
    },
    [joiningPlanId]
  );

  const isPlanJoinCalloutEligible = useCallback(
    (plan: ActivityPlan) => {
      if (!user) return false;
      if (plan.creator_id === user.id) return false;
      if (plan.current_user_joined) return false;
      if (plan.current_user_request_status === 'pending') return false;
      return !isSidebarJoinDisabled(plan);
    },
    [user, isSidebarJoinDisabled]
  );

  const calloutPlan = useMemo(
    () => plans.find((plan) => isPlanJoinCalloutEligible(plan)) ?? null,
    [plans, isPlanJoinCalloutEligible]
  );

  const planJoinCalloutBaseEligible =
    !!user &&
    !!debouncedActivityId &&
    !sidebarCollapsed &&
    !tutorialActive &&
    !!calloutPlan &&
    planCalloutDailyLoaded &&
    !planCalloutHiddenSession;

  const showPlanJoinCallout =
    planJoinCalloutBaseEligible && (planCalloutRevealed || !planCalloutShownToday);

  const markPlanCalloutShownToday = useCallback(() => {
    if (!user?.id || planCalloutMarkedRef.current) return;
    planCalloutMarkedRef.current = true;
    const today = appCalendarDateKey();
    setPlanCalloutShownToday(true);
    void AsyncStorage.setItem(PLAN_JOIN_CALLOUT_DAILY_KEY(user.id), today);
  }, [user?.id]);

  useEffect(() => {
    planCalloutMarkedRef.current = false;
    calloutPositionReadyRef.current = false;
    setPlanCalloutDailyLoaded(false);
    setPlanCalloutRevealed(false);
    setPlanCalloutPos(null);
    if (!user?.id) {
      setPlanCalloutShownToday(true);
      return;
    }

    let cancelled = false;
    const loadShownToday = async () => {
      const stored = await AsyncStorage.getItem(PLAN_JOIN_CALLOUT_DAILY_KEY(user.id));
      if (!cancelled) {
        setPlanCalloutShownToday(stored === appCalendarDateKey());
        setPlanCalloutDailyLoaded(true);
      }
    };
    void loadShownToday();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    calloutPositionReadyRef.current = false;
    setPlanCalloutRevealed(false);
    setPlanCalloutPos(null);
  }, [debouncedActivityId, calloutPlan?.id]);

  const dismissPlanJoinCallout = useCallback(() => {
    setPlanCalloutHiddenSession(true);
    setPlanCalloutRevealed(false);
    setPlanCalloutPos(null);
    calloutPositionReadyRef.current = false;
    markPlanCalloutShownToday();
  }, [markPlanCalloutShownToday]);

  const measurePlanCalloutPosition = useCallback(() => {
    if (!showPlanJoinCallout || !calloutPlan?.id || !calloutPlanRowRef.current) {
      return;
    }
    if (calloutPositionReadyRef.current) {
      return;
    }

    calloutPlanRowRef.current.measureInWindow((rowX, rowY, _rowW, rowH) => {
      const bubbleH = 52;
      const bubbleW = PLAN_JOIN_CALLOUT_BUBBLE_WIDTH;
      const androidYAdjust = Platform.OS === 'android' ? TUTORIAL_ANDROID_Y_NUDGE : 0;
      const nextTop = rowY + rowH / 2 - bubbleH / 2 + androidYAdjust;
      const nextLeft = rowX - bubbleW - 11;
      calloutPositionReadyRef.current = true;
      setPlanCalloutRevealed(true);
      markPlanCalloutShownToday();
      setPlanCalloutPos({ top: nextTop, left: nextLeft });
    });
  }, [showPlanJoinCallout, calloutPlan?.id]);

  useEffect(() => {
    if (!showPlanJoinCallout) {
      calloutPositionReadyRef.current = false;
      setPlanCalloutPos(null);
      return;
    }

    const frame = requestAnimationFrame(() => {
      measurePlanCalloutPosition();
    });
    const retry = setTimeout(measurePlanCalloutPosition, 400);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(retry);
    };
  }, [showPlanJoinCallout, calloutPlan?.id, measurePlanCalloutPosition]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
    });

    if (!result.canceled) {
      const uris = result.assets.map(asset => asset.uri);
      setSelectedImages(prev => [...prev, ...uris]);
    }
  };

  const openAttachMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Photo', 'Poll'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) void pickImage();
          if (buttonIndex === 2) setCreatePollVisible(true);
        }
      );
    } else {
      Alert.alert('Attach', undefined, [
        { text: 'Photo', onPress: () => void pickImage() },
        { text: 'Poll', onPress: () => setCreatePollVisible(true) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const flatListRef = useRef<FlatList>(null);
  const [pendingScrollMessageId, setPendingScrollMessageId] = useState<string | null>(null);

  const openGallery = (imageUrls: string[], index: number) => {
    const formattedImages = imageUrls.map(url => ({ uri: url }));
    setGalleryImages(formattedImages);
    setGalleryIndex(index);
    setIsGalleryVisible(true);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && selectedImages.length === 0) return;
    
    if (newMessage.trim().length > 1000) {
      Alert.alert('Message Too Long', 'Please keep messages under 1000 characters');
      return;
    }

    setIsSending(true);

    try {
      const success = await sendMessage(
        newMessage,
        replyingTo?.id,
        selectedImages,
        mentionEntries
      );
      if (success) {
        setNewMessage('');
        setReplyingTo(null);
        setSelectedImages([]);
      } else {
        Alert.alert('Error', 'Failed to send message.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setIsSending(false);
    }
  };

  const handleLongPress = (message: any, layout?: ReactionPickerLayout) => {
    const canReply = message.user_id !== user?.id;
    if (layout) {
      setMessageActionMenu({ message, layout });
      return;
    }

    if (!canReply) return;
    setReplyingTo(message);
  };

  const handleReactionSelect = (emoji: string) => {
    if (!reactionPickerState) return;
    toggleReaction(reactionPickerState.messageId, emoji);
    setReactionPickerState(null);
  };

  const openReactionDetails = async (messageId: string) => {
    const summaries = getReactions(messageId);
    if (!summaries || summaries.length === 0) return;
    const userIds = Array.from(
      new Set(
        summaries.flatMap((s) => s.userIds)
      )
    ).filter(Boolean);
    if (userIds.length === 0) return;

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
      const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
      const items = userIds
        .map((id) => {
          const p = byId.get(id);
          if (!p) return null;
          const emojis = summaries
            .filter((s) => s.userIds.includes(id))
            .map((s) => s.emoji);
          return {
            id,
            name: p.name || 'Member',
            emojis,
          };
        })
        .filter((x): x is { id: string; name: string; emojis: string[] } => !!x);
      setReactionDetails(items);
    } finally {
      setReactionDetailsLoading(false);
    }
  };

  const openReactionPickerFromMenu = () => {
    if (!messageActionMenu) return;
    setReactionPickerState({
      messageId: messageActionMenu.message.id,
      layout: messageActionMenu.layout,
    });
    setMessageActionMenu(null);
  };

  const startReplyFromMenu = () => {
    if (!messageActionMenu) return;
    if (messageActionMenu.message.user_id === user?.id) {
      setMessageActionMenu(null);
      return;
    }
    setReplyingTo(messageActionMenu.message);
    setMessageActionMenu(null);
  };

  const openEditFromMenu = () => {
    if (!messageActionMenu) return;
    const msg = messageActionMenu.message;
    if (msg.user_id !== user?.id || msg.deleted_at) {
      setMessageActionMenu(null);
      return;
    }
    setEditForumMessage({ id: msg.id, text: msg.message || '' });
    setMessageActionMenu(null);
  };

  const confirmDeleteFromMenu = () => {
    if (!messageActionMenu) return;
    const msg = messageActionMenu.message;
    if (msg.user_id !== user?.id || msg.deleted_at) {
      setMessageActionMenu(null);
      return;
    }
    setMessageActionMenu(null);
    Alert.alert('Delete message?', 'This will remove your forum message.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const ok = await deleteMessage(msg.id);
            if (!ok) Alert.alert('Could not delete', 'Please try again.');
          })();
        },
      },
    ]);
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const tryScrollToMessage = useCallback(
    (messageId: string): boolean => {
      const index = messages.findIndex((msg) => msg.id === messageId);
      if (index === -1 || !flatListRef.current) return false;

      try {
        flatListRef.current.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5,
        });
        setHighlightedMessageId(messageId);
        setTimeout(() => setHighlightedMessageId(null), 2000);
        return true;
      } catch {
        return false;
      }
    },
    [messages]
  );

  const scrollToMessage = useCallback(
    (messageId: string) => {
      if (tryScrollToMessage(messageId)) {
        setPendingScrollMessageId(null);
        return;
      }
      setPendingScrollMessageId(messageId);
    },
    [tryScrollToMessage]
  );

  useEffect(() => {
    if (!pendingScrollMessageId || loading || !activityId) return;
    if (tryScrollToMessage(pendingScrollMessageId)) {
      setPendingScrollMessageId(null);
    }
  }, [pendingScrollMessageId, messages.length, loading, activityId, tryScrollToMessage]);

  useEffect(() => {
    if (!pendingScrollMessageId) return;
    const targetId = pendingScrollMessageId;
    const failTimer = setTimeout(() => {
      if (tryScrollToMessage(targetId)) {
        setPendingScrollMessageId(null);
        return;
      }
      setPendingScrollMessageId(null);
      Alert.alert(
        'Message not found',
        'The message you are looking for might be too old or deleted.'
      );
    }, 4000);
    return () => clearTimeout(failTimer);
  }, [pendingScrollMessageId, messages.length, loading, tryScrollToMessage]);

  const isUnread = (message: any) => {
    if (!dividerLastSeenAt) return false;
    if (message.user_id === user?.id) return false;
    return new Date(message.created_at).getTime() > new Date(dividerLastSeenAt).getTime();
  };

  const mentionEntriesWithAvatars = useMemo(() => {
    const activityMembers = (people || []).map((p) => ({
      id: p.id,
      name: p.name,
      avatar_url: p.avatar_url ?? null,
    }));
    const messageAuthors = (messages || [])
      .map((msg: any) => ({
        id: msg.user_id as string,
        name: (msg.profiles?.name as string) || '',
        avatar_url: (msg.profiles?.avatar_url as string) || null,
      }))
      .filter((m) => m.id && m.name);
    const merged = [...activityMembers, ...messageAuthors];
    const seen = new Set<string>();
    return merged.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [people, messages]);

  const mentionEntries = useMemo((): MentionLookupEntry[] => {
    return mentionEntriesWithAvatars.map((m) => ({ id: m.id, name: m.name }));
  }, [mentionEntriesWithAvatars]);

  const mentionMatch = newMessage.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
  const mentionQuery = mentionMatch ? mentionMatch[1].toLowerCase() : null;

  const nameMatchesMentionQuery = (name: string, query: string) => {
    const n = name.toLowerCase();
    const q = query.toLowerCase();
    if (!q) return true;
    if (n.startsWith(q)) return true;
    return n.split(/\s+/).some((part) => part.startsWith(q));
  };

  const mentionSuggestions =
    mentionQuery === null
      ? []
      : mentionEntries
          .filter((member) => member.id !== user?.id)
          .filter((member) => nameMatchesMentionQuery(member.name, mentionQuery))
          .slice(0, 8);

  const handleSelectMention = (memberName: string) => {
    setNewMessage((prev) => prev.replace(/(^|\s)@[a-zA-Z0-9_]*$/, `$1@${memberName} `));
  };

  const handleMentionPress = useCallback((userId: string, displayName: string) => {
    router.push({
      pathname: '/(tabs)/people/[id]',
      params: { id: userId, name: displayName, from: 'forum' },
    });
  }, []);

  const handleMentionPressUnknown = useCallback(async (displayName: string) => {
    const id = await lookupProfileIdByName(displayName);
    if (id) {
      handleMentionPress(id, displayName);
    } else {
      Alert.alert('User not found', `No profile found for "${displayName}".`);
    }
  }, [handleMentionPress]);

  const handleInboxNotificationPress = useCallback(
    async (item: InboxNotification) => {
      await markInboxRead(item.id);
      setNotificationsModalVisible(false);
      setPendingScrollMessageId(null);

      const d = parseInboxNotificationData(item.data);

      if (item.type === 'app_update') {
        useNotificationNavStore.getState().trigger({ target: 'chats' });
        router.navigate({ pathname: '/(tabs)/chats', params: { tab: 'updates' } });
        return;
      }

      if (item.type === 'direct_message') {
        const chatUserId = d.otherUserId || d.senderId;
        if (chatUserId) {
          useNotificationNavStore.getState().trigger({
            target: 'dm',
            chatUserId,
          });
          router.push({
            pathname: '/(tabs)/chats/[id]',
            params: {
              id: chatUserId,
              name: d.senderName || 'User',
            },
          });
          return;
        }
      }

      if (item.type === 'plan_group_chat_message' && d.groupChatId) {
        useNotificationNavStore.getState().trigger({
          target: 'groupChat',
          groupChatId: d.groupChatId,
        });
        router.push({
          pathname: '/(tabs)/chats/group/[id]',
          params: {
            id: d.groupChatId,
            planTitle: d.planTitle || 'Group chat',
          },
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

      if (item.type === 'forum_mention' && d.messageId) {
        useNotificationNavStore.getState().trigger({ target: 'forum' });
        scrollToMessage(d.messageId);
      }
    },
    [markInboxRead, setActivity, scrollToMessage, userSkills]
  );

  const renderMessage = ({ item, index }: { item: any; index: number }) => {
    if (item.deleted_at) return null;

    const prevMessage = messages[index - 1];
    const showDivider =
      index > 0 && !isUnread(item) && prevMessage && isUnread(prevMessage);

    return (
      <View>
        {showDivider && (
          <View style={styles.newDivider}>
            <View style={styles.newDividerLine} />
            <Text style={styles.newDividerText}>New Messages</Text>
            <View style={styles.newDividerLine} />
          </View>
        )}
        <ForumMessageItem
          item={item}
          currentUserId={user?.id}
          profileName={profile?.name}
          messages={messages}
          highlightedId={highlightedMessageId}
          skillLevel={skillLevel}
          onLongPress={handleLongPress}
          reactions={getReactions(item.id)}
          currentUserEmoji={getCurrentUserEmoji(item.id)}
          onOpenGallery={openGallery}
          onScrollToMessage={scrollToMessage}
          onRemoveReaction={(id, emoji) => toggleReaction(id, emoji)}
          onPressReactions={openReactionDetails}
          onForumPollChanged={refetchForumMessages}
          mentionEntries={mentionEntries}
          onMentionPress={handleMentionPress}
          onMentionPressUnknown={handleMentionPressUnknown}
        />
      </View>
    );
  };

  const formatSidebarEventDayDate = (eventDate: string) => {
    try {
      const [year, month, day] = eventDate.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `${dayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}`;
    } catch {
      return eventDate;
    }
  };

  const tutorialOverlay = renderTutorial();

  return (
    <View style={styles.screenRoot}>
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ReactionPicker
        visible={!!reactionPickerState}
        anchorLayout={reactionPickerState?.layout ?? null}
        onSelect={handleReactionSelect}
        onClose={() => setReactionPickerState(null)}
      />
      <MessageEditModal
        visible={!!editForumMessage}
        initialText={editForumMessage?.text ?? ''}
        title="Edit message"
        onClose={() => setEditForumMessage(null)}
        onSave={async (text) => {
          if (!editForumMessage) return false;
          const ok = await updateMessage(editForumMessage.id, text);
          if (!ok) Alert.alert('Could not save', 'Please try again.');
          return ok;
        }}
      />
      <PastPlansModal
        visible={pastPlansVisible}
        activityId={debouncedActivityId || activityId}
        activityName={activity}
        onClose={() => setPastPlansVisible(false)}
      />
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
                  <View style={styles.reactionDetailsLoading}>
                    <LoadingSpinner size={20} />
                  </View>
                ) : reactionDetails.length === 0 ? (
                  <Text style={styles.reactionDetailsEmpty}>No reactions yet.</Text>
                ) : (
                  reactionDetails.map((u) => (
                    <View key={u.id} style={styles.reactionDetailsRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reactionDetailsName}>{u.name}</Text>
                      </View>
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
                      const menuWidth = 164;
                      const own = messageActionMenu.message.user_id === user?.id;
                      const deleted = !!messageActionMenu.message.deleted_at;
                      let rows = 1;
                      if (!deleted) {
                        rows += 1;
                        if (!own) rows += 1;
                        if (own) rows += 1;
                        if (own) rows += 1;
                      }
                      const menuHeight = rows * 44 + 16;
                      const HEADER_HEIGHT = 90;
                      const placeAbove = messageActionMenu.layout.y - menuHeight - 8 > HEADER_HEIGHT;
                      const messagesColumnWidth = !sidebarCollapsed ? SCREEN_WIDTH * 0.62 : SCREEN_WIDTH;
                      const left = Math.max(
                        12,
                        Math.min(
                          messageActionMenu.layout.x + messageActionMenu.layout.width / 2 - menuWidth / 2,
                          messagesColumnWidth - menuWidth - 12
                        )
                      );
                      const rawTop = placeAbove
                        ? messageActionMenu.layout.y - menuHeight - 8
                        : messageActionMenu.layout.y + messageActionMenu.layout.height + 8;
                      const top = Math.max(HEADER_HEIGHT + 8, rawTop);
                      return { left, top };
                    })(),
                  ]}
                >
                  {!messageActionMenu.message.deleted_at && messageActionMenu.message.user_id !== user?.id && (
                    <TouchableOpacity style={styles.messageActionRow} onPress={startReplyFromMenu}>
                      <Ionicons name="arrow-undo-outline" size={16} color="#333" />
                      <Text style={styles.messageActionText}>Reply</Text>
                    </TouchableOpacity>
                  )}
                  {!messageActionMenu.message.deleted_at && (
                    <TouchableOpacity style={styles.messageActionRow} onPress={openReactionPickerFromMenu}>
                      <Ionicons name="happy-outline" size={16} color="#333" />
                      <Text style={styles.messageActionText}>React</Text>
                    </TouchableOpacity>
                  )}
                  {messageActionMenu.message.user_id === user?.id && !messageActionMenu.message.deleted_at && (
                    <TouchableOpacity style={styles.messageActionRow} onPress={openEditFromMenu}>
                      <Ionicons name="pencil-outline" size={16} color="#333" />
                      <Text style={styles.messageActionText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                  {messageActionMenu.message.user_id === user?.id && !messageActionMenu.message.deleted_at && (
                    <TouchableOpacity style={styles.messageActionRow} onPress={confirmDeleteFromMenu}>
                      <Ionicons name="trash-outline" size={16} color="#C62828" />
                      <Text style={[styles.messageActionText, { color: '#C62828' }]}>Delete</Text>
                    </TouchableOpacity>
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

      <NotificationsInboxModal
        visible={notificationsModalVisible}
        onClose={() => setNotificationsModalVisible(false)}
        items={inboxNotifications}
        loading={inboxLoading}
        onMarkAllRead={() => void markAllInboxRead()}
        onPressItem={(item) => void handleInboxNotificationPress(item)}
      />

      {/* ── Top Header ── */}
      <View style={styles.topHeader}>
        {/* Center: activity name */}
        <View style={styles.headerCenter}>
          <Text style={styles.topHeaderTitle} numberOfLines={1}>
            {activity || 'Select Activity'}
          </Text>
          <Text style={styles.topHeaderChannel}>Channel</Text>
          {false && user && activityId && (
            <View
              ref={tutorialReadyTodayRef}
              collapsable={false}
              onLayout={() => {
                if (tutorialActive && currentStep === 1) measureReadyTodaySpotlight();
              }}
              style={styles.readyTodayRow}
            >
              <Text style={[styles.readyTodayLabel, isReadyToday && styles.readyTodayLabelActive]}>
                Active Today
              </Text>
              <ReadyTodayToggle
                value={isReadyToday}
                onValueChange={(val) => {
                  if (activityId) {
                    updateReadyToday(activityId, val);
                    if (val) setShowReadyTodayPrompt(true);
                  }
                }}
                size="compact"
              />
            </View>
          )}
        </View>

        {/* Right: alerts + chats + profile with labels */}
        <View style={styles.headerRightBtns}>
          {user && (
            <TouchableOpacity
              style={[styles.headerIconBtnLabeled, styles.headerAlertsBtn]}
              onPress={() => setNotificationsModalVisible(true)}
            >
              <View>
                <Ionicons name="notifications-outline" size={20} color="#555" />
                {inboxUnreadCount > 0 ? (
                  <View style={styles.inboxBadge}>
                    <Text style={styles.inboxBadgeText}>
                      {inboxUnreadCount > 99 ? '99+' : inboxUnreadCount}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.headerIconLabel}>Alerts</Text>
            </TouchableOpacity>
          )}
          {user && (
            <TouchableOpacity
              style={styles.headerIconBtnLabeled}
              onPress={() => router.navigate('/(tabs)/chats')}
            >
              <View>
                <Ionicons name="chatbubble-outline" size={20} color="#555" />
                {unreadChatCount > 0 ? (
                  <View style={styles.inboxBadge}>
                    <Text style={styles.inboxBadgeText}>
                      {unreadChatCount > 99 ? '99+' : unreadChatCount}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.headerIconLabel}>Chats</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.headerIconBtnLabeled}
            onPress={() => router.navigate('/(tabs)/profile')}
          >
            <Ionicons name="person-outline" size={20} color="#555" />
            <Text style={styles.headerIconLabel}>Profile</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AppKeyboardAvoidingView style={styles.keyboardContainer}>
        <View style={styles.forumRow}>
          <View style={[styles.messagesColumn, activityId && (sidebarCollapsed ? styles.messagesColumnCollapsed : styles.messagesColumnWithPeople)]}>
            {activityId ? (
              <View style={styles.messagesListWrap}>
                <FlatList
                  ref={flatListRef}
                  inverted
                  data={messages}
                  renderItem={renderMessage}
                  keyExtractor={(item) => item.id}
                  style={styles.messagesList}
                  contentContainerStyle={[
                    styles.messagesContainer,
                    messages.length === 0 && styles.messagesContainerEmpty,
                  ]}
                  onScrollToIndexFailed={(info) => {
                    flatListRef.current?.scrollToIndex({
                      index: info.index,
                      animated: true,
                      viewPosition: 0.5,
                    });
                  }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                />
                {messages.length === 0 ? (
                  <View style={styles.emptyForumOverlay} pointerEvents="none">
                    {loading ? (
                      <>
                        <LoadingSpinner size={28} />
                        <Text style={[styles.emptyForumSubtitle, { marginTop: 12 }]}>Loading…</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.emptyForumTitle}>No messages yet</Text>
                        <Text style={styles.emptyForumSubtitle}>
                          Be the first to post in this activity
                        </Text>
                      </>
                    )}
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.emptyState}>
                {profileLoading ? (
                  <>
                    <LoadingSpinner size={28} />
                    <Text style={[styles.emptySubtitle, { marginTop: 12 }]}>Loading your activities…</Text>
                  </>
                ) : userSkills.length === 0 ? (
                  <>
                    <Text style={styles.emptyTitle}>Add your first activity</Text>
                    <Text style={styles.emptySubtitle}>
                      Tap + below to pick an activity and join the forum
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.emptyTitle}>Select an activity to join the forum</Text>
                    <Text style={styles.emptySubtitle}>
                      Scroll the wheel below to switch activities
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>

          {/* ── Right Sidebar ── */}
          {activityId && (
            <View
              key={activityId}
              style={[
                styles.peopleColumnAbsolute,
                sidebarCollapsed ? styles.sidebarCollapsed : styles.sidebarExpanded,
              ]}
            >
              {/* Toggle arrow */}
              <TouchableOpacity
                style={styles.sidebarToggle}
                onPress={() => setSidebarCollapsed((c) => !c)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={sidebarCollapsed ? 'chevron-back-outline' : 'chevron-forward-outline'}
                  size={14}
                  color="#888"
                />
              </TouchableOpacity>

              {sidebarCollapsed ? (
                /* Collapsed: icon + count pills — People first, Plans second */
                <View style={styles.sidebarCollapsedContent}>
                  <View style={styles.sidebarCountPill}>
                    <Ionicons name="people-outline" size={14} color="#666" />
                    <Text style={styles.sidebarCountText}>{people.length}</Text>
                  </View>
                  <View style={styles.sidebarCountPill}>
                    <Ionicons name="calendar-outline" size={14} color="#666" />
                    <Text style={styles.sidebarCountText}>{plans.length}</Text>
                  </View>
                </View>
              ) : (
                /* Expanded: People (top half) + Plans (bottom half) */
                <View style={styles.sidebarExpandedContent}>

                  {/* ── People section (top half) ── */}
                  <View style={styles.sidebarHalf}>
                    <View
                      ref={tutorialForumPeopleHeaderRef}
                      collapsable={false}
                      onLayout={() => {
                        if (tutorialActive && currentStep === 4) measureForumPeopleSpotlight();
                      }}
                      style={styles.sidebarSectionHeader}
                    >
                      <Text style={styles.sidebarSectionTitle}>People ({people.length})</Text>
                    </View>
                    {peopleLoading ? (
                      <View
                        ref={tutorialForumFirstPersonRef}
                        collapsable={false}
                        style={styles.peopleEmptyState}
                        onLayout={() => {
                          if (tutorialActive && currentStep === 4) measureForumPeopleSpotlight();
                        }}
                      >
                        <LoadingSpinner size={18} />
                      </View>
                    ) : people.length === 0 ? (
                      <View style={styles.peopleEmptyState}>
                        <Text style={styles.peopleEmptyText}>No one nearby yet.</Text>
                      </View>
                    ) : (
                      <ScrollView
                        style={{ flex: 1 }}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                      >
                        <View style={styles.peopleTable}>
                          {people.map((person, index) => (
                            <View
                              key={person.id}
                              ref={index === 0 ? tutorialForumFirstPersonRef : undefined}
                              collapsable={false}
                              onLayout={() => {
                                if (index === 0 && tutorialActive && currentStep === 4) measureForumPeopleSpotlight();
                              }}
                            >
                              <TouchableOpacity
                                style={[styles.peopleRow, index === people.length - 1 && styles.peopleRowLast]}
                                activeOpacity={0.8}
                                onPress={() => router.push({ pathname: '/(tabs)/people/[id]', params: { id: person.id, name: person.name, from: 'forum' } })}
                              >
                                <View style={styles.peopleRowTop}>
                                  <Text style={styles.peopleName} numberOfLines={1} ellipsizeMode="clip">
                                    {person.name}
                                  </Text>
                                  <View style={[styles.peopleSkillDot, { backgroundColor: getSkillColor(person.skill_level) }]} />
                                </View>
                                {person.distance ? (
                                  <Text style={styles.peopleDistance}>{person.distance}</Text>
                                ) : null}
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    )}
                  </View>

                  {/* ── Plans section (bottom half) ── */}
                  <View style={[styles.sidebarHalf, styles.sidebarEventHalf]}>
                    <View style={styles.sidebarSectionHeader}>
                      <Text style={styles.sidebarSectionTitle}>Plans ({plans.length})</Text>
                    </View>

                    {/* ── + Plan button ── */}
                    {user && activityId && (
                      <View
                        ref={tutorialPlanBtnRef}
                        collapsable={false}
                        onLayout={() => {
                          if (tutorialActive && currentStep === 2) measurePlanBtnSpotlight();
                        }}
                      >
                        <TouchableOpacity
                          style={styles.sidebarPlanBtn}
                          onPress={() => setCreatePlanVisible(true)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="add" size={13} color="white" />
                          <Text style={styles.sidebarPlanBtnText}>Create Plan</Text>
                        </TouchableOpacity>
                        {plans.length > 0 && (
                          <Text style={styles.sidebarNoEvents}>Add a plan for others to join!</Text>
                        )}
                      </View>
                    )}
                    {plans.length === 0 ? (
                      <Text style={styles.sidebarNoEvents}>{"No plans yet — show everyone what you're up to!\n\nAdd a plan for others to join!"}</Text>
                    ) : (
                      <View style={styles.plansSectionWrap} collapsable={false}>
                        <ScrollView
                          style={{ flex: 1 }}
                          showsVerticalScrollIndicator={false}
                          nestedScrollEnabled
                          keyboardShouldPersistTaps="handled"
                        >
                        {plans.map((plan, index) => {
                          const joinLabel = getSidebarJoinLabel(plan);
                          const showJoinButton = !!user && plan.creator_id !== user.id;
                          const isPlanFull = joinLabel === 'Full';
                          const sidebarTimeLabel = plan.event_time
                            ? formatPlanTime12hShort(plan.event_time)
                            : '';
                          const pulseJoinButton =
                            showPlanJoinCallout &&
                            calloutPlan?.id === plan.id &&
                            showJoinButton &&
                            !isSidebarJoinDisabled(plan);
                          return (
                            <View
                              key={plan.id}
                              ref={calloutPlan?.id === plan.id ? calloutPlanRowRef : undefined}
                              collapsable={false}
                              style={styles.sidebarEventRow}
                            >
                              <TouchableOpacity
                                onPress={() => router.navigate('/(tabs)/plans')}
                                activeOpacity={0.7}
                              >
                                <Text
                                  style={styles.sidebarEventTitle}
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                >
                                  {plan.title?.trim() ? plan.title : 'Meetup'}
                                </Text>
                              </TouchableOpacity>
                              <View style={styles.sidebarEventMetaRow}>
                                <TouchableOpacity
                                  style={styles.sidebarEventMetaText}
                                  onPress={() => router.navigate('/(tabs)/plans')}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.sidebarEventDate}>
                                    {formatSidebarEventDayDate(plan.event_date)}
                                  </Text>
                                  {sidebarTimeLabel ? (
                                    <Text style={styles.sidebarEventTime}>{sidebarTimeLabel}</Text>
                                  ) : null}
                                </TouchableOpacity>
                                {showJoinButton ? (
                                  isPlanFull ? (
                                    <Text style={styles.sidebarJoinFullLabel}>Full</Text>
                                  ) : (
                                    <TouchableOpacity
                                      style={[
                                        styles.sidebarJoinBtn,
                                        plan.current_user_joined && styles.sidebarJoinBtnJoined,
                                        isSidebarJoinDisabled(plan) &&
                                          !plan.current_user_joined &&
                                          styles.sidebarJoinBtnDisabled,
                                      ]}
                                      onPress={() => handleSidebarPlanJoin(plan)}
                                      disabled={isSidebarJoinDisabled(plan)}
                                      activeOpacity={0.8}
                                    >
                                      {joiningPlanId === plan.id ? (
                                        <ActivityIndicator size="small" color="#4CAF50" />
                                      ) : (
                                        <PulsingJoinLabel
                                          active={pulseJoinButton}
                                          style={[
                                            styles.sidebarJoinBtnText,
                                            plan.current_user_joined && styles.sidebarJoinBtnTextJoined,
                                            isSidebarJoinDisabled(plan) &&
                                              !plan.current_user_joined &&
                                              styles.sidebarJoinBtnTextDisabled,
                                          ]}
                                        >
                                          {joinLabel}
                                        </PulsingJoinLabel>
                                      )}
                                    </TouchableOpacity>
                                  )
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                        </ScrollView>
                      </View>
                    )}
                    {!!activityId && (
                      <TouchableOpacity
                        style={styles.sidebarPastPlansBtn}
                        onPress={() => setPastPlansVisible(true)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={`View past ${activity || 'activity'} plans`}
                      >
                        <Ionicons name="time-outline" size={14} color="#777" />
                        <View style={styles.sidebarPastPlansText}>
                          <Text style={styles.sidebarPastPlansTitle}>Past Plans</Text>
                          <Text style={styles.sidebarPastPlansSubtitle}>See previous meetups</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color="#999" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {activityId && (
          <>
            {!user && (
              <View style={styles.loginPrompt}>
                <Text style={styles.loginPromptText}>
                  Sign in to join the conversation
                </Text>
                <TouchableOpacity
                  style={styles.loginPromptButton}
                  onPress={() => router.push('/(auth)/login')}
                >
                  <Text style={styles.loginPromptButtonText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            )}

            {user && replyingTo && (
              <View style={styles.replyPreview}>
                <View style={styles.replyPreviewHeader}>
                  <Ionicons name="arrow-undo" size={16} color="#FF8C42" />
                  <Text style={styles.replyPreviewText}>
                    Replying to {replyingTo.profiles?.name || 'Unknown'}
                  </Text>
                  <TouchableOpacity onPress={cancelReply} style={styles.cancelReplyButton}>
                    <Ionicons name="close" size={16} color="#666" />
                  </TouchableOpacity>
                </View>
                {replyingTo.message ? (
                  <Text style={styles.replyPreviewMessage} numberOfLines={2}>
                    {replyingTo.message}
                  </Text>
                ) : null}
              </View>
            )}

            {user && (
              <View style={styles.inputWrapper}>
                {selectedImages.length > 0 && (
                  <ScrollView horizontal contentContainerStyle={styles.previewContainer} showsHorizontalScrollIndicator={false}>
                    {selectedImages.map((uri, index) => (
                      <View key={index} style={styles.previewItem}>
                        <CachedImage source={{ uri }} style={styles.previewImage} />
                        <TouchableOpacity
                          style={styles.removeImageButton}
                          onPress={() => setSelectedImages(imgs => imgs.filter((_, i) => i !== index))}
                        >
                          <Ionicons name="close-circle" size={20} color="white" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}
                {mentionSuggestions.length > 0 && (
                  <View style={styles.mentionSuggestions}>
                    {mentionSuggestions.map((member) => {
                      const avatar = mentionEntriesWithAvatars.find((m) => m.id === member.id)
                        ?.avatar_url;
                      return (
                      <TouchableOpacity
                        key={member.id}
                        style={styles.mentionSuggestionRow}
                        onPress={() => handleSelectMention(member.name)}
                      >
                        <CachedImage
                          source={avatar ? { uri: avatar } : ICONS.profileIcon}
                          style={styles.mentionAvatar}
                          recyclingKey={member.id}
                        />
                        <Text style={styles.mentionSuggestionText}>{member.name}</Text>
                      </TouchableOpacity>
                    );
                    })}
                  </View>
                )}
                <View
                  ref={tutorialChatBarRef}
                  collapsable={false}
                  onLayout={() => {
                    if (tutorialActive && currentStep === 3) measureChatBarSpotlight();
                  }}
                  style={styles.inputContainer}
                >
                  <TouchableOpacity
                    style={[styles.sendButton, { marginRight: 10 }, isSending && { opacity: 0.5 }]}
                    onPress={openAttachMenu}
                    disabled={isSending}
                  >
                    <Ionicons name="add-circle" size={28} color="white" />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.textInput}
                    value={newMessage}
                    onChangeText={setNewMessage}
                    placeholder={replyingTo ? `Reply to ${replyingTo.profiles?.name || 'Unknown'}...` : 'Type your message...'}
                    placeholderTextColor="#999"
                    maxLength={1000}
                    multiline
                    editable={!isSending}
                  />
                  <TouchableOpacity
                    style={[
                      styles.sendButton,
                      (isSending || (!newMessage.trim() && selectedImages.length === 0)) && { opacity: 0.7 },
                    ]}
                    onPress={handleSendMessage}
                    disabled={isSending || (!newMessage.trim() && selectedImages.length === 0)}
                  >
                    {isSending ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Ionicons name="send" size={20} color="white" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}

      </AppKeyboardAvoidingView>


      {/* ── Bottom Activity Wheel (outside KAV so keyboard slides over it) ── */}
      <ActivityCarousel
        showAddRemove
        wheelMode
        notificationSource="forum"
        extraStripTopInset={0}
        bottomInset={insets.bottom}
      />

      <CreateForumPollModal
        visible={createPollVisible}
        activityId={activityId}
        onClose={() => setCreatePollVisible(false)}
        onCreated={() => refetchForumMessages()}
      />
      <ImageView
        images={galleryImages}
        imageIndex={galleryIndex}
        visible={isGalleryVisible}
        onRequestClose={() => setIsGalleryVisible(false)}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
      />
      <CreatePlanModal
        visible={createPlanVisible}
        onClose={() => setCreatePlanVisible(false)}
        onCreated={() => {
          void refetchPlans(true);
        }}
      />

      {/* Ready Today prompt — custom modal so we can control styling fully */}
      <Modal
        visible={showReadyTodayPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReadyTodayPrompt(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowReadyTodayPrompt(false)}>
          <View style={styles.readyPromptOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.readyPromptCard}>
                <Text style={styles.readyPromptTitle}>
                  {"You're ready!\nWe'll let everyone know"}
                </Text>
                <Text style={styles.readyPromptBody}>
                  Already have a plan? Create one for others to join!
                </Text>
                <TouchableOpacity
                  style={styles.readyPromptPrimaryBtn}
                  activeOpacity={0.85}
                  onPress={() => {
                    setShowReadyTodayPrompt(false);
                    setPendingOpenCreatePlan(true);
                  }}
                >
                  <Text style={styles.readyPromptPrimaryBtnText}>Create a plan</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.readyPromptSecondaryBtn}
                  activeOpacity={0.7}
                  onPress={() => setShowReadyTodayPrompt(false)}
                >
                  <Text style={styles.readyPromptSecondaryBtnText}>Maybe later</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
    {Platform.OS === 'android' ? (
      <Modal
        visible={FORUM_TUTORIAL_ENABLED && tutorialActive && !!tutorialOverlay}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => endTutorial()}
      >
        <View style={styles.androidTutorialModalRoot} pointerEvents="box-none">
          {tutorialOverlay}
        </View>
      </Modal>
    ) : (
      <View style={styles.tutorialLayer} pointerEvents="box-none">
        {tutorialOverlay}
      </View>
    )}
    {showPlanJoinCallout && planCalloutPos ? (
      <View style={styles.planCalloutOverlay} pointerEvents="box-none">
        <View
          style={[styles.planCalloutFloating, { top: planCalloutPos.top, left: planCalloutPos.left }]}
          pointerEvents="box-none"
        >
          <PlanJoinCallout onDismiss={dismissPlanJoinCallout} />
        </View>
      </View>
    ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  readyPromptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  readyPromptCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  readyPromptTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#222',
    textAlign: 'center',
    marginBottom: 12,
  },
  readyPromptBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  readyPromptBodyUnderline: {
    textDecorationLine: 'underline',
  },
  readyPromptPrimaryBtn: {
    backgroundColor: '#FF8C42',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 40,
    minWidth: 200,
    alignItems: 'center',
    marginBottom: 10,
  },
  readyPromptPrimaryBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  readyPromptSecondaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  readyPromptSecondaryBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#999',
  },
  androidTutorialModalRoot: {
    flex: 1,
  },
  tutorialLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 24,
  },
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: 'white',
    overflow: 'visible',
  },
  /* ── Top Header ── */
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  createEventBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF8C42',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  createEventBtnText: {
    color: 'white',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  createEventBtnPlaceholder: {
    width: 72,
  },
  topHeaderChannel: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#aaa',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  topHeaderTitle: {
    textAlign: 'center',
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#222',
  },
  gearBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLeftBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 52,
  },
  headerLeftPlaceholder: {
    width: 52,
  },
  inboxBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF8C42',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  inboxBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  readyTodayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Platform.OS === 'android' ? 6 : 4,
    marginTop: 6,
  },
  readyTodayLabel: {
    fontSize: Platform.OS === 'android' ? 13 : 10,
    fontFamily: 'Inter_500Medium',
    color: '#222',
  },
  readyTodayLabelActive: {
    color: '#FF8C42',
  },
  headerRightBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerAlertsBtn: {
    marginLeft: -12,
  },
  headerIconBtnLabeled: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  headerIconLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: '#777',
  },
  keyboardContainer: {
    flex: 1,
    width: '100%',
  },
  forumRow: {
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
    overflow: 'visible',
    position: 'relative',
  },
  messagesColumn: {
    flex: 1,
    minWidth: 0,
  },
  messagesColumnWithPeople: {
    marginRight: FORUM_SIDEBAR_EXPANDED_WIDTH,
  },
  messagesColumnCollapsed: {
    marginRight: 36,
  },
  peopleColumnAbsolute: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'white',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#ddd',
    overflow: 'visible',
    zIndex: 20,
  },
  /* Sidebar states */
  sidebarExpanded: {
    width: FORUM_SIDEBAR_EXPANDED_WIDTH,
  },
  sidebarCollapsed: {
    width: 36,
  },
  sidebarToggle: {
    alignSelf: 'flex-start',
    padding: 6,
    marginTop: 6,
    marginLeft: 2,
  },
  sidebarCollapsedContent: {
    alignItems: 'center',
    paddingTop: 8,
    gap: 12,
  },
  sidebarCountPill: {
    alignItems: 'center',
    gap: 2,
  },
  sidebarCountText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#555',
  },
  sidebarScrollView: {
    flex: 1,
  },
  sidebarScrollContent: {
    paddingHorizontal: 6,
    paddingBottom: 12,
    paddingTop: 4,
  },
  sidebarExpandedContent: {
    flex: 1,
    flexDirection: 'column',
  },
  sidebarPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF8C42',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginHorizontal: 6,
    marginTop: 6,
    marginBottom: 6,
    gap: 3,
  },
  sidebarPlanBtnText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  sidebarHalf: {
    flex: 1,
    paddingHorizontal: 4,
    paddingTop: 4,
    overflow: 'visible',
  },
  sidebarEventHalf: {
    flex: 1.4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
    marginTop: 8,
    paddingTop: 6,
    paddingBottom: 8,
    overflow: 'visible',
  },
  plansSectionWrap: {
    flex: 1,
    position: 'relative',
    overflow: 'visible',
  },
  planCalloutOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  planCalloutFloating: {
    position: 'absolute',
    width: PLAN_JOIN_CALLOUT_BUBBLE_WIDTH,
  },
  sidebarSectionHeader: {
    marginBottom: 4,
  },
  sidebarSectionTitle: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sidebarEventRow: {
    flexDirection: 'column',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  sidebarEventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  sidebarEventMetaText: {
    flex: 1,
    minWidth: 0,
  },
  sidebarJoinBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarJoinBtnJoined: {
    backgroundColor: '#f6fbf6',
    borderColor: '#388E3C',
  },
  sidebarJoinFullLabel: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
    minWidth: 42,
    textAlign: 'center',
  },
  sidebarJoinBtnDisabled: {
    backgroundColor: '#fff',
    borderColor: '#ccc',
  },
  sidebarJoinBtnText: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    color: '#4CAF50',
  },
  sidebarJoinBtnTextJoined: {
    color: '#388E3C',
  },
  sidebarJoinBtnTextDisabled: {
    color: '#bbb',
  },
  sidebarEventTitle: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    lineHeight: 14,
  },
  sidebarEventDate: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: '#777',
  },
  sidebarEventTime: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: '#777',
    marginTop: 1,
  },
  sidebarNoEvents: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#aaa',
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  sidebarPastPlansBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    marginHorizontal: 2,
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#E4E4E4',
    backgroundColor: '#FAFAFA',
  },
  sidebarPastPlansText: {
    flex: 1,
    minWidth: 0,
  },
  sidebarPastPlansTitle: {
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#555',
  },
  sidebarPastPlansSubtitle: {
    marginTop: 1,
    fontSize: 8,
    lineHeight: 10,
    fontFamily: 'Inter_400Regular',
    color: '#999',
  },
  peopleListScroll: {
    flex: 1,
    minHeight: 0,
  },
  peopleListScrollContent: {
    paddingBottom: 8,
  },
  peopleTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
    textAlign: 'center',
  },
  peopleTable: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#f9f9f9',
  },
  peopleRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    minWidth: 0,
  },
  peopleRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  peopleRowLast: {
    borderBottomWidth: 0,
  },
  peopleRowReady: {
    backgroundColor: '#F0FBF0',
  },
  peopleSectionLabel: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: '#4CAF50',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 3,
  },
  peopleDottedDivider: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 6,
    marginHorizontal: 8,
    height: 2,
  },
  peopleDottedDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#bbb',
  },
  peopleSolidDivider: {
    height: 1,
    backgroundColor: '#e5e5e5',
    marginHorizontal: 8,
    marginVertical: 6,
  },
  peopleName: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 15,
    fontFamily: 'Inter_500Medium',
    color: '#333',
    marginRight: 4,
  },
  peopleDistance: {
    fontSize: 9,
    lineHeight: 11,
    fontFamily: 'Inter_500Medium',
    color: '#888',
    marginTop: 1,
    alignSelf: 'flex-start',
  },
  peopleMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#777',
  },
  peopleSkillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  peopleEmptyState: {
    marginTop: 4,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  peopleEmptyText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#999',
    textAlign: 'center',
  },
  messagesListWrap: {
    flex: 1,
    minWidth: 0,
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: 0,
  },
  messagesContainerEmpty: {
    flexGrow: 1,
  },
  emptyForumOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyForumState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyForumTitle: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
    marginBottom: 4,
  },
  emptyForumSubtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#999',
  },
  messageContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFCF56',
    marginBottom: 12,
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
  messageAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  messageContent: {
    flex: 1,
    flexDirection: 'row',
    gap: 12
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  userName: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginRight: 8,
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
  skillText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  timestamp: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#999',
    marginLeft: 'auto',
  },
  messageText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    alignItems: 'flex-end',
  },
  textInput: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 12,
    maxHeight: 100,
    backgroundColor: '#f9f9f9',
  },
  sendButton: {
    backgroundColor: '#FF8C42',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 17,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 19,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 21,
  },
  newDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  newDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E6E6E6',
  },
  newDividerText: {
    marginHorizontal: 10,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  replyText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginLeft: 4,
    flex: 1,
  },
  replyPreview: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 3,
    borderLeftColor: '#FF8C42',
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  replyPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  replyPreviewText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
    flex: 1,
    marginLeft: 4,
  },
  cancelReplyButton: {
    padding: 4,
  },
  replyPreviewMessage: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    fontStyle: 'italic',
  },
  attachButton: {
    marginRight: 10,
    justifyContent: 'center',
  },
  loginPrompt: {
    backgroundColor: 'white',
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF8C42',
  },
  loginPromptText: {
    fontSize: 17,
    fontFamily: 'Inter_500Medium',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  loginPromptButton: {
    backgroundColor: '#FF8C42',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  loginPromptButtonText: {
    color: 'white',
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
  },
  inputWrapper: {
    backgroundColor: 'white',
    paddingBottom: 0,
  },
  previewContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewItem: {
    marginRight: 10,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
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
  mentionSuggestions: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: 'hidden',
  },
  mentionSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
  },
  mentionSuggestionText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#333',
  },
  mentionAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EEE',
  },
  messageActionOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageActionMenu: {
    position: 'absolute',
    width: 164,
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  reactionDetailsModal: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    minWidth: '70%',
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  reactionDetailsLoading: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  reactionDetailsEmpty: {
    fontSize: 14,
    color: '#666',
    paddingVertical: 8,
  },
  reactionDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  reactionDetailsName: {
    fontSize: 15,
    color: '#111',
  },
  reactionDetailsEmojis: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  reactionDetailsEmoji: {
    fontSize: 19,
    marginLeft: 4,
  },
  messageActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  messageActionText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
  },
});
