import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Keyboard,
  Dimensions,
  useWindowDimensions,
  TouchableWithoutFeedback,
  Switch,
} from 'react-native';
import { AppKeyboardAvoidingView } from '@/components/AppKeyboardAvoidingView';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { ActivityCarousel, PLANS_LAST_SEEN_KEY } from '@/components/ActivityCarousel';
import { useActivityStore } from '@/store/useActivityStore';
import { useNotificationNavStore } from '@/store/useNotificationNavStore';
import { usePlans, type ActivityPlan, type PlanJoinRequest } from '@/hooks/usePlans';
import { startPlanGroupChat } from '@/hooks/usePlanGroupChat';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/useAuthStore';
import { requireAuth } from '@/lib/authHelpers';
import { supabase } from '@/lib/supabase';
import { ICONS } from '@/lib/helperUtils';
import { CachedImage } from '@/components/CachedImage';
import {
  buildLocalPlanDateTime,
  formatPlanDisplayDateConcise,
  formatPlanTime12hShort,
  isPlanLocalDateTimePast,
  isPlanDayPast,
  parseLocalYyyyMmDd,
} from '@/lib/planDateTime';
import { formatNominatimAddressShort } from '@/lib/nominatimAddress';
import {
  PLAN_SKILL_LEVELS,
  type PlanSkillLevel,
  getPlanSkillLevelColor,
  parsePlanSkillLevel,
} from '@/lib/planSkillLevel';

const HOURS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTES = ['00', '15', '30', '45'];
const AMPM: Array<'AM' | 'PM'> = ['AM', 'PM'];
const TIME_ITEM_HEIGHT = 44;

export default function PlansScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const activityId = useActivityStore((s) => s.activityId);
  const activity = useActivityStore((s) => s.activity);
  const emoji = useActivityStore((s) => s.emoji);
  const { user } = useAuth();
  const {
    plans,
    loading,
    creating,
    updatingPlanId,
    deletingPlanId,
    joiningPlanId,
    createPlan,
    updatePlan,
    deletePlan,
    toggleJoin,
    fetchPendingJoinRequests,
    respondToJoinRequest,
    respondingRequestId,
    refetch,
  } = usePlans(activityId);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ActivityPlan | null>(null);
  /** plan_id → group_chat_id (only contains plans whose chat the user can access via RLS). */
  const [planChatMap, setPlanChatMap] = useState<Record<string, string>>({});
  const [startingChatForPlanId, setStartingChatForPlanId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [planSkillLevel, setPlanSkillLevel] = useState<PlanSkillLevel>('Beginner');
  const [eventLocation, setEventLocation] = useState('');
  const [locationMode, setLocationMode] = useState<'manual' | 'gps'>('manual');
  const [isLocating, setIsLocating] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState('6');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('PM');
  const [eventNote, setEventNote] = useState('');
  const [limitRsvps, setLimitRsvps] = useState(false);
  const [maxRsvps, setMaxRsvps] = useState('6');
  const [approvalRequired, setApprovalRequired] = useState(false);
  /** Local URI from picker (create or replace on edit). */
  const [planPhotoUri, setPlanPhotoUri] = useState<string | null>(null);
  /** Edit: user removed the saved server image without picking a new one. */
  const [clearExistingPlanImage, setClearExistingPlanImage] = useState(false);
  const [announceInForum, setAnnounceInForum] = useState(true);
  const [forumMessageDraft, setForumMessageDraft] = useState('');
  const [showAttendeesModal, setShowAttendeesModal] = useState(false);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [attendees, setAttendees] = useState<Array<{ id: string; name: string; avatar_url: string | null }>>([]);
  const [attendeeModalTitle, setAttendeeModalTitle] = useState('Attendees');
  const [attendeesPlanId, setAttendeesPlanId] = useState<string | null>(null);
  const [attendeesPlanCreatorId, setAttendeesPlanCreatorId] = useState<string | null>(null);
  const [removingAttendeeId, setRemovingAttendeeId] = useState<string | null>(null);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [requestModalTitle, setRequestModalTitle] = useState('Join requests');
  const [joinRequestsLoading, setJoinRequestsLoading] = useState(false);
  const [joinRequests, setJoinRequests] = useState<PlanJoinRequest[]>([]);
  const [locationSuggestions, setLocationSuggestions] = useState<{ short: string; full: string }[]>([]);
  const [locationSuggestionsLoading, setLocationSuggestionsLoading] = useState(false);
  /** Extra scroll padding + sheet sizing when create-plan modal keyboard is open */
  const [createModalKeyboardHeight, setCreateModalKeyboardHeight] = useState(0);
  const locationSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNominatimRequestRef = useRef<number>(0);
  /** Invalidate in-flight attendee loads (activity switch or opening another plan's list). */
  const attendeesSeqRef = useRef(0);
  /** Invalidate in-flight GPS / reverse-geocode when activity changes. */
  const geocodeSeqRef = useRef(0);
  const prevActivityIdForScreenRef = useRef<string | undefined | null>(null);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const fetchPendingJoinRequestsRef = useRef(fetchPendingJoinRequests);
  fetchPendingJoinRequestsRef.current = fetchPendingJoinRequests;
  const notificationNavNonce = useNotificationNavStore((s) => s.nonce);
  const notificationNavTarget = useNotificationNavStore((s) => s.target);
  const lastNotificationNavNonceRef = useRef(0);

  const visiblePlans = useMemo(
    () => plans.filter((plan) => !isPlanDayPast(plan.event_date)),
    [plans]
  );

  // Load group chat ids for visible plans (RLS only returns ones the user can access).
  useEffect(() => {
    const ids = visiblePlans.map((p) => p.id);
    if (ids.length === 0) {
      setPlanChatMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('plan_group_chats')
        .select('id, plan_id')
        .in('plan_id', ids);
      if (cancelled || error) return;
      const map: Record<string, string> = {};
      (data ?? []).forEach((row: any) => {
        map[row.plan_id] = row.id;
      });
      setPlanChatMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [visiblePlans]);

  const handleOpenOrStartGroupChat = async (plan: ActivityPlan) => {
    if (!user?.id) return;
    const existing = planChatMap[plan.id];
    if (existing) {
      router.push({
        pathname: '/(tabs)/chats/group/[id]',
        params: { id: existing, planTitle: plan.title },
      });
      return;
    }
    const userInPlan = plan.current_user_joined || plan.creator_id === user.id;
    if (!userInPlan) {
      Alert.alert('Join the plan', 'You need to join this plan before opening group chat.');
      return;
    }
    // Need at least two people on the plan (join_count includes the host).
    if ((plan.join_count ?? 0) <= 1) {
      Alert.alert(
        'Waiting for others to join',
        'Once someone else joins this plan, a member can start a group chat here.'
      );
      return;
    }
    setStartingChatForPlanId(plan.id);
    const res = await startPlanGroupChat(plan.id, user.id);
    setStartingChatForPlanId(null);
    if (res.error || !res.id) {
      Alert.alert('Could not start group chat', res.error ?? 'Please try again.');
      return;
    }
    setPlanChatMap((m) => ({ ...m, [plan.id]: res.id! }));
    router.push({
      pathname: '/(tabs)/chats/group/[id]',
      params: { id: res.id, planTitle: plan.title },
    });
  };

  useEffect(() => {
    if (!showCreateModal) {
      setCreateModalKeyboardHeight(0);
      return;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvent, (e) => {
      setCreateModalKeyboardHeight(e.endCoordinates.height);
    });
    const subHide = Keyboard.addListener(hideEvent, () => setCreateModalKeyboardHeight(0));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [showCreateModal]);

  // Stable callback (empty deps) so focus effect does not cleanup/re-run in a loop
  // when parent re-renders. Cleanup must only run on real blur.
  useFocusEffect(
    useCallback(() => {
      refetchRef.current(true);
      // When user leaves Plans tab, mark "last seen" so next time badges = plans created after this
      return () => {
        const uid = useAuthStore.getState().user?.id;
        if (uid) {
          void AsyncStorage.setItem(PLANS_LAST_SEEN_KEY(uid), new Date().toISOString());
          useActivityStore.getState().touchPlansLastSeen();
        }
      };
    }, [])
  );

  // Push / inbox taps: force-refresh plans (and open join requests when relevant)
  useEffect(() => {
    if (notificationNavTarget !== 'plans') return;
    if (notificationNavNonce === lastNotificationNavNonceRef.current) return;
    lastNotificationNavNonceRef.current = notificationNavNonce;

    const { planId, openJoinRequests } = useNotificationNavStore.getState();
    // Clear target so a remount cannot re-process the same nav event.
    useNotificationNavStore.setState({ target: null });

    void (async () => {
      await refetchRef.current(true);
      if (!openJoinRequests || !planId) return;
      setRequestModalTitle('Join requests');
      setShowRequestsModal(true);
      setJoinRequestsLoading(true);
      setJoinRequests([]);
      const rows = await fetchPendingJoinRequestsRef.current(planId);
      setJoinRequests(rows);
      setJoinRequestsLoading(false);
      setRequestModalTitle(
        `${rows.length} ${rows.length === 1 ? 'Request' : 'Requests'}`
      );
    })();
  }, [notificationNavNonce, notificationNavTarget]);

  /** YYYY-MM-DD in local timezone (avoids UTC off-by-one when converting from Date) */
  const toLocalDateString = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayKey = () => toLocalDateString(new Date());
  const to24Hour = (hour12: number, ampm: 'AM' | 'PM') => {
    if (ampm === 'AM') return hour12 === 12 ? 0 : hour12;
    return hour12 === 12 ? 12 : hour12 + 12;
  };

  const getSelectedDateLabel = () => {
    if (!selectedDate) return 'Select a date';
    const date = selectedDateObj || parseLocalYyyyMmDd(selectedDate);
    if (!date) return 'Select a date';
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const getSelectedTimeLabel = () => {
    if (!selectedTime) return 'Select a time';
    const [h, m] = selectedTime.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const buildForumDraft = useCallback(() => {
    const title = eventTitle.trim() || 'a meetup';
    let msg = `Hey everyone! I just posted a ${title} plan`;
    if (eventLocation.trim()) msg += ` at ${eventLocation.trim()}`;
    if (selectedDate && selectedTime) msg += ` on ${getSelectedDateLabel()} at ${getSelectedTimeLabel()}`;
    msg += `.`;
    if (eventNote.trim()) msg += ` ${eventNote.trim()}`;
    msg += ` Feel free to join in 👉`;
    return msg;
  }, [eventTitle, eventLocation, selectedDate, selectedTime, eventNote]);

  useEffect(() => {
    if (announceInForum && !editingPlan) {
      setForumMessageDraft(buildForumDraft());
    }
  }, [eventTitle, eventLocation, selectedDate, selectedTime, eventNote, announceInForum, editingPlan, buildForumDraft]);

  const handleDateChange = (_e: any, date?: Date) => {
    if (date) {
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
      const nextDate = toLocalDateString(d);
      setSelectedDateObj(d);
      setSelectedDate(nextDate);
      if (selectedTime && isPlanLocalDateTimePast(nextDate, selectedTime)) {
        setSelectedTime('');
      }
      setShowDatePicker(false);
    }
  };

  const openTimePicker = () => {
    Keyboard.dismiss();
    if (selectedTime) {
      const [h, m] = selectedTime.split(':').map(Number);
      setSelectedHour((h % 12 === 0 ? 12 : h % 12).toString());
      setSelectedMinute(m.toString().padStart(2, '0'));
      setSelectedAmPm(h >= 12 ? 'PM' : 'AM');
    }
    setShowTimePicker(true);
  };

  const confirmTimeSelection = () => {
    if (!selectedDate) {
      Alert.alert('Select a date', 'Please choose a date first.');
      return;
    }
    const hour24 = to24Hour(parseInt(selectedHour, 10), selectedAmPm);
    const minute = parseInt(selectedMinute, 10);
    const selectedDateTime = buildLocalPlanDateTime(selectedDate, hour24, minute);
    if (!selectedDateTime) {
      Alert.alert('Invalid date', 'Please select a valid date.');
      return;
    }
    if (selectedDateTime.getTime() <= Date.now()) {
      Alert.alert('Choose a Future Time', 'Please select a time in the future.');
      return;
    }
    const timeValue = `${hour24.toString().padStart(2, '0')}:${selectedMinute}`;
    setSelectedTime(timeValue);
    setShowTimePicker(false);
  };

  const handleUseCurrentLocation = async () => {
    const runId = ++geocodeSeqRef.current;
    setIsLocating(true);
    setLocationSuggestions([]);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (runId !== geocodeSeqRef.current) return;
      if (status !== 'granted') {
        const { status: req } = await Location.requestForegroundPermissionsAsync();
        if (req !== 'granted') {
          Alert.alert('Location access', 'Allow location to use your current spot.');
          return;
        }
      }
      if (runId !== geocodeSeqRef.current) return;
      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10000,
      });
      if (!location) location = await Location.getLastKnownPositionAsync({});
      if (runId !== geocodeSeqRef.current) return;
      if (location) {
        const lat = location.coords.latitude;
        const lon = location.coords.longitude;
        const now = Date.now();
        const minDelay = 1100;
        const elapsed = now - lastNominatimRequestRef.current;
        if (elapsed < minDelay) await new Promise((r) => setTimeout(r, minDelay - elapsed));
        if (runId !== geocodeSeqRef.current) return;
        lastNominatimRequestRef.current = Date.now();
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
          { headers: { 'User-Agent': 'TheActivityHub/1.0 (https://github.com/activeportland)' } }
        );
        const data = await res.json();
        if (runId !== geocodeSeqRef.current) return;
        const short = formatNominatimAddressShort(data);
        if (short) {
          setEventLocation(short);
        } else if (data?.display_name) {
          setEventLocation(data.display_name);
        } else {
          setEventLocation(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
        }
      }
    } catch (error) {
      if (runId === geocodeSeqRef.current) {
        Alert.alert('Error', 'Could not get your location.');
      }
    } finally {
      if (runId === geocodeSeqRef.current) {
        setIsLocating(false);
      }
    }
  };

  useEffect(() => {
    if (locationMode !== 'gps') {
      setLocationSuggestions([]);
      setLocationSuggestionsLoading(false);
      return;
    }
    const query = eventLocation.trim();
    if (query.length < 3) {
      setLocationSuggestions([]);
      return;
    }
    if (locationSearchDebounceRef.current) clearTimeout(locationSearchDebounceRef.current);
    locationSearchDebounceRef.current = setTimeout(async () => {
      const now = Date.now();
      const minDelay = 1100;
      const elapsed = now - lastNominatimRequestRef.current;
      if (elapsed < minDelay) await new Promise((r) => setTimeout(r, minDelay - elapsed));
      lastNominatimRequestRef.current = Date.now();
      setLocationSuggestionsLoading(true);
      try {
        const q = encodeURIComponent(query);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&limit=5`,
          { headers: { 'User-Agent': 'TheActivityHub/1.0 (https://github.com/activeportland)' } }
        );
        const data = await res.json();
        setLocationSuggestions(
          Array.isArray(data)
            ? data.map((r: { display_name?: string; address?: Record<string, string> }) => {
                const full = r.display_name ?? '';
                const short = formatNominatimAddressShort(r) || full;
                return { short, full };
              })
            : []
        );
      } catch {
        setLocationSuggestions([]);
      } finally {
        setLocationSuggestionsLoading(false);
      }
    }, 500);
    return () => {
      if (locationSearchDebounceRef.current) clearTimeout(locationSearchDebounceRef.current);
    };
  }, [eventLocation, locationMode]);

  const selectLocationSuggestion = (short: string, full: string) => {
    setEventLocation(short.trim() || full.trim());
    setLocationSuggestions([]);
  };

  const resetCreateForm = useCallback(() => {
    setEditingPlan(null);
    setEventTitle('');
    setPlanSkillLevel('Beginner');
    setEventLocation('');
    setEventNote('');
    setLimitRsvps(false);
    setMaxRsvps('6');
    setApprovalRequired(false);
    setPlanPhotoUri(null);
    setClearExistingPlanImage(false);
    setAnnounceInForum(true);
    setForumMessageDraft('');
    setSelectedDate('');
    setSelectedDateObj(null);
    setSelectedTime('');
    setShowDatePicker(false);
    setShowTimePicker(false);
    setShowCreateModal(false);
    setLocationMode('manual');
    setLocationSuggestions([]);
    setLocationSuggestionsLoading(false);
  }, []);

  /** Never keep another activity's modals, drafts, or stale attendee fetch results. */
  useEffect(() => {
    const prev = prevActivityIdForScreenRef.current;
    const next = activityId && activityId.trim() !== '' ? activityId : null;
    const switched =
      (prev !== null && next !== null && prev !== next) || (prev !== null && next === null);
    prevActivityIdForScreenRef.current = next;
    if (!switched) return;

    attendeesSeqRef.current += 1;
    geocodeSeqRef.current += 1;
    setShowAttendeesModal(false);
    setAttendees([]);
    setAttendeesLoading(false);
    setLocationSuggestions([]);
    setLocationSuggestionsLoading(false);

    if (showCreateModal && (!editingPlan || !next || editingPlan.activity_id !== next)) {
      resetCreateForm();
    }
  }, [activityId, showCreateModal, editingPlan, resetCreateForm]);

  const pickPlanPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photos', 'Allow photo library access to add a plan image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPlanPhotoUri(result.assets[0].uri);
      setClearExistingPlanImage(false);
    }
  };

  const removePlanPhoto = () => {
    setPlanPhotoUri(null);
    if (editingPlan?.image_url) {
      setClearExistingPlanImage(true);
    }
  };

  const handleOpenEdit = (plan: ActivityPlan) => {
    setEditingPlan(plan);
    setPlanPhotoUri(null);
    setClearExistingPlanImage(false);
    setEventTitle(plan.title?.trim() ? plan.title : '');
    setPlanSkillLevel(parsePlanSkillLevel(plan.skill_level) ?? 'Beginner');
    setEventLocation(plan.location);
    setEventNote(plan.note ?? '');
    setLimitRsvps(typeof plan.max_rsvps === 'number' && plan.max_rsvps > 0);
    setMaxRsvps(String(plan.max_rsvps ?? 6));
    setApprovalRequired(!!plan.join_approval_required);
    setSelectedDate(plan.event_date);
    setSelectedDateObj(parseLocalYyyyMmDd(plan.event_date));
    setSelectedTime(plan.event_time);
    setLocationMode('manual');
    const [h, m] = plan.event_time.split(':').map(Number);
    setSelectedHour((h % 12 === 0 ? 12 : h % 12).toString());
    setSelectedMinute(m.toString().padStart(2, '0'));
    setSelectedAmPm(h >= 12 ? 'PM' : 'AM');
    setShowCreateModal(true);
  };

  const handleCreatePlan = async () => {
    if (!user) {
      requireAuth('create a plan');
      return;
    }
    if (!eventTitle.trim()) {
      Alert.alert('Title required', 'Please give your plan a short title.');
      return;
    }
    if (eventTitle.trim().length > 120) {
      Alert.alert('Title too long', 'Title must be 120 characters or less.');
      return;
    }
    if (!eventLocation.trim()) {
      Alert.alert('Location required', 'Please enter or select a location.');
      return;
    }
    if (!selectedDate || !selectedTime) {
      Alert.alert('Date & time required', 'Please select a date and time.');
      return;
    }
    const [h, m] = selectedTime.split(':').map(Number);
    const selectedDateTime = buildLocalPlanDateTime(selectedDate, h, m);
    if (!selectedDateTime) {
      Alert.alert('Invalid date', 'Please select a valid date and time.');
      return;
    }
    if (isPlanLocalDateTimePast(selectedDate, selectedTime)) {
      Alert.alert('Plan must be in the future', 'Please select a date and time after now.');
      return;
    }
    const noteVal = eventNote.trim() || null;
    if (noteVal && noteVal.length > 160) {
      Alert.alert('Note too long', 'Note must be 160 characters or less.');
      return;
    }
    Keyboard.dismiss();
    const maxSeats = limitRsvps ? Math.max(1, Math.min(10, Number(maxRsvps) || 1)) : null;
    if (editingPlan && maxSeats !== null && editingPlan.join_count > maxSeats) {
      Alert.alert(
        'Too few slots',
        `This plan already has ${editingPlan.join_count} joined. Increase slots or remove attendees first.`
      );
      return;
    }
    if (editingPlan) {
      const result = await updatePlan(editingPlan.id, {
        title: eventTitle.trim(),
        location: eventLocation.trim(),
        event_date: selectedDate,
        event_time: selectedTime,
        skill_level: planSkillLevel,
        note: noteVal || undefined,
        max_rsvps: maxSeats,
        join_approval_required: approvalRequired,
        ...(planPhotoUri?.trim()
          ? { imageUri: planPhotoUri.trim() }
          : clearExistingPlanImage
            ? { clearImage: true }
            : {}),
      });
      if (result.ok) {
        resetCreateForm();
      } else {
        Alert.alert('Could not update plan', result.error ?? 'Please try again.');
      }
    } else {
      const result = await createPlan({
        title: eventTitle.trim(),
        location: eventLocation.trim(),
        event_date: selectedDate,
        event_time: selectedTime,
        skill_level: planSkillLevel,
        note: noteVal || undefined,
        imageUri: planPhotoUri?.trim() || undefined,
        max_rsvps: maxSeats,
        join_approval_required: approvalRequired,
      });
      if (result.ok) {
        if (announceInForum && activityId && user?.id && forumMessageDraft.trim()) {
          const { error: forumError } = await supabase.from('forum_messages').insert({
            activity_id: activityId,
            user_id: user.id,
            message: forumMessageDraft.trim(),
          });
          if (forumError) {
            console.error('Forum post failed:', forumError);
          }
        }
        resetCreateForm();
      } else {
        Alert.alert('Could not create plan', result.error ?? 'Please try again.');
      }
    }
  };

  const handleDeletePlan = () => {
    if (!editingPlan) return;
    Alert.alert(
      'Cancel plan',
      'Are you sure you want to cancel this plan? Everyone who joined will no longer see it.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel plan',
          style: 'destructive',
          onPress: async () => {
            const result = await deletePlan(editingPlan.id);
            if (result.ok) {
              resetCreateForm();
            } else {
              Alert.alert('Could not cancel plan', result.error ?? 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleOpenCreate = () => {
    if (!user) {
      requireAuth('create a plan');
      return;
    }
    if (!activityId) {
      Alert.alert('Select an activity', 'Choose an activity from the carousel first to create a plan.');
      return;
    }
    // Default to tomorrow at 6:00 PM so the form never starts with a past or ambiguous date/time
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    setSelectedDate(toLocalDateString(tomorrow));
    setSelectedDateObj(tomorrow);
    setSelectedTime('18:00');
    setSelectedHour('6');
    setSelectedMinute('00');
    setSelectedAmPm('PM');
    setEditingPlan(null);
    setEventTitle('');
    setPlanSkillLevel('Beginner');
    setEventLocation('');
    setEventNote('');
    setLimitRsvps(false);
    setMaxRsvps('6');
    setApprovalRequired(false);
    setPlanPhotoUri(null);
    setClearExistingPlanImage(false);
    setAnnounceInForum(true);
    setForumMessageDraft('');
    setShowCreateModal(true);
  };

  const handleJoin = async (plan: ActivityPlan) => {
    if (!user) {
      requireAuth('join a plan');
      return;
    }
    const result = await toggleJoin(plan.id);
    if (!result.ok) {
      Alert.alert('Could not update RSVP', result.error ?? 'Please try again.');
    }
  };

  const openJoinRequests = async (plan: ActivityPlan) => {
    if (!user || plan.creator_id !== user.id) return;
    setRequestModalTitle(
      `${plan.pending_request_count ?? 0} ${plan.pending_request_count === 1 ? 'Request' : 'Requests'}`
    );
    setShowRequestsModal(true);
    setJoinRequestsLoading(true);
    setJoinRequests([]);
    const rows = await fetchPendingJoinRequests(plan.id);
    setJoinRequests(rows);
    setJoinRequestsLoading(false);
  };

  const handleRequestResponse = async (requestId: string, approve: boolean) => {
    const result = await respondToJoinRequest(requestId, approve);
    if (!result.ok) {
      Alert.alert('Could not update request', result.error ?? 'Please try again.');
      return;
    }
    setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
  };

  const openAttendees = async (plan: ActivityPlan) => {
    const seq = ++attendeesSeqRef.current;
    const planId = plan.id;
    setAttendeeModalTitle(`${plan.join_count} ${plan.join_count === 1 ? 'Attendee' : 'Attendees'}`);
    setAttendeesPlanId(plan.id);
    setAttendeesPlanCreatorId(plan.creator_id);
    setShowAttendeesModal(true);
    setAttendeesLoading(true);
    setAttendees([]);
    try {
      const { data: joins, error: joinsError } = await supabase
        .from('plan_joins')
        .select('user_id')
        .eq('plan_id', planId);

      if (seq !== attendeesSeqRef.current) return;

      if (joinsError) {
        console.error('Error loading attendees:', joinsError);
        return;
      }

      const userIds = Array.from(new Set((joins || []).map((j: any) => j.user_id).filter(Boolean)));
      if (userIds.length === 0) return;

      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', userIds);

      if (seq !== attendeesSeqRef.current) return;

      if (profilesError) {
        console.error('Error loading attendee profiles:', profilesError);
        return;
      }

      const byId = new Map((profileRows || []).map((p: any) => [p.id, p]));
      const ordered = userIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((p: any) => ({ id: p.id, name: p.name || 'Member', avatar_url: p.avatar_url || null }));
      if (seq !== attendeesSeqRef.current) return;
      setAttendees(ordered);
    } finally {
      if (seq === attendeesSeqRef.current) {
        setAttendeesLoading(false);
      }
    }
  };

  const handleRemoveAttendee = (person: { id: string; name: string }) => {
    if (!attendeesPlanId) return;
    Alert.alert(
      'Remove attendee',
      `Remove ${person.name} from this plan?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingAttendeeId(person.id);
            const { error } = await supabase
              .from('plan_joins')
              .delete()
              .eq('plan_id', attendeesPlanId)
              .eq('user_id', person.id);
            setRemovingAttendeeId(null);
            if (error) {
              Alert.alert('Could not remove', 'Please try again.');
              return;
            }
            setAttendees((prev) => prev.filter((a) => a.id !== person.id));
            setAttendeeModalTitle((prev) => {
              const current = parseInt(prev) || 1;
              const next = Math.max(0, current - 1);
              return `${next} ${next === 1 ? 'Attendee' : 'Attendees'}`;
            });
          },
        },
      ]
    );
  };

  const renderPlanCard = ({ item }: { item: ActivityPlan }) => {
    const planSkill = parsePlanSkillLevel(item.skill_level);
    const seatsTaken = item.join_count ?? 0;
    const seatsMax = item.max_rsvps ?? null;
    const seatsFull = seatsMax !== null && seatsTaken >= seatsMax;
    const requestPending = item.current_user_request_status === 'pending';
    const requiresApprovalForUser = !!item.join_approval_required && item.creator_id !== user?.id;
    const joinButtonDisabled =
      joiningPlanId === item.id ||
      item.current_user_joined ||
      requestPending ||
      seatsFull;
    const joinButtonText = item.current_user_joined
      ? 'Joined'
      : requestPending
        ? 'Request sent'
        : seatsFull
          ? 'Full'
          : requiresApprovalForUser
            ? 'Request to join'
            : 'Join';
    const showJoinAsFull = seatsFull && !item.current_user_joined && !requestPending;
    return (
    <View style={styles.planCard}>
      {planSkill ? (
        <View style={styles.planSkillTopRight} pointerEvents="none">
          <View style={[styles.planSkillBubble, { backgroundColor: getPlanSkillLevelColor(planSkill) }]}>
            <Text style={styles.planSkillBubbleText}>{planSkill}</Text>
          </View>
        </View>
      ) : null}
      {item.image_url ? (
        <CachedImage source={{ uri: item.image_url }} style={styles.planCardImage} recyclingKey={item.id} displayPreset="plan" />
      ) : null}
      <View style={styles.planCardHeader}>
        <View style={styles.planTitleRow}>
          <Text style={[styles.planTitleHeader, planSkill ? styles.planTitleWithSkillCorner : null]} numberOfLines={2}>
            {item.title?.trim() ? item.title : 'Meetup'}
          </Text>
        </View>
        <Text style={styles.planLocationSub} numberOfLines={2}>
          {item.location}
        </Text>
        <Text style={styles.planDateTime}>
          📅 {formatPlanDisplayDateConcise(item.event_date)} at {formatPlanTime12hShort(item.event_time)}
        </Text>
        {seatsMax ? (
          <View style={styles.seatRow}>
            {Array.from({ length: seatsMax }).map((_, idx) => (
              <View
                key={`${item.id}-seat-${idx}`}
                style={[styles.seatDot, idx < seatsTaken ? styles.seatDotFilled : null]}
              />
            ))}
            <Text style={styles.seatText}>{seatsTaken}/{seatsMax} spots</Text>
          </View>
        ) : null}
        {item.join_approval_required ? (
          <Text style={styles.approvalTag}>Host approval required</Text>
        ) : null}
        {item.note ? <Text style={styles.planNote}>{item.note}</Text> : null}
        <View style={styles.planCreatorRow}>
          <Text style={styles.planCreatorLabel}>Created by: </Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (item.creator_id) {
                router.push({
                  pathname: '/(tabs)/people/[id]',
                  params: { id: item.creator_id, name: item.creator_name ?? 'Someone', from: 'plans' },
                });
              }
            }}
          >
            <Text style={styles.planCreatorLink}>{item.creator_name}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.planCardFooter}>
        {item.creator_id === user?.id ? (
          <TouchableOpacity
            style={styles.editPlanButton}
            onPress={() => handleOpenEdit(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil" size={18} color="#FF8C42" />
            <Text style={styles.editPlanButtonText}>Edit</Text>
          </TouchableOpacity>
        ) : showJoinAsFull ? (
          <Text style={styles.planFullLabel}>Full</Text>
        ) : (
          <TouchableOpacity
            style={[
              styles.joinButton,
              item.current_user_joined && styles.joinButtonJoined,
              joinButtonDisabled && styles.joinButtonDisabled,
            ]}
            onPress={() => handleJoin(item)}
            disabled={joinButtonDisabled}
          >
            {joiningPlanId === item.id ? (
              <ActivityIndicator size="small" color="#4CAF50" />
            ) : (
              <>
                <Ionicons
                  name={item.current_user_joined ? 'checkmark-circle' : requestPending ? 'time-outline' : 'person-add'}
                  size={18}
                  color={
                    joinButtonDisabled
                      ? '#bbb'
                      : item.current_user_joined
                        ? '#388E3C'
                        : '#4CAF50'
                  }
                />
                <Text
                  style={[
                    styles.joinButtonText,
                    joinButtonDisabled && styles.joinButtonTextDisabled,
                    item.current_user_joined && styles.joinButtonTextJoined,
                  ]}
                >
                  {joinButtonText}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.joinCountButton}
          onPress={() => openAttendees(item)}
          activeOpacity={0.78}
        >
          <Ionicons name="people-outline" size={17} color="#666" />
          <Text style={styles.joinCount}>
            {item.join_count} {item.join_count === 1 ? 'person' : 'people'} joined
          </Text>
        </TouchableOpacity>
        {item.creator_id === user?.id && (item.pending_request_count ?? 0) > 0 ? (
          <TouchableOpacity
            style={styles.requestsButton}
            onPress={() => void openJoinRequests(item)}
            activeOpacity={0.78}
          >
            <Ionicons name="mail-unread-outline" size={16} color="#7a5a00" />
            <Text style={styles.requestsButtonText}>{item.pending_request_count} requests</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {(() => {
        const hasChat = !!planChatMap[item.id];
        const userInPlan = item.current_user_joined || item.creator_id === user?.id;
        if (!userInPlan) return null;
        if (hasChat) {
          return (
            <TouchableOpacity
              style={styles.groupChatButtonFull}
              onPress={() => handleOpenOrStartGroupChat(item)}
              activeOpacity={0.8}
            >
              <Ionicons name="people" size={16} color="#FF8C42" />
              <Text style={styles.groupChatButtonText}>Open group chat</Text>
            </TouchableOpacity>
          );
        }
        return (
          <TouchableOpacity
            style={styles.groupChatButtonFull}
            onPress={() => handleOpenOrStartGroupChat(item)}
            activeOpacity={0.8}
            disabled={startingChatForPlanId === item.id}
          >
            {startingChatForPlanId === item.id ? (
              <ActivityIndicator size="small" color="#FF8C42" />
            ) : (
              <>
                <Ionicons name="chatbubbles-outline" size={16} color="#FF8C42" />
                <Text style={styles.groupChatButtonText}>Start group chat</Text>
              </>
            )}
          </TouchableOpacity>
        );
      })()}
    </View>
    );
  };

  const createModalSheetMaxHeight =
    createModalKeyboardHeight > 0
      ? Math.min(
          windowHeight * 0.88,
          windowHeight - createModalKeyboardHeight - Math.max(insets.bottom, 12) - 8
        )
      : Math.min(windowHeight * 0.92, windowHeight - Math.max(insets.top, 20));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerGradient} />
        <TouchableOpacity style={styles.backToForumBtn} onPress={() => router.navigate('/(tabs)/forum')}>
          <Ionicons name="chevron-back" size={18} color="#FF8C42" />
          <Text style={styles.backToForumText}>Forum</Text>
        </TouchableOpacity>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.title}>Plans</Text>
            {activity && (
              <Text style={styles.subtitle}>
                {emoji} {activity}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.createPlanButton}
            onPress={handleOpenCreate}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.createPlanButtonText}>Create plan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!activityId ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color="#ccc" />
          <Text style={styles.emptyTitle}>Select an activity</Text>
          <Text style={styles.emptySubtitle}>
            Choose an activity from the carousel above to see and create plans
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF8C42" />
          <Text style={styles.loadingText}>Loading plans…</Text>
        </View>
      ) : (
        <>
          <FlatList
            key={activityId ?? 'no-activity'}
            data={visiblePlans}
            renderItem={renderPlanCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(insets.bottom, 20) + 24 },
            ]}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Text style={styles.emptyListText}>No plans yet for this activity</Text>
                <Text style={styles.emptyListSubtext}>Tap Create plan above to add one</Text>
              </View>
            }
          />
        </>
      )}

      <Modal
        visible={showAttendeesModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAttendeesModal(false)}
      >
        <View style={styles.attendeesOverlay}>
          <View style={styles.attendeesCard}>
            <View style={styles.attendeesHeader}>
              <Text style={styles.attendeesTitle}>{attendeeModalTitle}</Text>
              <TouchableOpacity onPress={() => setShowAttendeesModal(false)}>
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            {attendeesLoading ? (
              <ActivityIndicator size="small" color="#FF8C42" style={{ marginVertical: 18 }} />
            ) : attendees.length === 0 ? (
              <Text style={styles.attendeesEmpty}>No attendees yet.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                {attendees.map((person) => {
                  const isHost = person.id === attendeesPlanCreatorId;
                  const canRemove = user?.id === attendeesPlanCreatorId && !isHost;
                  return (
                    <View key={person.id} style={styles.attendeeRow}>
                      <CachedImage
                        source={person.avatar_url ? { uri: person.avatar_url } : ICONS.profileIcon}
                        style={styles.attendeeAvatar}
                        recyclingKey={person.id}
                      />
                      <Text style={[styles.attendeeName, { flex: 1 }]} numberOfLines={1}>
                        {person.name}{isHost ? ' (host)' : ''}
                      </Text>
                      {canRemove && (
                        removingAttendeeId === person.id
                          ? <ActivityIndicator size="small" color="#FF3B30" />
                          : <TouchableOpacity
                              onPress={() => handleRemoveAttendee(person)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={styles.attendeeRemoveText}>Remove</Text>
                            </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showRequestsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRequestsModal(false)}
      >
        <View style={styles.attendeesOverlay}>
          <View style={styles.attendeesCard}>
            <View style={styles.attendeesHeader}>
              <Text style={styles.attendeesTitle}>{requestModalTitle}</Text>
              <TouchableOpacity onPress={() => setShowRequestsModal(false)}>
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            {joinRequestsLoading ? (
              <ActivityIndicator size="small" color="#FF8C42" style={{ marginVertical: 18 }} />
            ) : joinRequests.length === 0 ? (
              <Text style={styles.attendeesEmpty}>No pending requests.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                {joinRequests.map((req) => (
                  <View key={req.id} style={styles.requestRow}>
                    <View style={styles.requestIdentity}>
                      <CachedImage
                        source={req.requester_avatar_url ? { uri: req.requester_avatar_url } : ICONS.profileIcon}
                        style={styles.attendeeAvatar}
                      />
                      <Text style={styles.attendeeName}>{req.requester_name ?? 'Member'}</Text>
                    </View>
                    <View style={styles.requestActions}>
                      <TouchableOpacity
                        style={styles.requestDeclineBtn}
                        disabled={respondingRequestId === req.id}
                        onPress={() => void handleRequestResponse(req.id, false)}
                      >
                        <Text style={styles.requestDeclineText}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.requestApproveBtn}
                        disabled={respondingRequestId === req.id}
                        onPress={() => void handleRequestResponse(req.id, true)}
                      >
                        {respondingRequestId === req.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.requestApproveText}>Approve</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Create Plan Modal — keyboard: scroll all fields + actions; sheet shrinks when keyboard open */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <AppKeyboardAvoidingView
          style={styles.modalKeyboardContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 12) : 0}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={styles.modalOverlayDimTap} />
            </TouchableWithoutFeedback>
            <View style={[styles.modalContent, { maxHeight: createModalSheetMaxHeight }]}>
            <ScrollView
              style={[styles.modalScrollView, { maxHeight: createModalSheetMaxHeight }]}
              contentContainerStyle={[
                styles.modalScrollContent,
                {
                  paddingBottom:
                    28 +
                    Math.max(insets.bottom, 12) +
                    (createModalKeyboardHeight > 0 ? Math.min(createModalKeyboardHeight, 120) : 0),
                  flexGrow: 1,
                },
              ]}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
            <Text style={styles.modalTitle}>{editingPlan ? 'Edit plan' : 'Create a plan'}</Text>
            <View style={styles.modalTitleSpacer} />
            <LinearGradient
              colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.scheduleDivider}
            />
              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Title</Text>
                <TextInput
                  style={styles.modalTextInput}
                  value={eventTitle}
                  onChangeText={(t) => setEventTitle(t.slice(0, 120))}
                  placeholder="e.g. Morning loop, Park meetup"
                  placeholderTextColor="#999"
                  maxLength={120}
                />
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Skill level</Text>
                <View style={styles.skillLevelPillRow}>
                  {PLAN_SKILL_LEVELS.map((lvl) => (
                    <TouchableOpacity
                      key={lvl}
                      style={[
                        styles.locationModePill,
                        planSkillLevel === lvl && styles.locationModePillActive,
                        styles.skillLevelPill,
                      ]}
                      onPress={() => setPlanSkillLevel(lvl)}
                    >
                      <Text
                        style={[
                          styles.locationModeText,
                          planSkillLevel === lvl && styles.locationModeTextActive,
                          styles.skillLevelPillText,
                        ]}
                      >
                        {lvl}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Location</Text>
                <View style={styles.locationModeRow}>
                  <TouchableOpacity
                    style={[styles.locationModePill, locationMode === 'manual' && styles.locationModePillActive]}
                    onPress={() => setLocationMode('manual')}
                  >
                    <Text style={[styles.locationModeText, locationMode === 'manual' && styles.locationModeTextActive]}>
                      Enter manually
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.locationModePill, locationMode === 'gps' && styles.locationModePillActive]}
                    onPress={() => setLocationMode('gps')}
                  >
                    <Text style={[styles.locationModeText, locationMode === 'gps' && styles.locationModeTextActive]}>
                      Use GPS
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.locationRow}>
                  <TextInput
                    style={[styles.modalTextInput, styles.locationInput]}
                    value={eventLocation}
                    onChangeText={setEventLocation}
                    placeholder={locationMode === 'manual' ? 'Enter a place or address' : 'Search or tap button for current location'}
                    placeholderTextColor="#999"
                    editable={true}
                  />
                  {locationMode === 'gps' && (
                    <TouchableOpacity
                      style={[styles.gpsButton, isLocating && styles.gpsButtonDisabled]}
                      onPress={handleUseCurrentLocation}
                      disabled={isLocating}
                    >
                      {isLocating ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="location" size={18} color="#fff" />
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                {locationMode === 'gps' && locationSuggestionsLoading && (
                  <View style={styles.suggestionsRow}>
                    <ActivityIndicator size="small" color="#FF8C42" />
                    <Text style={styles.suggestionsHint}>Searching…</Text>
                  </View>
                )}
                {locationMode === 'gps' && !locationSuggestionsLoading && locationSuggestions.length > 0 && (
                  <View style={styles.suggestionsList}>
                    {locationSuggestions.map((item, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.suggestionItem}
                  onPress={() => selectLocationSuggestion(item.short, item.full)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="location-outline" size={16} color="#666" />
                  <Text style={styles.suggestionText} numberOfLines={2}>
                    {item.short || item.full}
                  </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <Text style={styles.locationHint}>
                  {locationMode === 'manual'
                    ? 'Type any place or address—no search or GPS used.'
                    : 'Search for a place or tap the location button to use your current spot.'}
                </Text>
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Date</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={18} color={selectedDate ? '#333' : '#999'} />
                  <Text style={[styles.datePickerText, !selectedDate && styles.datePickerPlaceholder]}>
                    {getSelectedDateLabel()}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <Modal visible transparent animationType="fade">
                    <TouchableOpacity
                      style={styles.datePickerOverlay}
                      activeOpacity={1}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <TouchableOpacity activeOpacity={1} style={styles.datePickerModal} onPress={() => {}}>
                        <DateTimePicker
                          value={selectedDateObj || new Date()}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                          minimumDate={(() => {
                            const startOfToday = new Date();
                            startOfToday.setHours(0, 0, 0, 0);
                            return startOfToday;
                          })()}
                          onChange={handleDateChange}
                          style={styles.datePickerNative}
                        />
                        {Platform.OS === 'ios' && (
                          <TouchableOpacity
                            style={styles.datePickerDoneButton}
                            onPress={() => {
                              if (!selectedDateObj) {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                setSelectedDateObj(today);
                                setSelectedDate(toLocalDateString(today));
                              }
                              setShowDatePicker(false);
                            }}
                          >
                            <Text style={styles.datePickerDoneText}>Done</Text>
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </Modal>
                )}
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Time</Text>
                <TouchableOpacity style={styles.datePickerButton} onPress={openTimePicker}>
                  <Ionicons name="time-outline" size={18} color={selectedTime ? '#333' : '#999'} />
                  <Text style={[styles.datePickerText, !selectedTime && styles.datePickerPlaceholder]}>
                    {getSelectedTimeLabel()}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Note (optional)</Text>
                <TextInput
                  style={[styles.modalTextInput, styles.noteInput]}
                  value={eventNote}
                  onChangeText={(t) => setEventNote(t.slice(0, 160))}
                  placeholder="Add details (e.g. what to bring, meet at entrance)"
                  placeholderTextColor="#999"
                  multiline
                  maxLength={160}
                />
                <Text style={styles.noteCharCount}>{eventNote.length}/160</Text>
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Limited RSVPs (optional)</Text>
                <View style={styles.locationModeRow}>
                  <TouchableOpacity
                    style={[styles.locationModePill, !limitRsvps && styles.locationModePillActive]}
                    onPress={() => setLimitRsvps(false)}
                  >
                    <Text style={[styles.locationModeText, !limitRsvps && styles.locationModeTextActive]}>
                      Unlimited
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.locationModePill, limitRsvps && styles.locationModePillActive]}
                    onPress={() => setLimitRsvps(true)}
                  >
                    <Text style={[styles.locationModeText, limitRsvps && styles.locationModeTextActive]}>
                      Limit spots
                    </Text>
                  </TouchableOpacity>
                </View>
                {limitRsvps ? (
                  <View style={styles.slotPickerRow}>
                    <TouchableOpacity
                      style={styles.slotStepButton}
                      onPress={() => setMaxRsvps(String(Math.max(1, (Number(maxRsvps) || 6) - 1)))}
                    >
                      <Text style={styles.slotStepText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.slotValueText}>{Math.max(1, Math.min(10, Number(maxRsvps) || 6))} spots</Text>
                    <TouchableOpacity
                      style={styles.slotStepButton}
                      onPress={() => setMaxRsvps(String(Math.min(10, (Number(maxRsvps) || 6) + 1)))}
                    >
                      <Text style={styles.slotStepText}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Join approval</Text>
                <View style={styles.locationModeRow}>
                  <TouchableOpacity
                    style={[styles.locationModePill, !approvalRequired && styles.locationModePillActive]}
                    onPress={() => setApprovalRequired(false)}
                  >
                    <Text style={[styles.locationModeText, !approvalRequired && styles.locationModeTextActive]}>
                      Instant join
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.locationModePill, approvalRequired && styles.locationModePillActive]}
                    onPress={() => setApprovalRequired(true)}
                  >
                    <Text style={[styles.locationModeText, approvalRequired && styles.locationModeTextActive]}>
                      Host approval
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Photo (optional)</Text>
                {(() => {
                  const previewUri =
                    planPhotoUri ||
                    (editingPlan?.image_url && !clearExistingPlanImage ? editingPlan.image_url : null);
                  return previewUri ? (
                    <CachedImage source={{ uri: previewUri }} style={styles.planPhotoPreview} />
                  ) : (
                    <Text style={styles.locationHint}>No image — tap below to add one.</Text>
                  );
                })()}
                <View style={styles.planPhotoActions}>
                  <TouchableOpacity style={styles.planPhotoPickButton} onPress={() => void pickPlanPhoto()}>
                    <Ionicons name="image-outline" size={18} color="#FF8C42" />
                    <Text style={styles.planPhotoPickText}>{planPhotoUri || editingPlan?.image_url ? 'Change photo' : 'Add photo'}</Text>
                  </TouchableOpacity>
                  {(planPhotoUri || (editingPlan?.image_url && !clearExistingPlanImage)) ? (
                    <TouchableOpacity style={styles.planPhotoRemoveButton} onPress={removePlanPhoto}>
                      <Text style={styles.planPhotoRemoveText}>Remove</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {!editingPlan && (
                <View style={styles.formInputContainer}>
                  <View style={styles.forumToggleRow}>
                    <Text style={styles.inputLabel}>Post in forum</Text>
                    <Switch
                      value={announceInForum}
                      onValueChange={(val) => {
                        setAnnounceInForum(val);
                        if (val && !forumMessageDraft) setForumMessageDraft(buildForumDraft());
                      }}
                      trackColor={{ false: '#ddd', true: '#FF8C42' }}
                      thumbColor="#fff"
                    />
                  </View>
                  {announceInForum && (
                    <TextInput
                      style={styles.forumDraftInput}
                      value={forumMessageDraft}
                      onChangeText={setForumMessageDraft}
                      multiline
                      placeholder="Add a message to the forum..."
                      placeholderTextColor="#bbb"
                      onFocus={() => {
                        if (!forumMessageDraft) setForumMessageDraft(buildForumDraft());
                      }}
                    />
                  )}
                </View>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[
                    styles.scheduleConfirmButton,
                    (creating || updatingPlanId) && { opacity: 0.7 },
                    (!selectedDate || !selectedTime || !eventTitle.trim()) && styles.scheduleConfirmButtonDisabled,
                  ]}
                  onPress={handleCreatePlan}
                  disabled={creating || !!updatingPlanId || !selectedDate || !selectedTime || !eventTitle.trim()}
                >
                  {creating || updatingPlanId ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.scheduleConfirmText}>
                      {editingPlan ? 'Save changes' : 'Create plan'}
                    </Text>
                  )}
                </TouchableOpacity>
                {editingPlan ? (
                  <TouchableOpacity
                    style={[styles.deletePlanButton, deletingPlanId === editingPlan.id && { opacity: 0.7 }]}
                    onPress={handleDeletePlan}
                    disabled={!!deletingPlanId}
                  >
                    {deletingPlanId === editingPlan.id ? (
                      <ActivityIndicator size="small" color="#D32F2F" />
                    ) : (
                      <Text style={styles.deletePlanButtonText}>Cancel plan</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.cancelButton} onPress={resetCreateForm}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
          </View>
        </AppKeyboardAvoidingView>

        {showTimePicker && (
          <View style={styles.timePickerOverlayInline} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.timePickerOverlayTap}
              activeOpacity={1}
              onPress={() => setShowTimePicker(false)}
            />
            <View
              style={[
                styles.timePickerModal,
                { top: Math.max(insets.top, 12) + 8 },
              ]}
            >
              <Text style={styles.timePickerTitle}>Select time</Text>
              <View style={styles.timePickerColumns}>
                <View style={styles.timePickerColumn}>
                  <ScrollView style={styles.timePickerWheel} showsVerticalScrollIndicator={false}>
                    {HOURS.map((h) => (
                      <TouchableOpacity
                        key={h}
                        style={[styles.timePickerItem, selectedHour === h && styles.timePickerItemSelected]}
                        onPress={() => setSelectedHour(h)}
                      >
                        <Text style={styles.timePickerItemText}>{h}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={styles.timePickerColumn}>
                  <ScrollView style={styles.timePickerWheel} showsVerticalScrollIndicator={false}>
                    {MINUTES.map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.timePickerItem, selectedMinute === m && styles.timePickerItemSelected]}
                        onPress={() => setSelectedMinute(m)}
                      >
                        <Text style={styles.timePickerItemText}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={styles.timePickerColumn}>
                  <ScrollView style={styles.timePickerWheel} showsVerticalScrollIndicator={false}>
                    {AMPM.map((a) => (
                      <TouchableOpacity
                        key={a}
                        style={[styles.timePickerItem, selectedAmPm === a && styles.timePickerItemSelected]}
                        onPress={() => setSelectedAmPm(a)}
                      >
                        <Text style={styles.timePickerItemText}>{a}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
              <View style={styles.timePickerActions}>
                <TouchableOpacity style={styles.timePickerCancel} onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.timePickerCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.timePickerConfirm} onPress={confirmTimeSelection}>
                  <Text style={styles.timePickerConfirmText}>Set time</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eaecee', overflow: 'visible' },
  header: {
    padding: 20,
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
  backToForumBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 6,
  },
  backToForumText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  headerTitleBlock: { flex: 1 },
  title: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#666', marginTop: 4 },
  createPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF8C42',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  createPlanButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  listContent: { padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 16, fontFamily: 'Inter_400Regular', color: '#666', marginTop: 12 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#333', marginTop: 16 },
  emptySubtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#666', marginTop: 8, textAlign: 'center' },
  emptyList: { paddingVertical: 40, alignItems: 'center' },
  emptyListText: { fontSize: 16, fontFamily: 'Inter_500Medium', color: '#666' },
  emptyListSubtext: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#999', marginTop: 4 },
  planCard: {
    position: 'relative',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderLeftWidth: 4,
    borderLeftColor: '#FFCF56',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  planCardImage: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#f0f0f0',
  },
  planSkillTopRight: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
  },
  planSkillBubble: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    maxWidth: 112,
  },
  planSkillBubbleText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 1,
  },
  planCardHeader: { marginBottom: 12 },
  planTitleHeader: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#333', marginBottom: 4, flex: 1 },
  planTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  planFullLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  planTitleWithSkillCorner: { paddingRight: 102 },
  planLocationSub: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#555', marginBottom: 6, lineHeight: 20 },
  planDateTime: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#666', marginBottom: 4 },
  seatRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginBottom: 6, flexWrap: 'wrap' },
  seatDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#d7d7d7',
    backgroundColor: '#fff',
  },
  seatDotFilled: { backgroundColor: '#FF8C42', borderColor: '#FF8C42' },
  seatText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: '#666' },
  approvalTag: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#7a5a00',
    backgroundColor: '#FFF5D9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 6,
  },
  planCreatorRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  planCreatorLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#666' },
  planCreatorLink: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#FF8C42' },
  planNote: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#666', marginTop: 6, marginBottom: 6 },
  planCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  joinButtonJoined: {
    backgroundColor: '#f6fbf6',
    borderColor: '#388E3C',
  },
  joinButtonDisabled: {
    backgroundColor: '#fff',
    borderColor: '#ccc',
  },
  joinButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#4CAF50' },
  joinButtonTextJoined: { color: '#388E3C' },
  joinButtonTextDisabled: { color: '#bbb' },
  editPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FF8C42',
  },
  editPlanButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FF8C42' },
  joinCountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F7F7F7',
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 20,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  joinCount: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#666' },
  requestsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF8E6',
    borderWidth: 1,
    borderColor: '#F0DDAA',
    borderRadius: 20,
    minHeight: 36,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  requestsButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#7a5a00' },
  groupChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF3E8',
    borderWidth: 1,
    borderColor: '#FFE0C4',
    borderRadius: 20,
    minHeight: 36,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  groupChatButtonFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF3E8',
    borderWidth: 1,
    borderColor: '#FFE0C4',
    borderRadius: 20,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
  },
  groupChatButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#B25600' },
  attendeesOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  attendeesCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
  },
  attendeesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  attendeesTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  attendeesEmpty: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    paddingVertical: 8,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1F1',
  },
  attendeeAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEE',
  },
  attendeeName: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#333',
  },
  attendeeRemoveText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#FF3B30',
    paddingLeft: 8,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1F1',
  },
  requestIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  requestActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  requestDeclineBtn: {
    borderWidth: 1,
    borderColor: '#E2B7B7',
    backgroundColor: '#FFF6F6',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  requestDeclineText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#B44' },
  requestApproveBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    minWidth: 68,
    alignItems: 'center',
  },
  requestApproveText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  modalKeyboardContainer: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },
  /** Tap above sheet to dismiss keyboard (does not close modal) */
  modalOverlayDimTap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    overflow: 'hidden',
  },
  modalTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#333', paddingHorizontal: 24, paddingTop: 20 },
  modalTitleSpacer: { height: 8 },
  scheduleDivider: { height: 4, marginHorizontal: 24, borderRadius: 2, marginBottom: 16 },
  /** Fills sheet; scroll when form + keyboard need more room */
  modalScrollView: { flexGrow: 1, flexShrink: 1 },
  modalScrollContent: { paddingHorizontal: 24, paddingTop: 0 },
  formInputContainer: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#333', marginBottom: 8 },
  locationModeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  locationModePill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  locationModePillActive: { backgroundColor: '#FFE8D6' },
  locationModeText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#666' },
  locationModeTextActive: { color: '#FF8C42' },
  skillLevelPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  skillLevelPill: { flex: 1, paddingHorizontal: 8, alignItems: 'center' as const },
  skillLevelPillText: { fontSize: 13, textAlign: 'center' as const },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTextInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  locationInput: { minHeight: 48 },
  gpsButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FF8C42',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gpsButtonDisabled: { opacity: 0.6 },
  suggestionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 4 },
  suggestionsHint: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#666' },
  suggestionsList: { marginTop: 4, borderWidth: 1, borderColor: '#eee', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fafafa' },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  suggestionText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: '#333' },
  locationHint: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#999', marginTop: 8 },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  datePickerText: { fontSize: 16, fontFamily: 'Inter_400Regular', color: '#333' },
  datePickerPlaceholder: { color: '#999' },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  datePickerModal: { backgroundColor: 'white', borderRadius: 16, overflow: 'hidden' },
  datePickerNative: { height: 200 },
  datePickerDoneButton: { padding: 16, alignItems: 'center', backgroundColor: '#f5f5f5' },
  datePickerDoneText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FF8C42' },
  noteInput: { minHeight: 64 },
  noteCharCount: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#999', marginTop: 4, textAlign: 'right' },
  forumToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  forumDraftInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    minHeight: 72,
    textAlignVertical: 'top',
    backgroundColor: '#fafafa',
  },
  slotPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slotStepButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#FFCF56',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFBF0',
  },
  slotStepText: { fontSize: 20, lineHeight: 22, fontFamily: 'Inter_700Bold', color: '#FF8C42' },
  slotValueText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#333' },
  planPhotoPreview: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    marginBottom: 10,
  },
  planPhotoActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  planPhotoPickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFCF56',
    backgroundColor: '#FFFBF0',
  },
  planPhotoPickText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FF8C42' },
  planPhotoRemoveButton: { paddingVertical: 10, paddingHorizontal: 8 },
  planPhotoRemoveText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#999' },
  modalButtons: { paddingHorizontal: 24, paddingTop: 8, gap: 12 },
  scheduleConfirmButton: {
    backgroundColor: '#FF8C42',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  scheduleConfirmButtonDisabled: { opacity: 0.5 },
  scheduleConfirmText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  deletePlanButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F2C5C5',
    borderRadius: 12,
    backgroundColor: '#FFF5F5',
  },
  deletePlanButtonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#D32F2F' },
  cancelButton: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 16, fontFamily: 'Inter_500Medium', color: '#666' },
  timePickerOverlayInline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 20,
  },
  timePickerOverlayTap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  /** Anchored to top (inline `top` + safe area) so keyboard doesn’t cover it */
  timePickerModal: {
    position: 'absolute',
    left: 24,
    right: 24,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    maxHeight: 320,
    zIndex: 21,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 8 },
    }),
  },
  timePickerTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#333', marginBottom: 12 },
  timePickerColumns: { flexDirection: 'row', gap: 8 },
  timePickerColumn: { flex: 1 },
  timePickerWheel: { maxHeight: 180 },
  timePickerItem: {
    height: TIME_ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  timePickerItemSelected: { backgroundColor: '#FFE8D6' },
  timePickerItemText: { fontSize: 16, fontFamily: 'Inter_400Regular', color: '#333' },
  timePickerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 },
  timePickerCancel: { paddingVertical: 8, paddingHorizontal: 16 },
  timePickerCancelText: { fontSize: 15, fontFamily: 'Inter_500Medium', color: '#666' },
  timePickerConfirm: { paddingVertical: 8, paddingHorizontal: 16 },
  timePickerConfirmText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FF8C42' },
});
