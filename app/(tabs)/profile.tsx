import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
  Animated,
  Switch,
  AppState,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useProfile } from '@/hooks/useProfile';
import { useProfileStore } from '@/store/useProfileStore';
import { ReadyTodayToggle } from '@/components/ReadyTodayToggle';
import { useAuth } from '@/hooks/useAuth';
import { useActivities } from '@/hooks/useActivities';
import { useAvailability } from '@/hooks/useAvailability';
import { supabase } from '@/lib/supabase';
import { ICONS } from '@/lib/helperUtils';
import { CachedImage } from '@/components/CachedImage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Linking, Platform, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TodayActivitySection } from '@/components/TodayActivitySection';
import {
  formatLocalYyyyMmDd,
  formatPlanTime12hShort,
  isPlanDayPast,
} from '@/lib/planDateTime';
import { getPlanSkillLevelColor, parsePlanSkillLevel } from '@/lib/planSkillLevel';
import { registerPushNotificationsForLoggedInUser } from '@/hooks/useNotifications';
import { deleteUserAccount } from '@/lib/deleteAccount';
import { getMostRecentPlanDate, isCommunityBuilderStatus } from '@/lib/communityBuilder';
import {
  changeEmailInApp,
  changePasswordInApp,
  sendPasswordResetEmail,
  validateNewEmail,
  validatePasswordPair,
} from '@/lib/accountSettings';

const SPARKLE_COLORS = ['#FF8C42', '#FFCF56', '#F5A623', '#FFD700', '#FF6B35', '#FFC107', '#FFE066', '#F5A623'];
const SPARKLE_COUNT = 8;

function CommunityBuilderCelebration({ visible, onDismiss, name }: {
  visible: boolean;
  onDismiss: () => void;
  name: string;
}) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const starScale = useRef(new Animated.Value(0)).current;
  const starGlow = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(30)).current;
  const sparkleAnims = useRef(
    Array.from({ length: SPARKLE_COUNT }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;

    overlayOpacity.setValue(0);
    starScale.setValue(0);
    starGlow.setValue(0);
    contentOpacity.setValue(0);
    contentTranslateY.setValue(30);
    sparkleAnims.forEach(s => { s.x.setValue(0); s.y.setValue(0); s.opacity.setValue(0); s.scale.setValue(0); });

    Animated.sequence([
      Animated.timing(overlayOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(starScale, { toValue: 1, tension: 35, friction: 5, useNativeDriver: true }),
      Animated.parallel([
        ...sparkleAnims.map((s, i) => {
          const angle = (i / SPARKLE_COUNT) * Math.PI * 2 - Math.PI / 2;
          const dist = 85;
          return Animated.parallel([
            Animated.timing(s.opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
            Animated.timing(s.x, { toValue: Math.cos(angle) * dist, duration: 550, useNativeDriver: true }),
            Animated.timing(s.y, { toValue: Math.sin(angle) * dist, duration: 550, useNativeDriver: true }),
            Animated.spring(s.scale, { toValue: 1, tension: 80, friction: 5, useNativeDriver: true }),
          ]);
        }),
        Animated.parallel([
          Animated.timing(contentOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
          Animated.spring(contentTranslateY, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
        ]),
      ]),
    ]).start();

    setTimeout(() => {
      Animated.parallel(
        sparkleAnims.map(s => Animated.timing(s.opacity, { toValue: 0, duration: 350, useNativeDriver: true }))
      ).start();
    }, 700);

    Animated.loop(
      Animated.sequence([
        Animated.timing(starGlow, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(starGlow, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [visible]);

  const starRotate = starScale.interpolate({
    inputRange: [0, 0.4, 0.7, 1],
    outputRange: ['0deg', '18deg', '-10deg', '0deg'],
  });
  const glowScale = starGlow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });
  const glowOpacity = starGlow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[celebStyles.overlay, { opacity: overlayOpacity }]}>
        <View style={celebStyles.card}>
          <View style={celebStyles.starContainer}>
            <Animated.View style={[celebStyles.glowRing, { transform: [{ scale: glowScale }], opacity: glowOpacity }]} />
            {sparkleAnims.map((s, i) => (
              <Animated.View
                key={i}
                style={[
                  celebStyles.sparkle,
                  { backgroundColor: SPARKLE_COLORS[i % SPARKLE_COLORS.length] },
                  { opacity: s.opacity, transform: [{ translateX: s.x }, { translateY: s.y }, { scale: s.scale }] },
                ]}
              />
            ))}
            <Animated.View style={[celebStyles.starBadge, { transform: [{ scale: starScale }, { rotate: starRotate }] }]}>
              <Ionicons name="star" size={52} color="#fff" />
            </Animated.View>
          </View>

          <Animated.View style={{ opacity: contentOpacity, transform: [{ translateY: contentTranslateY }], alignItems: 'center' }}>
            <Text style={celebStyles.title}>Community Builder!</Text>
            <Text style={celebStyles.subtitle}>
              {name}, you've created plans that bring people together
            </Text>
            <Text style={celebStyles.description}>
              Your star badge lives on your profile as long as you keep creating plans.
            </Text>
            <TouchableOpacity style={celebStyles.btn} onPress={onDismiss} activeOpacity={0.85}>
              <Text style={celebStyles.btnText}>That's awesome! ⭐</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

function CommunityBuilderExpired({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={expiredStyles.overlay}>
        <View style={expiredStyles.card}>
          <Ionicons name="star-outline" size={40} color="#aaa" style={{ marginBottom: 12 }} />
          <Text style={expiredStyles.title}>Community Builder status expired</Text>
          <Text style={expiredStyles.body}>
            Your badge requires 3 plans created in the last 2 weeks and activity within the past month. Create more plans to earn it back!
          </Text>
          <TouchableOpacity style={expiredStyles.btn} onPress={onDismiss} activeOpacity={0.85}>
            <Text style={expiredStyles.btnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const expiredStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 28,
    alignItems: 'center',
    marginHorizontal: 28,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  btn: {
    backgroundColor: '#FF8C42',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  btnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
});

const celebStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#1C1408',
    borderRadius: 28,
    paddingHorizontal: 32,
    paddingTop: 44,
    paddingBottom: 36,
    alignItems: 'center',
    marginHorizontal: 24,
    borderWidth: 1.5,
    borderColor: '#F5A623',
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  starContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  glowRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F5A623',
  },
  sparkle: {
    position: 'absolute',
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  starBadge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F5A623',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
    elevation: 10,
  },
  title: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    color: '#FFCF56',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 25,
  },
  description: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#888',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  btn: {
    backgroundColor: '#F5A623',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 40,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  btnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
});

export default function ProfileScreen() {
  const { user, signOut, loading: authLoading } = useAuth();
  const {
    profile,
    userSkills,
    loading,
    uploading,
    updateSkillLevel,
    updateReadyToday,
    uploadProfileImage,
    refetch,
    removeActivity,
  } = useProfile();
  const { activities } = useActivities();
  const { availability, loading: availabilityLoading, updateAvailability, DAYS_OF_WEEK, TIME_BLOCKS } = useAvailability();
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [editNameError, setEditNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [showAvailabilityInfo, setShowAvailabilityInfo] = useState(false);
  const [showReadyTodayInfo, setShowReadyTodayInfo] = useState(false);
  const [photoZoomVisible, setPhotoZoomVisible] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [eventsJoined, setEventsJoined] = useState<any[]>([]);
  const [eventsJoinedLoading, setEventsJoinedLoading] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [settingsScreen, setSettingsScreen] = useState<'main' | 'notifications' | 'privacy' | 'account' | 'about' | 'terms' | 'blocked'>('main');
  const [notificationStatus, setNotificationStatus] = useState<'granted' | 'denied' | 'undetermined' | 'provisional' | 'unknown'>('unknown');
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [sendingResetLink, setSendingResetLink] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    body: string;
    confirmText: string;
    onConfirm: () => Promise<void> | void;
    destructive?: boolean;
  } | null>(null);
  const [showSystemSettingsPrompt, setShowSystemSettingsPrompt] = useState(false);
  const [systemToggleTarget, setSystemToggleTarget] = useState<'on' | 'off' | null>(null);
  const hasActivities = userSkills.some((userSkill) => userSkill.activities);
  const [editingSkill, setEditingSkill] = useState<{ activityId: string; current: 'Beginner' | 'Intermediate' | 'Advanced' } | null>(null);
  const [planStats, setPlanStats] = useState<{ created: number; joined: number; lastCreatedAt: string | null } | null>(null);
  const [planCreatedDates, setPlanCreatedDates] = useState<string[]>([]);
  const [showCommunityBuilderExpired, setShowCommunityBuilderExpired] = useState(false);
  const [showCommunityBuilderCelebration, setShowCommunityBuilderCelebration] = useState(false);
  const isCommunityBuilder = isCommunityBuilderStatus(planCreatedDates);

  useEffect(() => {
    setEditNameValue(profile?.name || '');
  }, [profile?.name]);

  useEffect(() => {
    if (!user?.id) return;
    const fetchPlanStats = async () => {
      try {
        const { data: planRows, error: plansErr } = await supabase
          .from('activity_plans')
          .select('created_at')
          .eq('creator_id', user.id)
          .order('created_at', { ascending: false });
        if (plansErr) console.error('Plan dates error:', plansErr);

        const createdAts = (planRows ?? [])
          .map((row) => row.created_at)
          .filter((value): value is string => !!value);

        // Fetch joined count separately so a failure here doesn't block the badge
        let joinedCount = 0;
        try {
          const { count: joined } = await supabase
            .from('plan_joins')
            .select('plan_id, activity_plans!inner(creator_id)', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .neq('activity_plans.creator_id', user.id);
          joinedCount = joined ?? 0;
        } catch (joinErr) {
          console.error('Plan joined count error:', joinErr);
        }

        const stats = {
          created: createdAts.length,
          joined: joinedCount,
          lastCreatedAt: getMostRecentPlanDate(createdAts),
        };
        setPlanCreatedDates(createdAts);
        setPlanStats(stats);

        const isBuilder = isCommunityBuilderStatus(createdAts);

        const celebKey = `community_builder_celebrated_${user.id}`;
        const statusKey = `community_builder_status_${user.id}`;

        if (isBuilder) {
          await AsyncStorage.setItem(statusKey, 'active');
          const alreadyCelebrated = await AsyncStorage.getItem(celebKey);
          if (!alreadyCelebrated) {
            await AsyncStorage.setItem(celebKey, 'true');
            setTimeout(() => setShowCommunityBuilderCelebration(true), 600);
          }
        } else {
          // Check if badge was previously active — if so, notify of expiry (once)
          const prevStatus = await AsyncStorage.getItem(statusKey);
          const wasCelebrated = await AsyncStorage.getItem(celebKey);
          if (wasCelebrated && prevStatus === 'active') {
            await AsyncStorage.setItem(statusKey, 'expired');
            setTimeout(() => setShowCommunityBuilderExpired(true), 600);
          }
        }
      } catch (err) {
        console.error('fetchPlanStats error:', err);
      }
    };
    void fetchPlanStats();
  }, [user?.id]);

  // Fetch blocked users
  const fetchBlockedUsers = useCallback(async () => {
    if (!user?.id) {
      setBlockedUsers([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('blocked_users')
        .select('blocked_user_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching blocked users:', error);
        setBlockedUsers([]);
        return;
      }

      if (!data || data.length === 0) {
        setBlockedUsers([]);
        return;
      }

      // Fetch profile info for each blocked user
      const blockedUserIds = data.map((item: any) => item.blocked_user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', blockedUserIds);

      const profileById = new Map(
        (profiles || []).map((p: any) => [String(p.id).toLowerCase().trim(), p])
      );
      if (profilesError) {
        console.error('Error fetching blocked user profiles:', profilesError);
        setBlockedUsers(
          data.map((row: any) => ({
            id: String(row.blocked_user_id).trim(),
            name: 'Unknown User',
            avatar_url: null as string | null,
          }))
        );
      } else {
        const mapped = data.map((row: any) => {
          const bid = String(row.blocked_user_id).trim();
          const p = profileById.get(bid.toLowerCase());
          return {
            id: bid,
            name: (p?.name as string) || 'Unknown User',
            avatar_url: (p?.avatar_url as string) || null,
          };
        });
        setBlockedUsers(mapped);
      }
    } catch (error) {
      console.error('Unexpected error fetching blocked users:', error);
      setBlockedUsers([]);
    }
  }, [user?.id]);

  const performUnblockUser = useCallback(
    async (blockedUser: { id: string; name?: string }) => {
      setSettingsError(null);
      setSettingsMessage(null);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) {
        const msg = 'Session expired. Sign in again to unblock.';
        setSettingsError(msg);
        Alert.alert('Unblock', msg);
        return;
      }
      const blockedId = blockedUser?.id != null ? String(blockedUser.id).trim() : '';
      if (!blockedId) {
        setSettingsError('Could not unblock: missing user id.');
        return;
      }
      const { error, count } = await supabase
        .from('blocked_users')
        .delete({ count: 'exact' })
        .eq('user_id', uid)
        .eq('blocked_user_id', blockedId);
      if (error) {
        console.error('Unblock error:', error);
        const msg = error.message || 'Failed to unblock user.';
        setSettingsError(msg);
        Alert.alert('Unblock failed', msg);
        return;
      }
      let removed = (count ?? 0) >= 1;
      if (!removed) {
        const { data: stillBlocked } = await supabase
          .from('blocked_users')
          .select('id')
          .eq('user_id', uid)
          .eq('blocked_user_id', blockedId)
          .maybeSingle();
        removed = !stillBlocked;
      }
      if (!removed) {
        console.warn('Unblock: no rows deleted', { user_id: uid, blocked_user_id: blockedId, count });
        setSettingsError('Could not remove the block. Try refreshing the list.');
        await fetchBlockedUsers();
        Alert.alert('Unblock', 'Could not remove the block. Try again.');
        return;
      }
      await fetchBlockedUsers();
      const label = blockedUser.name || 'User';
      setSettingsMessage(`${label} unblocked.`);
      Alert.alert('Unblocked', `${label} has been unblocked.`);
    },
    [fetchBlockedUsers]
  );

  const fetchInvites = useCallback(async () => {
    if (!user?.id) {
      setInvites([]);
      return;
    }
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7);
    // Use local date (YYYY-MM-DD) to avoid UTC off-by-one around midnight.
    const cutoffDate = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    setInvitesLoading(true);
    try {
      await supabase
        .from('meetup_invites')
        .delete()
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .lt('event_date', cutoffDate);

      const { data, error } = await supabase
        .from('meetup_invites')
        .select(`
          id,
          status,
          event_date,
          event_time,
          location,
          created_at,
          activity_name,
          sender_id,
          recipient_id,
          sender:profiles!meetup_invites_sender_id_fkey(id, name, avatar_url),
          recipient:profiles!meetup_invites_recipient_id_fkey(id, name, avatar_url)
        `)
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching invites:', error);
        setInvites([]);
      } else {
        const d = new Date();
        const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const filtered = (data || []).filter((invite: any) => {
          if (!invite.event_date) return true;
          if (invite.event_date < todayKey) return false;
          const eventTime = new Date(`${invite.event_date}T${invite.event_time || '00:00'}`).getTime();
          return eventTime >= cutoff.getTime();
        });
        setInvites(filtered);
      }
    } catch (error) {
      console.error('Error fetching invites:', error);
      setInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  }, [user?.id]);

  const fetchJoinedEvents = useCallback(async () => {
    if (!user?.id) {
      setEventsJoined([]);
      return;
    }
    setEventsJoinedLoading(true);
    try {
      // Use local date (YYYY-MM-DD) to avoid UTC off-by-one around midnight.
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      // Plans the user has joined (including creator auto-join)
      const { data: joinsData, error: joinsError } = await supabase
        .from('plan_joins')
        .select('id, plan_id, joined_at')
        .eq('user_id', user.id);

      const planIdsFromJoins = joinsError || !joinsData?.length ? [] : joinsData.map((j: { plan_id: string }) => j.plan_id);
      const joinMap = new Map(
        (joinsData || []).map((j: { plan_id: string; id: string }) => [j.plan_id, j.id])
      );

      // Fetch plans: either joined by user OR created by user, and event_date >= today
      const plansQuery = supabase
        .from('activity_plans')
        .select(`
          id,
          activity_id,
          creator_id,
          title,
          location,
          event_date,
          event_time,
          note,
          skill_level,
          activities!activity_plans_activity_id_fkey (name, emoji),
          profiles!activity_plans_creator_id_fkey (name)
        `)
        .gte('event_date', today);

      const { data: plansData, error: plansError } =
        planIdsFromJoins.length > 0
          ? await plansQuery.or(`id.in.(${planIdsFromJoins.join(',')}),creator_id.eq.${user.id}`)
          : await plansQuery.eq('creator_id', user.id);

      if (plansError) {
        console.error('Error fetching joined events:', plansError);
        setEventsJoined([]);
        setEventsJoinedLoading(false);
        return;
      }

      const list = (plansData || []).map((plan: any) => ({
          id: joinMap.get(plan.id) ?? plan.id,
          plan_id: plan.id,
          activity_id: plan.activity_id,
          creator_id: plan.creator_id,
          title: plan.title ?? '',
          location: plan.location,
          event_date: plan.event_date,
          event_time: plan.event_time,
          note: plan.note ?? null,
          skill_level: plan.skill_level ?? null,
          activity_name: plan.activities?.name ?? 'Activity',
          activity_emoji: plan.activities?.emoji ?? '📌',
          creator_name: plan.profiles?.name ?? 'Someone',
        }))
        .filter((plan: any) => !isPlanDayPast(plan.event_date))
        .sort((a: any, b: any) => {
          const d = (x: any) => new Date(`${x.event_date}T${x.event_time || '00:00'}`).getTime();
          return d(a) - d(b);
        });
      setEventsJoined(list);
    } catch (error) {
      console.error('Error fetching joined events:', error);
      setEventsJoined([]);
    } finally {
      setEventsJoinedLoading(false);
    }
  }, [user?.id]);

  const refreshNotificationStatus = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotificationStatus(status ?? 'unknown');
  };

  const openSettingsScreen = async (
    screen: 'main' | 'notifications' | 'privacy' | 'account' | 'about' | 'terms' | 'blocked'
  ) => {
    setSettingsError(null);
    setSettingsMessage(null);
    setSettingsScreen(screen);
    setSettingsModalVisible(true);
    if (screen === 'notifications' || screen === 'main') {
      await refreshNotificationStatus();
    }
    if (screen === 'blocked') {
      await fetchBlockedUsers();
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && settingsModalVisible) {
        refreshNotificationStatus();
      }
    });
    return () => subscription.remove();
  }, [settingsModalVisible]);

  const openConfirm = (config: {
    title: string;
    body: string;
    confirmText: string;
    onConfirm: () => Promise<void> | void;
    destructive?: boolean;
  }) => {
    setConfirmConfig(config);
  };

  // Refresh profile data when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      refetch();
      fetchBlockedUsers();
      fetchInvites();
      fetchJoinedEvents();
    }, [refetch, fetchBlockedUsers, fetchInvites, fetchJoinedEvents])
  );

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Sorry, we need camera roll permissions to change your profile photo.');
      return false;
    }
    return true;
  };

  const handleImageSelection = async (type: 'library' | 'camera') => {
    if (type === 'library') {
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;
    } else {
       const { status } = await ImagePicker.requestCameraPermissionsAsync();
       if (status !== 'granted') {
          Alert.alert('Permission Required', 'We need camera access.');
          return;
       }
    }

    try {
      let result;
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      };
      
      if (type === 'library') {
        result = await ImagePicker.launchImageLibraryAsync(options);
      } else {
        result = await ImagePicker.launchCameraAsync(options);
      }

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;

        // Ask the user to confirm before saving the new photo
        Alert.alert(
          'Save Profile Photo',
          'Use this photo as your profile picture?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Save',
              onPress: async () => {
                const response = await uploadProfileImage(uri);

                if (response.success) {
                  Alert.alert('Success', 'Profile photo updated!');
                } else {
                  Alert.alert('Error', response.error || 'Failed to upload image');
                }
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image.');
    }
  };

  const handleImageUpload = () => {
    Alert.alert(
      'Change Profile Photo',
      'Choose an option',
      [
        { text: 'Camera', onPress: () => handleImageSelection('camera') },
        { text: 'Photo Library', onPress: () => handleImageSelection('library') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };


  const handleSkillLevelChange = (activity: string) => {
    const activityObj = activities.find(a => a.name === activity);
    if (!activityObj) return;

    Alert.alert(
      `${activity} Skill Level`,
      'Select your skill level',
      [
        { text: 'Beginner', onPress: () => updateSkillLevel(activityObj.id, 'Beginner') },
        { text: 'Intermediate', onPress: () => updateSkillLevel(activityObj.id, 'Intermediate') },
        { text: 'Advanced', onPress: () => updateSkillLevel(activityObj.id, 'Advanced') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleInviteResponse = async (inviteId: string, status: 'accepted' | 'declined') => {
    if (!inviteId?.trim()) return;
    try {
      const { error } = await supabase
        .from('meetup_invites')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', inviteId);

      if (error) {
        setSettingsError('Failed to update invite.');
        return;
      }

      setSettingsMessage(status === 'accepted' ? 'Invite accepted.' : 'Invite declined.');
      fetchInvites();
    } catch (error) {
      console.error('Error responding to invite:', error);
      setSettingsError('Failed to update invite.');
    }
  };

  const getSkillColor = (skillLevel: string) => {
    switch (skillLevel) {
      case 'Beginner':
        return '#4CAF50';
      case 'Intermediate':
        return '#FFBF00';
      case 'Advanced':
        return '#FF8C42';
      default:
        return '#999';
    }
  };

  const getInviteStatusStyle = (status: string) => {
    if (status === 'accepted') {
      return { badge: { backgroundColor: '#E7F6EA' }, text: { color: '#2E7D32' } };
    }
    if (status === 'declined') {
      return { badge: { backgroundColor: '#FFE8E8' }, text: { color: '#C0392B' } };
    }
    return { badge: { backgroundColor: '#FFF3D6' }, text: { color: '#B26A00' } };
  };

  const performDeleteAccount = async () => {
    if (!user || deletingAccount) return;
    setDeletingAccount(true);
    setSettingsError(null);
    setSettingsMessage(null);
    try {
      const { ok, error } = await deleteUserAccount();
      if (!ok) {
        setSettingsError(error || 'Could not delete account. Please try again.');
        return;
      }
      setSettingsModalVisible(false);
      await signOut();
      router.replace('/(auth)/login');
      Alert.alert('Account deleted', 'Your account and data have been permanently removed.');
    } catch (e) {
      console.error('Delete account failed:', e);
      setSettingsError('Could not delete account. Please try again.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const accountEmail = (user?.email ?? profile?.email ?? '').trim().toLowerCase();

  const handleChangePassword = async () => {
    const validation = validatePasswordPair(newPassword, confirmNewPassword);
    if (validation) {
      setSettingsError(validation);
      setSettingsMessage(null);
      return;
    }
    setUpdatingPassword(true);
    setSettingsError(null);
    setSettingsMessage(null);
    try {
      const { ok, error } = await changePasswordInApp(newPassword);
      if (!ok) {
        setSettingsError(error || 'Could not update password.');
        return;
      }
      setNewPassword('');
      setConfirmNewPassword('');
      setSettingsMessage('Password updated.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleSendPasswordResetLink = async () => {
    if (!accountEmail) {
      setSettingsError('No email on file.');
      return;
    }
    setSendingResetLink(true);
    setSettingsError(null);
    setSettingsMessage(null);
    try {
      const { ok, error } = await sendPasswordResetEmail(accountEmail);
      if (!ok) {
        setSettingsError(error || 'Could not send reset link.');
        return;
      }
      Alert.alert(
        'Check your email',
        `We sent a password reset link to ${accountEmail}. Open it on this device to set a new password.`
      );
    } finally {
      setSendingResetLink(false);
    }
  };

  const handleChangeEmail = async () => {
    const validation = validateNewEmail(newEmailInput, accountEmail);
    if (validation) {
      setSettingsError(validation);
      setSettingsMessage(null);
      return;
    }
    setUpdatingEmail(true);
    setSettingsError(null);
    setSettingsMessage(null);
    const nextEmail = newEmailInput.trim().toLowerCase();
    try {
      const { ok, error, email } = await changeEmailInApp(nextEmail);
      if (!ok) {
        setSettingsError(error || 'Could not update email.');
        return;
      }
      setNewEmailInput('');
      await refetch();
      setSettingsMessage(`Email updated to ${email ?? nextEmail}.`);
    } finally {
      setUpdatingEmail(false);
    }
  };

  const handleDeleteAccountPress = () => {
    Alert.alert(
      'Delete account?',
      'This permanently removes your profile, messages, chats, and activity data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete permanently?',
              'Your account will be deleted immediately and you will be signed out.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete my account',
                  style: 'destructive',
                  onPress: () => void performDeleteAccount(),
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Log out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSettingsModalVisible(false);
            const { error } = await signOut();
            if (error) {
              Alert.alert('Log out', 'Could not log out. You can try again from the login screen.');
            }
            router.replace('/(auth)/login');
          })();
        },
      },
    ]);
  };

  const handleAppSettings = () => {
    openSettingsScreen('main');
  };

  const handleSaveName = async () => {
    const nextName = editNameValue.trim();
    if (!nextName) {
      setEditNameError('Name cannot be empty.');
      return;
    }
    if (!user?.id) return;

    try {
      setIsSavingName(true);
      setEditNameError(null);
      const { error } = await supabase
        .from('profiles')
        .update({ name: nextName })
        .eq('id', user.id);

      if (error) {
        setEditNameError('Failed to update name.');
        return;
      }

      await refetch();
      setEditNameError(null);
      setShowEditNameModal(false);
      setSettingsMessage('Name updated.');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleNotificationSettings = async () => {
    openSettingsScreen('notifications');
  };

  const openAppNotificationSettings = async () => {
    try {
      if (Platform.OS === 'ios') {
        // Try direct notification settings first, then fall back to app settings.
        try {
          await Linking.openURL('app-settings:notifications');
          return;
        } catch {}
        try {
          await Linking.openURL('App-Prefs:root=NOTIFICATIONS_ID');
          return;
        } catch {}
      }
      await Linking.openSettings();
    } catch (error) {
      console.error('Error opening notification settings:', error);
    }
  };

  const handleBlockedUsers = async () => {
    openSettingsScreen('blocked');
  };

  const handlePrivacySettings = () => {
    openSettingsScreen('privacy');
  };

  const handleAccountSettings = () => {
    openSettingsScreen('account');
  };

  const handleTermsAndSafety = () => {
    openSettingsScreen('terms');
  };

  const handleAboutApp = () => {
    openSettingsScreen('about');
  };

  const handleCheckForUpdates = async () => {
    try {
      if (Platform.OS === 'ios') {
        // App Store URL for The Activity Hub (iOS)
        await Linking.openURL('https://apps.apple.com/us/app/the-activity-hub/id6749449497');
      } else if (Platform.OS === 'android') {
        // Prefer Play Store app if available, fall back to web URL
        const playStoreAppUrl = 'market://details?id=com.campbell3c2.activeportland';
        const playStoreWebUrl = 'https://play.google.com/store/apps/details?id=com.campbell3c2.activeportland';

        const canOpenAppUrl = await Linking.canOpenURL(playStoreAppUrl);
        if (canOpenAppUrl) {
          await Linking.openURL(playStoreAppUrl);
        } else {
          await Linking.openURL(playStoreWebUrl);
        }
      }
    } catch (error) {
      console.error('Error opening store for updates:', error);
    }
  };

  const notificationsEnabled = notificationStatus === 'granted' || notificationStatus === 'provisional';
  const forumNotificationsEnabled = profile?.forum_notifications_enabled !== false;
  const chatNotificationsEnabled = profile?.chat_notifications_enabled !== false;
  const newEventNotificationsEnabled = profile?.new_event_notifications_enabled !== false;
  const readyTodayNotificationsEnabled = profile?.ready_today_notifications_enabled !== false;
  const privateInviteNotificationsEnabled = profile?.private_invite_notifications_enabled !== false;
  const planReminderNotificationsEnabled = profile?.plan_reminder_notifications_enabled !== false;
  const buildNumber = Constants.expoConfig?.ios?.buildNumber || Constants.manifest?.ios?.buildNumber || 'Unknown';
  const version = Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0';

  const updateNotificationPreference = async (
    field:
      | 'forum_notifications_enabled'
      | 'chat_notifications_enabled'
      | 'new_event_notifications_enabled'
      | 'ready_today_notifications_enabled'
      | 'private_invite_notifications_enabled'
      | 'plan_reminder_notifications_enabled',
    nextValue: boolean,
    label: string
  ) => {
    if (!user) {
      setSettingsError('Sign in required to update notifications.');
      return;
    }
    setSettingsError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: nextValue })
      .eq('id', user.id);

    if (error) {
      setSettingsError(`Failed to update ${label.toLowerCase()}.`);
      return;
    }
    const current = useProfileStore.getState().profile;
    if (current) {
      useProfileStore.getState().setProfile({ ...current, [field]: nextValue });
    }
    refetch(true);
    setSettingsMessage(`${label} ${nextValue ? 'enabled' : 'disabled'}.`);
  };

  const handleSystemNotificationToggle = async (nextValue: boolean) => {
    if (!nextValue) {
      setSystemToggleTarget('off');
      setShowSystemSettingsPrompt(true);
      return;
    }

    if (!user?.id) {
      setSettingsError('Sign in required to enable notifications.');
      return;
    }

    if (notificationStatus === 'undetermined' || notificationStatus === 'unknown') {
      setSettingsError(null);
      const ok = await registerPushNotificationsForLoggedInUser(user.id);
      await refreshNotificationStatus();
      await refetch();
      if (ok) {
        setSettingsMessage('Notifications enabled. All notification categories were turned on.');
      } else {
        setSettingsError('Notifications were not enabled. Please try again.');
      }
      return;
    }

    setSystemToggleTarget('on');
    setShowSystemSettingsPrompt(true);
  };

  // Browse without login: show Ready Today preview; full profile still requires sign-in
  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.guestBrowseIntro}>
            <Ionicons name="person-circle-outline" size={56} color="#ccc" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>Browsing without an account</Text>
            <Text style={styles.emptySubtitle}>
              Try Active Today below — same experience as when you're signed in. Sign in to save your choice and
              manage your profile.
            </Text>
          </View>
          <TodayActivitySection
            guestPreview
            userSkills={[]}
            updateReadyToday={() => Promise.resolve(false)}
          />
          <TouchableOpacity
            style={[styles.loginButton, styles.guestLoginButton]}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginButtonText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.guestCreateAccountLink}
            onPress={() => router.push('/(auth)/signup')}
          >
            <Text style={styles.guestCreateAccountLinkText}>Create account</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      {/* Back to Forum */}
      <View style={styles.backBar}>
        <TouchableOpacity style={styles.backBarBtn} onPress={() => router.navigate('/(tabs)/forum')}>
          <Ionicons name="chevron-back" size={18} color="#FF8C42" />
          <Text style={styles.backBarText}>Forum</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.profileTopWrap}>
          <TouchableOpacity
            style={styles.topBarGearAbsolute}
            onPress={handleAppSettings}
            accessibilityLabel="Open settings"
            accessibilityRole="button"
          >
            <Ionicons name="settings-outline" size={26} color="#999" />
          </TouchableOpacity>
          <View style={styles.header}>
          <View style={styles.imageContainer}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                if (profile?.avatar_url) setPhotoZoomVisible(true);
              }}
              disabled={uploading || !profile?.avatar_url}
            >
              {uploading ? (
                <View style={[styles.profileImage, styles.uploadingOverlay]}>
                  <ActivityIndicator color="#FF8C42" />
                </View>
              ) : (
                <CachedImage
                  source={profile?.avatar_url ? { uri: profile?.avatar_url } : ICONS.profileIcon}
                  style={styles.profileImage}
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cameraIconContainer} onPress={handleImageUpload} disabled={uploading}>
              <Ionicons name="camera" size={16} color="white" />
            </TouchableOpacity>
          </View>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile?.name || 'Loading...'}</Text>
            <TouchableOpacity
              style={styles.editNameButton}
              onPress={() => {
                setEditNameError(null);
                setShowEditNameModal(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="pencil-outline" size={14} color="#666" />
            </TouchableOpacity>
          </View>
          {isCommunityBuilder && (
            <View style={styles.communityBuilderBlock}>
              <View style={styles.communityBuilderPill}>
                <Ionicons name="star" size={16} color="#F5A623" />
                <Text style={styles.communityBuilderText}>Community Builder</Text>
              </View>
              <Text style={styles.communityBuilderSubtext}>
                {profile?.name || 'You'} creates plans that bring people together
              </Text>
            </View>
          )}
          <Text style={styles.email}>{profile?.email || 'Loading...'}</Text>
          {planStats && (planStats.created > 0 || planStats.joined > 0) && (
            <View style={styles.statsRow}>
              {planStats.created > 0 && (
                <View style={styles.statChip}>
                  <Ionicons name="calendar" size={18} color="#FF8C42" />
                  <Text style={[styles.statNumber, { color: '#FF8C42' }]}>{planStats.created}</Text>
                  <Text style={styles.statLabel}>plans created</Text>
                </View>
              )}
              {planStats.joined > 0 && (
                <View style={styles.statChip}>
                  <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                  <Text style={[styles.statNumber, { color: '#4CAF50' }]}>{planStats.joined}</Text>
                  <Text style={styles.statLabel}>plans joined</Text>
                </View>
              )}
            </View>
          )}
        </View>
        </View>

        {/* ── My Activities: skill level + Ready Today per activity ── */}
        {userSkills.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleInline}>My Activities</Text>
            </View>
            <LinearGradient
              colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.activitiesDivider}
            />
            {userSkills.map((skill) => {
              const isReady = !!skill.ready_today;
              const skillColor =
                skill.skill_level === 'Beginner' ? '#4CAF50'
                : skill.skill_level === 'Intermediate' ? '#FFCF56'
                : '#FF8C42';
              return (
                <View key={skill.id} style={styles.myActivityRow}>
                  <View style={styles.myActivityHeader}>
                    <Text style={styles.myActivityEmoji}>{skill.activities?.emoji ?? '🏃'}</Text>
                    <Text style={styles.myActivityName}>{skill.activities?.name ?? ''}</Text>
                    {false && (
                    <View style={styles.readyTodayToggleRow}>
                      <Text style={[styles.readyTodayToggleLabel, isReady && styles.readyTodayToggleLabelActive]}>
                        Active Today
                      </Text>
                      <ReadyTodayToggle
                        value={isReady}
                        onValueChange={(val) => updateReadyToday(skill.activity_id, val)}
                      />
                    </View>
                    )}
                    <TouchableOpacity
                      style={styles.skillLevelRow}
                      onPress={() => setEditingSkill({ activityId: skill.activity_id, current: skill.skill_level })}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.skillLevelText, { color: skillColor }]}>{skill.skill_level}</Text>
                      <Ionicons name="pencil-outline" size={13} color="#aaa" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleInline}>Upcoming Plans</Text>
          </View>
          <LinearGradient
            colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.activitiesDivider}
          />
          {eventsJoinedLoading ? (
            <ActivityIndicator size="small" color="#FF8C42" style={{ marginTop: 12 }} />
          ) : eventsJoined.length === 0 ? (
            <Text style={styles.invitesEmptyText}>No plans joined yet.</Text>
          ) : (
            <View style={styles.eventsJoinedList}>
              {eventsJoined.map((event: any) => {
                const dateLabel = event.event_date
                  ? formatLocalYyyyMmDd(event.event_date, 'en-US', {
                      month: 'numeric',
                      day: 'numeric',
                      year: '2-digit',
                    })
                  : '';
                const timeLabel = event.event_time ? formatPlanTime12hShort(event.event_time) : '';
                const titleText = (event.title as string)?.trim() ? event.title : 'Meetup';
                const planSkill = parsePlanSkillLevel(event.skill_level);
                return (
                  <View key={event.id} style={styles.eventJoinedCard}>
                    {planSkill ? (
                      <View
                        style={styles.eventJoinedSkillTopRight}
                        pointerEvents="none"
                        accessibilityLabel={`Skill ${planSkill}`}
                      >
                        <View
                          style={[
                            styles.eventJoinedSkillBubble,
                            { backgroundColor: getPlanSkillLevelColor(planSkill) },
                          ]}
                        >
                          <Text style={styles.eventJoinedSkillBubbleText}>{planSkill}</Text>
                        </View>
                      </View>
                    ) : null}
                    <View style={styles.eventJoinedCardHeader}>
                      <View style={styles.eventJoinedLocationRow}>
                        <Text style={styles.eventJoinedActivityEmoji}>{event.activity_emoji ?? '📌'}</Text>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={[
                              styles.eventJoinedPlanTitle,
                              planSkill ? styles.eventJoinedPlanTitleWithSkillCorner : null,
                            ]}
                            numberOfLines={2}
                          >
                            {titleText}
                          </Text>
                          <Text style={styles.eventJoinedLocation} numberOfLines={2}>
                            {event.location}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Text style={styles.eventJoinedDateTime}>
                      {dateLabel} at {timeLabel}
                    </Text>
                    {event.note ? <Text style={styles.eventJoinedNote}>{event.note}</Text> : null}
                    <View style={styles.eventJoinedCreatorRow}>
                      <Text style={styles.eventJoinedCreatorLabel}>Created by: </Text>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          if (event.creator_id) {
                            router.push({
                              pathname: '/(tabs)/people/[id]',
                              params: { id: event.creator_id, name: event.creator_name, from: 'plans' },
                            });
                          }
                        }}
                      >
                        <Text style={styles.eventJoinedCreatorLink}>{event.creator_name}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleInline}>Private Invites</Text>
          </View>
          <LinearGradient
            colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.activitiesDivider}
          />
          {invitesLoading ? (
            <ActivityIndicator size="small" color="#FF8C42" style={{ marginTop: 12 }} />
          ) : invites.length === 0 ? (
            <Text style={styles.invitesEmptyText}>No invites yet.</Text>
          ) : (
            (() => {
              const now = Date.now();
              const sorted = invites
                .slice()
                .sort((a, b) => {
                  const aDate = a.event_date ? new Date(`${a.event_date}T${a.event_time || '00:00'}`).getTime() : Infinity;
                  const bDate = b.event_date ? new Date(`${b.event_date}T${b.event_time || '00:00'}`).getTime() : Infinity;
                  return aDate - bDate;
                });
              const upcoming = sorted.filter((invite) => {
                if (!invite.event_date) return true;
                const time = new Date(`${invite.event_date}T${invite.event_time || '00:00'}`).getTime();
                return time >= now;
              });

              const renderInviteCard = (invite: any) => {
                const isSender = invite.sender_id === user?.id;
                const isRecipient = invite.recipient_id === user?.id;
                const status = (invite.status || 'pending').toLowerCase();
                const statusStyle = getInviteStatusStyle(status);
                const otherName = isSender ? invite.recipient?.name : invite.sender?.name;
                const title = otherName || 'Member';
                const dateLabel = invite.event_date
                  ? new Date(invite.event_date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'Date TBD';
                const timeLabel = invite.event_time
                  ? new Date(`2000-01-01T${invite.event_time}`).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })
                  : 'Time TBD';
                const activityLabel = invite.activity_name || 'Activity TBD';
                const locationLabel = invite.location?.trim() || null;
                const inviteMetaText = locationLabel
                  ? `${activityLabel} · ${locationLabel} · ${dateLabel} · ${timeLabel}`
                  : `${activityLabel} · ${dateLabel} · ${timeLabel}`;

                return (
                  <View key={invite.id} style={styles.inviteCard}>
                    <View style={styles.inviteHeaderRow}>
                      <Text style={styles.inviteTitle}>{title}</Text>
                      <View style={[styles.inviteStatusBadge, statusStyle.badge]}>
                        <Text style={[styles.inviteStatusText, statusStyle.text]}>
                          {status === 'pending' ? 'Pending' : status === 'accepted' ? 'Accepted' : 'Declined'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.inviteMeta} numberOfLines={2}>{inviteMetaText}</Text>

                    {status === 'pending' && isRecipient && (
                      <View style={styles.inviteActionsRow}>
                        <TouchableOpacity
                          style={styles.inviteAcceptButton}
                          onPress={() => handleInviteResponse(invite.id, 'accepted')}
                        >
                          <Text style={styles.inviteAcceptText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.inviteDeclineButton}
                          onPress={() => handleInviteResponse(invite.id, 'declined')}
                        >
                          <Text style={styles.inviteDeclineText}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              };

              return <View>{upcoming.map(renderInviteCard)}</View>;
            })()
          )}
        </View>


        <Modal
          visible={false}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <BlurView intensity={20} style={styles.infoOverlay}>
            <View style={styles.infoCard}>
              <View style={styles.infoCloseRow}>
                <TouchableOpacity
                  onPress={() => setShowReadyTodayInfo(false)}
                  style={styles.infoClose}
                >
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>
              <Text style={styles.infoBody}>
                Turn this on if you’re available to join this activity today. It helps others know you’re up for plans now.
              </Text>
              <TouchableOpacity
                style={styles.infoPrimaryButton}
                onPress={() => setShowReadyTodayInfo(false)}
              >
                <Text style={styles.infoPrimaryText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </Modal>

        <Modal
          visible={showEditNameModal}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setEditNameError(null);
            setShowEditNameModal(false);
          }}
        >
          <BlurView intensity={20} style={styles.infoOverlay}>
            <View style={styles.editNameCard}>
              <View style={styles.editNameHeaderRow}>
                <View style={styles.editNameHeaderLeft}>
                  <Ionicons name="pencil-outline" size={16} color="#FF8C42" />
                  <Text style={styles.editNameTitle}>Edit Name</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setEditNameError(null);
                    setShowEditNameModal(false);
                  }}
                  style={styles.infoClose}
                >
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>
              <LinearGradient
                colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.editNameDivider}
              />
              <Text style={styles.editNameSubtitle}>This is how your name appears to others.</Text>
              <TextInput
                style={styles.editNameInput}
                value={editNameValue}
                onChangeText={setEditNameValue}
                placeholder="Enter your name"
                placeholderTextColor="#999"
                maxLength={50}
                autoCapitalize="words"
              />
              {editNameError ? <Text style={styles.editNameError}>{editNameError}</Text> : null}
              <View style={styles.editNameActions}>
                <TouchableOpacity
                  style={styles.editNameCancel}
                  onPress={() => {
                    setEditNameError(null);
                    setShowEditNameModal(false);
                  }}
                >
                  <Text style={styles.editNameCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editNameSave, isSavingName && { opacity: 0.7 }]}
                  onPress={handleSaveName}
                  disabled={isSavingName}
                >
                  {isSavingName ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.editNameSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </BlurView>
        </Modal>

        <Modal
          visible={settingsModalVisible}
          transparent
          animationType="fade"
          presentationStyle="overFullScreen"
          onRequestClose={() => setSettingsModalVisible(false)}
        >
          <BlurView intensity={20} style={styles.settingsOverlay}>
            <View style={styles.settingsCard}>
              <View style={styles.settingsHeader}>
                {settingsScreen !== 'main' ? (
                  <TouchableOpacity
                    style={styles.settingsBack}
                    onPress={() => {
                      if (settingsScreen === 'blocked') {
                        setSettingsScreen('privacy');
                      } else {
                        setSettingsScreen('main');
                      }
                    }}
                  >
                    <Ionicons name="chevron-back" size={20} color="#666" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.settingsBackPlaceholder} />
                )}
                <Text style={styles.settingsTitle}>
                  {settingsScreen === 'main' && 'Settings'}
                  {settingsScreen === 'notifications' && 'Notifications'}
                  {settingsScreen === 'privacy' && 'Privacy & Safety'}
                  {settingsScreen === 'account' && 'Account'}
                  {settingsScreen === 'about' && 'About'}
                  {settingsScreen === 'terms' && 'Terms & Safety'}
                  {settingsScreen === 'blocked' && 'Blocked Users'}
                </Text>
                <TouchableOpacity
                  style={styles.settingsClose}
                  onPress={() => setSettingsModalVisible(false)}
                >
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>

              {settingsError && (
                <View style={styles.settingsBannerError}>
                  <Text style={styles.settingsBannerText}>{settingsError}</Text>
                </View>
              )}
              {settingsMessage && (
                <View style={styles.settingsBannerSuccess}>
                  <Text style={styles.settingsBannerText}>{settingsMessage}</Text>
                </View>
              )}

              <ScrollView
                style={styles.settingsContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {settingsScreen === 'main' && (
                  <View>
                    <TouchableOpacity style={styles.settingsNavRow} onPress={() => openSettingsScreen('notifications')}>
                      <Text style={styles.settingsNavTitle}>Notifications</Text>
                      <Text style={styles.settingsNavSubtitle}>Forum, Chat, Meet-up Reminders</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingsNavRow} onPress={() => openSettingsScreen('privacy')}>
                      <Text style={styles.settingsNavTitle}>Privacy & Safety</Text>
                      <Text style={styles.settingsNavSubtitle}>Visibility, Blocked Users, Reports</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingsNavRow} onPress={() => openSettingsScreen('account')}>
                      <Text style={styles.settingsNavTitle}>Account</Text>
                      <Text style={styles.settingsNavSubtitle}>Password, Email, Delete</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingsNavRow} onPress={() => openSettingsScreen('about')}>
                      <Text style={styles.settingsNavTitle}>About</Text>
                      <Text style={styles.settingsNavSubtitle}>Version, Support, Terms</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingsNavRow} onPress={() => openSettingsScreen('terms')}>
                      <Text style={styles.settingsNavTitle}>Terms & Safety</Text>
                      <Text style={styles.settingsNavSubtitle}>Guidelines & Policies</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.settingsNavRow, styles.logoutButton]} onPress={handleLogout}>
                      <Text style={styles.logoutButtonText}>Log out</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {settingsScreen === 'notifications' && (
                  <View>
                    <View style={styles.settingsToggleRow}>
                      <View style={styles.settingsToggleText}>
                        <Text style={styles.settingsToggleTitle}>System Notifications</Text>
                        <Text style={styles.settingsToggleSubtitle}>Enable notifications at the OS level</Text>
                      </View>
                      <View style={styles.settingsToggleSwitch}>
                        <Switch
                          value={notificationsEnabled}
                          onValueChange={handleSystemNotificationToggle}
                          trackColor={{ false: '#E0E0E0', true: '#FFCF56' }}
                          thumbColor={notificationsEnabled ? '#FF8C42' : '#F4F4F4'}
                        />
                      </View>
                    </View>

                    <View style={styles.settingsToggleRow}>
                      <View style={styles.settingsToggleText}>
                        <Text style={styles.settingsToggleTitle}>Forum Notifications</Text>
                        <Text style={styles.settingsToggleSubtitle}>Get alerts for forum posts</Text>
                      </View>
                      <View style={styles.settingsToggleSwitch}>
                        <Switch
                          value={notificationsEnabled && forumNotificationsEnabled}
                          onValueChange={(nextValue) =>
                            updateNotificationPreference('forum_notifications_enabled', nextValue, 'Forum notifications')
                          }
                          disabled={!notificationsEnabled}
                          trackColor={{ false: '#E0E0E0', true: '#FFCF56' }}
                          thumbColor={notificationsEnabled && forumNotificationsEnabled ? '#FF8C42' : '#F4F4F4'}
                        />
                      </View>
                    </View>

                    <View style={styles.settingsToggleRow}>
                      <View style={styles.settingsToggleText}>
                        <Text style={styles.settingsToggleTitle}>1-on-1 Chat Notifications</Text>
                        <Text style={styles.settingsToggleSubtitle}>Get alerts for direct messages</Text>
                      </View>
                      <View style={styles.settingsToggleSwitch}>
                        <Switch
                          value={notificationsEnabled && chatNotificationsEnabled}
                          onValueChange={(nextValue) =>
                            updateNotificationPreference('chat_notifications_enabled', nextValue, 'Chat notifications')
                          }
                          disabled={!notificationsEnabled}
                          trackColor={{ false: '#E0E0E0', true: '#FFCF56' }}
                          thumbColor={notificationsEnabled && chatNotificationsEnabled ? '#FF8C42' : '#F4F4F4'}
                        />
                      </View>
                    </View>

                    <View style={styles.settingsToggleRow}>
                      <View style={styles.settingsToggleText}>
                        <Text style={styles.settingsToggleTitle}>New Plan Notifications</Text>
                        <Text style={styles.settingsToggleSubtitle}>Get alerts for new activity plans</Text>
                      </View>
                      <View style={styles.settingsToggleSwitch}>
                        <Switch
                          value={notificationsEnabled && newEventNotificationsEnabled}
                          onValueChange={(nextValue) =>
                            updateNotificationPreference('new_event_notifications_enabled', nextValue, 'New plan notifications')
                          }
                          disabled={!notificationsEnabled}
                          trackColor={{ false: '#E0E0E0', true: '#FFCF56' }}
                          thumbColor={notificationsEnabled && newEventNotificationsEnabled ? '#FF8C42' : '#F4F4F4'}
                        />
                      </View>
                    </View>

                    {false && (
                    <View style={styles.settingsToggleRow}>
                      <View style={styles.settingsToggleText}>
                        <Text style={styles.settingsToggleTitle}>Active Today Notifications</Text>
                        <Text style={styles.settingsToggleSubtitle}>Get notified when someone is active today</Text>
                      </View>
                      <View style={styles.settingsToggleSwitch}>
                        <Switch
                          value={notificationsEnabled && readyTodayNotificationsEnabled}
                          onValueChange={(nextValue) =>
                            updateNotificationPreference('ready_today_notifications_enabled', nextValue, 'Active Today notifications')
                          }
                          disabled={!notificationsEnabled}
                          trackColor={{ false: '#E0E0E0', true: '#FFCF56' }}
                          thumbColor={notificationsEnabled && readyTodayNotificationsEnabled ? '#FF8C42' : '#F4F4F4'}
                        />
                      </View>
                    </View>
                    )}

                    <View style={styles.settingsToggleRow}>
                      <View style={styles.settingsToggleText}>
                        <Text style={styles.settingsToggleTitle}>Private Invite Notifications</Text>
                        <Text style={styles.settingsToggleSubtitle}>Get alerts for private meetup invites and reminders</Text>
                      </View>
                      <View style={styles.settingsToggleSwitch}>
                        <Switch
                          value={notificationsEnabled && privateInviteNotificationsEnabled}
                          onValueChange={(nextValue) =>
                            updateNotificationPreference('private_invite_notifications_enabled', nextValue, 'Private invite notifications')
                          }
                          disabled={!notificationsEnabled}
                          trackColor={{ false: '#E0E0E0', true: '#FFCF56' }}
                          thumbColor={notificationsEnabled && privateInviteNotificationsEnabled ? '#FF8C42' : '#F4F4F4'}
                        />
                      </View>
                    </View>

                    <View style={styles.settingsToggleRow}>
                      <View style={styles.settingsToggleText}>
                        <Text style={styles.settingsToggleTitle}>Plan Reminders</Text>
                        <Text style={styles.settingsToggleSubtitle}>Remind me 1 day and 1 hour before plans I joined</Text>
                      </View>
                      <View style={styles.settingsToggleSwitch}>
                        <Switch
                          value={notificationsEnabled && planReminderNotificationsEnabled}
                          onValueChange={(nextValue) =>
                            updateNotificationPreference('plan_reminder_notifications_enabled', nextValue, 'Plan reminders')
                          }
                          disabled={!notificationsEnabled}
                          trackColor={{ false: '#E0E0E0', true: '#FFCF56' }}
                          thumbColor={notificationsEnabled && planReminderNotificationsEnabled ? '#FF8C42' : '#F4F4F4'}
                        />
                      </View>
                    </View>
                  </View>
                )}


                {settingsScreen === 'privacy' && (
                  <View>
                    <View style={styles.settingsInfoCard}>
                      <Text style={styles.settingsInfoTitle}>Profile Visibility</Text>
                      <Text style={styles.settingsInfoBody}>
                        Visible to activity members only.
                      </Text>
                    </View>
                    <View style={styles.settingsInfoCard}>
                      <Text style={styles.settingsInfoTitle}>Location Sharing</Text>
                      <Text style={styles.settingsInfoBody}>
                        Approximate location is shared for meetups.
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.settingsNavRow} onPress={handleBlockedUsers}>
                      <Text style={styles.settingsNavTitle}>Blocked Users</Text>
                      <Text style={styles.settingsNavSubtitle}>
                        {blockedUsers.length > 0 ? `${blockedUsers.length} blocked` : 'None blocked'}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.settingsInfoCard}>
                      <Text style={styles.settingsInfoTitle}>Report Issues</Text>
                      <Text style={styles.settingsInfoBody}>
                        Contact: activityhubsercive@gmail.com
                      </Text>
                      <TouchableOpacity
                        style={styles.settingsPrimaryButton}
                        onPress={() => Linking.openURL('mailto:activityhubsercive@gmail.com')}
                      >
                        <Text style={styles.settingsPrimaryText}>Email Support</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {settingsScreen === 'blocked' && (
                  <View>
                    {blockedUsers.length === 0 ? (
                      <Text style={styles.settingsEmptyText}>You have no blocked users.</Text>
                    ) : (
                      blockedUsers.map((blockedUser: any) => (
                        <View key={blockedUser.id} style={styles.blockedRow}>
                          <CachedImage
                            source={blockedUser.avatar_url ? { uri: blockedUser.avatar_url } : ICONS.profileIcon}
                            style={styles.blockedAvatar}
                          />
                          <Text style={styles.blockedName}>{blockedUser.name}</Text>
                          <TouchableOpacity
                            style={styles.blockedButton}
                            onPress={() =>
                              Alert.alert(`Unblock ${blockedUser.name}?`, undefined, [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Unblock',
                                  onPress: () => {
                                    void performUnblockUser(blockedUser);
                                  },
                                },
                              ])
                            }
                          >
                            <Text style={styles.blockedButtonText}>Unblock</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {settingsScreen === 'account' && (
                  <View>
                    <View style={styles.settingsInfoCard}>
                      <Text style={styles.settingsInfoTitle}>Change Password</Text>
                      <Text style={styles.settingsInfoBody}>
                        Set a new password while signed in, or use a reset link sent to your email.
                      </Text>
                      <Text style={styles.settingsFieldLabel}>New password</Text>
                      <View style={styles.settingsPasswordRow}>
                        <TextInput
                          style={styles.settingsFieldInput}
                          value={newPassword}
                          onChangeText={setNewPassword}
                          placeholder="At least 6 characters"
                          secureTextEntry={!showNewPassword}
                          autoCapitalize="none"
                          autoCorrect={false}
                          textContentType="newPassword"
                        />
                        <TouchableOpacity
                          style={styles.settingsPasswordToggle}
                          onPress={() => setShowNewPassword((v) => !v)}
                          accessibilityLabel={showNewPassword ? 'Hide password' : 'Show password'}
                        >
                          <Ionicons
                            name={showNewPassword ? 'eye-off' : 'eye'}
                            size={20}
                            color="rgba(102,102,102,0.5)"
                          />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.settingsFieldLabel}>Confirm new password</Text>
                      <View style={styles.settingsPasswordRow}>
                        <TextInput
                          style={styles.settingsFieldInput}
                          value={confirmNewPassword}
                          onChangeText={setConfirmNewPassword}
                          placeholder="Re-enter password"
                          secureTextEntry={!showConfirmNewPassword}
                          autoCapitalize="none"
                          autoCorrect={false}
                          textContentType="newPassword"
                        />
                        <TouchableOpacity
                          style={styles.settingsPasswordToggle}
                          onPress={() => setShowConfirmNewPassword((v) => !v)}
                          accessibilityLabel={
                            showConfirmNewPassword ? 'Hide password' : 'Show password'
                          }
                        >
                          <Ionicons
                            name={showConfirmNewPassword ? 'eye-off' : 'eye'}
                            size={20}
                            color="rgba(102,102,102,0.5)"
                          />
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.settingsPrimaryButton,
                          updatingPassword && { opacity: 0.7 },
                        ]}
                        onPress={() => void handleChangePassword()}
                        disabled={updatingPassword}
                      >
                        {updatingPassword ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.settingsPrimaryText}>Update Password</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.settingsSecondaryButton, sendingResetLink && { opacity: 0.7 }]}
                        onPress={() => void handleSendPasswordResetLink()}
                        disabled={sendingResetLink || !accountEmail}
                      >
                        {sendingResetLink ? (
                          <ActivityIndicator size="small" color="#FF8C42" />
                        ) : (
                          <Text style={styles.settingsSecondaryText}>Email reset link instead</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                    <View style={styles.settingsInfoCard}>
                      <Text style={styles.settingsInfoTitle}>Update Email</Text>
                      <Text style={styles.settingsInfoBody}>
                        Current: {accountEmail || '—'}
                      </Text>
                      <Text style={styles.settingsFieldLabel}>New email address</Text>
                      <TextInput
                        style={styles.settingsFieldInput}
                        value={newEmailInput}
                        onChangeText={setNewEmailInput}
                        placeholder="you@example.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        textContentType="emailAddress"
                      />
                      <Text style={styles.settingsInfoBody}>
                        Your sign-in email updates right away. Use this address the next time you log in.
                      </Text>
                      <TouchableOpacity
                        style={[styles.settingsPrimaryButton, updatingEmail && { opacity: 0.7 }]}
                        onPress={() => void handleChangeEmail()}
                        disabled={updatingEmail}
                      >
                        {updatingEmail ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.settingsPrimaryText}>Update Email</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                    <View style={styles.settingsInfoCard}>
                      <Text style={styles.settingsInfoTitle}>Delete Account</Text>
                      <Text style={styles.settingsInfoBody}>
                        Permanently delete your account and associated data. You stay signed in until
                        you confirm deletion; no email or support contact is required.
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.settingsPrimaryButton,
                          styles.settingsDangerButton,
                          deletingAccount && { opacity: 0.7 },
                        ]}
                        onPress={handleDeleteAccountPress}
                        disabled={deletingAccount}
                      >
                        {deletingAccount ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.settingsPrimaryText}>Delete My Account</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {settingsScreen === 'about' && (
                  <View style={styles.settingsInfoCard}>
                    <Text style={styles.settingsInfoTitle}>The Activity Hub</Text>
                    <Text style={styles.settingsInfoBody}>
                      Connect with people who share your interests and activity levels.
                    </Text>
                    <Text style={styles.settingsInfoBody}>
                      Version: {version} • Build: {buildNumber}
                    </Text>
                    <Text style={styles.settingsInfoBody}>
                      Support: activityhubsercive@gmail.com
                    </Text>
                <TouchableOpacity
                  style={styles.settingsPrimaryButton}
                  onPress={handleCheckForUpdates}
                >
                  <Text style={styles.settingsPrimaryText}>Check for Updates</Text>
                </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.settingsPrimaryButton}
                      onPress={() => openSettingsScreen('terms')}
                    >
                      <Text style={styles.settingsPrimaryText}>View Terms & Safety</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {settingsScreen === 'terms' && (
                  <View style={styles.settingsInfoCard}>
                    <Text style={styles.settingsInfoTitle}>Terms & Safety</Text>
                    <Text style={styles.settingsInfoBody}>
                      By using The Activity Hub, you agree to our community guidelines and terms.
                    </Text>
                    <Text style={styles.settingsInfoBody}>
                      Zero tolerance for abusive or inappropriate behavior. Violations may result in account suspension.
                    </Text>
                    <Text style={styles.settingsInfoBody}>
                      Meet in public places for first-time meetups and prioritize your safety.
                    </Text>
                    <TouchableOpacity
                      style={styles.settingsPrimaryButton}
                      onPress={() => Linking.openURL('https://bluefodor88.github.io')}
                    >
                      <Text style={styles.settingsPrimaryText}>Open Full Policy</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
              {showSystemSettingsPrompt && (
                <View style={styles.inlinePromptOverlay}>
                  <View style={styles.inlinePromptCard}>
                    <Text style={styles.inlinePromptTitle}>Manage Notifications</Text>
                    <Text style={styles.inlinePromptBody}>
                      {systemToggleTarget === 'off'
                        ? 'To turn notifications off, open The Activity Hub settings and disable notifications there.'
                        : 'To turn notifications on, open The Activity Hub settings and enable notifications there.'}
                    </Text>
                    <View style={styles.inlinePromptActions}>
                      <TouchableOpacity
                        style={styles.inlinePromptCancel}
                        onPress={() => {
                          setShowSystemSettingsPrompt(false);
                          setSystemToggleTarget(null);
                        }}
                      >
                        <Text style={styles.inlinePromptCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.inlinePromptGo}
                        onPress={async () => {
                          setShowSystemSettingsPrompt(false);
                          await openAppNotificationSettings();
                          setSystemToggleTarget(null);
                        }}
                      >
                        <Text style={styles.inlinePromptGoText}>Go</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </BlurView>
        </Modal>
      </ScrollView>
      <Modal
        visible={!!confirmConfig}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setConfirmConfig(null)}
      >
        <BlurView intensity={20} style={styles.settingsOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{confirmConfig?.title}</Text>
            <Text style={styles.confirmBody}>{confirmConfig?.body}</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancel}
                onPress={() => setConfirmConfig(null)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmConfirm,
                  confirmConfig?.destructive && styles.confirmConfirmDanger,
                ]}
                onPress={async () => {
                  const action = confirmConfig;
                  setConfirmConfig(null);
                  if (action) {
                    try {
                      await action.onConfirm();
                    } catch (e) {
                      console.error('Confirm action failed:', e);
                      setSettingsError('Something went wrong. Please try again.');
                    }
                  }
                }}
              >
                <Text style={styles.confirmConfirmText}>{confirmConfig?.confirmText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>
      {/* Skill Level Edit Modal */}
      <Modal
        visible={!!editingSkill}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingSkill(null)}
      >
        <TouchableOpacity
          style={styles.skillEditOverlay}
          activeOpacity={1}
          onPress={() => setEditingSkill(null)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.skillEditCard}>
              <Text style={styles.skillEditTitle}>Adjust Skill Level</Text>
              <Text style={styles.skillEditSubtitle}>Tap a level to update</Text>
              {(['Beginner', 'Intermediate', 'Advanced'] as const).map((lvl) => {
                const color = lvl === 'Beginner' ? '#4CAF50' : lvl === 'Intermediate' ? '#FFCF56' : '#FF8C42';
                const isSelected = editingSkill?.current === lvl;
                return (
                  <TouchableOpacity
                    key={lvl}
                    style={[styles.skillEditOption, isSelected && { borderColor: color, borderWidth: 2 }]}
                    onPress={() => {
                      if (editingSkill) {
                        updateSkillLevel(editingSkill.activityId, lvl);
                        setEditingSkill(null);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.skillEditDot, { backgroundColor: color }]} />
                    <Text style={[styles.skillEditOptionText, isSelected && { color, fontFamily: 'Inter_700Bold' }]}>{lvl}</Text>
                    {isSelected && <Ionicons name="checkmark" size={16} color={color} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={styles.skillEditCancel} onPress={() => setEditingSkill(null)}>
                <Text style={styles.skillEditCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={photoZoomVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoZoomVisible(false)}
      >
        <TouchableOpacity
          style={styles.photoZoomOverlay}
          activeOpacity={1}
          onPress={() => setPhotoZoomVisible(false)}
        >
          {profile?.avatar_url ? (
            <CachedImage source={{ uri: profile.avatar_url }} style={styles.photoZoomImage} resizeMode="contain" />
          ) : null}
        </TouchableOpacity>
      </Modal>
      <CommunityBuilderCelebration
        visible={showCommunityBuilderCelebration}
        onDismiss={() => setShowCommunityBuilderCelebration(false)}
        name={profile?.name || 'You'}
      />
      <CommunityBuilderExpired
        visible={showCommunityBuilderExpired}
        onDismiss={() => setShowCommunityBuilderExpired(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eaecee',
    overflow: 'visible',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
  },
  profileTopWrap: {
    position: 'relative',
  },
  backBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
  },
  backBarText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  topBarGearAbsolute: {
    position: 'absolute',
    top: Platform.select({ ios: -4, android: -4, default: -4 }),
    right: 0,
    zIndex: 10,
    padding: 4,
  },
  topBarGear: {
    padding: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  imageContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  uploadingOverlay: {
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FFCF56',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  name: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editNameButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F3F3F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
  },
  email: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  photoZoomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  photoZoomImage: {
    width: '100%',
    height: '80%',
  },
  communityBuilderBlock: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
    gap: 6,
  },
  communityBuilderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8EC',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FDDFA0',
    gap: 6,
  },
  communityBuilderText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#C47F00',
  },
  communityBuilderSubtext: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 16,
    marginHorizontal: 20,
    gap: 10,
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  statNumber: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: '#222',
    lineHeight: 30,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#888',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#e0e0e0',
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
  section: {
    backgroundColor: 'white',
    borderRadius: 16,
    borderTopWidth: 4,
    borderTopColor: '#FFCF56',
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
    transform: [{ scale: 1 }],
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 16,
  },
  sectionTitleInline: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 0,
    flex: 1,
    flexShrink: 1,
  },
  myActivityRow: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  myActivityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  myActivityEmoji: {
    fontSize: 22,
    marginRight: 8,
  },
  myActivityName: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
  },
  readyTodayToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Platform.OS === 'android' ? 6 : 4,
  },
  readyTodayToggleLabel: {
    fontSize: Platform.OS === 'android' ? 13 : 12,
    fontFamily: 'Inter_500Medium',
    color: '#aaa',
  },
  readyTodayToggleLabelActive: {
    color: '#FF8C42',
  },
  skillLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#f8f8f8',
    marginLeft: 8,
  },
  skillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  skillLevelText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  skillEditOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skillEditCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  skillEditTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#222',
    textAlign: 'center',
    marginBottom: 4,
  },
  skillEditSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 20,
  },
  skillEditOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  skillEditDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  skillEditOptionText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: '#444',
  },
  skillEditCancel: {
    marginTop: 6,
    alignItems: 'center',
    paddingVertical: 10,
  },
  skillEditCancelText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#aaa',
  },
  sectionTitleInlineCompact: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  sectionHeaderRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitleInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  sectionInfoButton: {
    padding: 0,
  },
  infoOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  infoCloseRow: {
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  infoClose: {
    padding: 4,
  },
  infoBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#555',
    lineHeight: 20,
    marginHorizontal: 5,
    marginBottom: 16,
  },
  infoPrimaryButton: {
    alignSelf: 'center',
    backgroundColor: '#FF8C42',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  infoPrimaryText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
  },
  editNameTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  editNameCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  editNameHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  editNameHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editNameDivider: {
    height: 3,
    borderRadius: 2,
    marginBottom: 10,
  },
  editNameSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 10,
  },
  editNameInput: {
    borderWidth: 1,
    borderColor: '#E9E9E9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    marginBottom: 14,
  },
  editNameError: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#C0392B',
    marginBottom: 10,
    textAlign: 'left',
  },
  editNameActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  editNameCancel: {
    backgroundColor: '#F4F4F4',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editNameCancelText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  editNameSave: {
    backgroundColor: '#FF8C42',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editNameSaveText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  activitiesDivider: {
    height: 3,
    borderRadius: 2,
    marginBottom: 10,
  },
  activitiesDividerTight: {
    marginBottom: 4,
  },
  communityAddRemoveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 8,
  },
  communityMinusBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 48,
  },
  communityPlusBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 48,
  },
  communityBtnLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
    marginTop: 2,
  },
  communityBtnDisabled: {
    opacity: 0.6,
  },
  communityBtnLabelDisabled: {
    color: '#999',
  },
  communityStripScroll: {
    flex: 1,
    minWidth: 0,
  },
  communityStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  communityStripEmpty: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#888',
    paddingVertical: 8,
  },
  communityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    gap: 6,
  },
  communityPillSelected: {
    backgroundColor: '#FFE8D6',
    borderWidth: 1,
    borderColor: '#FF8C42',
  },
  communityPillEmoji: {
    fontSize: 16,
  },
  communityPillName: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#333',
    maxWidth: 100,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF8C42',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  addButtonText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
  },
  emptyStateContainer: {
    alignItems: 'flex-start',
    paddingTop: 2,
    paddingBottom: 0,
  },
  addFirstButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF8C42',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 16,
    gap: 8,
  },
  addFirstButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
  },
  communityList: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    overflow: 'hidden',
  },
  communityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 8,
  },
  communityRowEmoji: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
  },
  communityRowName: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#333',
  },
  communityRowLevel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    minWidth: 72,
    textAlign: 'right',
  },
  communityRowRemove: {
    padding: 4,
  },
  communityRowLast: {
    borderBottomWidth: 0,
  },
  skillItemContainer: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    borderRadius: 12,
    paddingTop: 24,
    paddingBottom: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    position: 'relative',
  },
  skillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  skillItemActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ececec',
  },
  readyTodayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
    gap: 10,
    marginRight: 12,
  },
  readyTodayLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  readyTodayLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#555',
  },
  readyTodayInfo: {
    padding: 2,
  },
  skillInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activityName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginRight: 12,
    flex: 1,
  },
  activityEmoji: {
    fontSize: 32,
  },
  skillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  skillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  skillText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  removeIconButton: {
    position: 'absolute',
    top: 6,
    left: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    marginLeft: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1EEE9',
  },
  settingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF3E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingIconDanger: {
    backgroundColor: '#FFE9E9',
  },
  settingTextBlock: {
    flex: 1,
    marginLeft: 12,
  },
  settingTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  settingTitleDanger: {
    color: '#D84A4A',
  },
  settingSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#7A7A7A',
    marginTop: 2,
  },
  invitesEmptyText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#777',
    textAlign: 'center',
    marginTop: 10,
  },
  inviteCard: {
    backgroundColor: '#FFFDF9',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F4E5C9',
    marginBottom: 10,
  },
  inviteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  inviteTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  inviteStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  inviteStatusText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  inviteMeta: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 4,
  },
  inviteActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  inviteAcceptButton: {
    flex: 1,
    backgroundColor: '#FF8C42',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  inviteAcceptText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  inviteDeclineButton: {
    flex: 1,
    backgroundColor: '#F2F2F2',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  inviteDeclineText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#666',
  },
  eventsJoinedList: {
    marginTop: 8,
  },
  eventJoinedCard: {
    position: 'relative',
    backgroundColor: '#FFFDF9',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F4E5C9',
    marginBottom: 10,
  },
  eventJoinedSkillTopRight: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 2,
  },
  eventJoinedSkillBubble: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    maxWidth: 112,
  },
  eventJoinedSkillBubbleText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 1,
  },
  eventJoinedCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  eventJoinedLocationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  eventJoinedActivityEmoji: {
    fontSize: 16,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  eventJoinedPlanTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 2,
  },
  eventJoinedPlanTitleWithSkillCorner: { paddingRight: 102 },
  eventJoinedLocation: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#555',
    lineHeight: 18,
  },
  eventJoinedDateTime: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 4,
  },
  eventJoinedCreatorRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  eventJoinedCreatorLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  eventJoinedCreatorLink: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#FF8C42',
  },
  eventJoinedNote: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginTop: 6,
    marginBottom: 6,
  },
  invitesPastSection: {
    marginTop: 8,
  },
  invitesPastTitle: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#8A8A8A',
    marginBottom: 6,
  },
  invitesPastPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  invitePastRow: {
    backgroundColor: '#FFF3E8',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#FFE2CC',
  },
  invitePastText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#A35B2A',
  },
  settingsOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  settingsCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 16,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  settingsTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  settingsBack: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBackPlaceholder: {
    width: 32,
    height: 32,
  },
  settingsClose: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsContent: {
    marginTop: 6,
  },
  settingsBannerError: {
    backgroundColor: '#FFE8E8',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  settingsBannerSuccess: {
    backgroundColor: '#E7F6EA',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  settingsBannerText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    textAlign: 'center',
  },
  settingsNavRow: {
    backgroundColor: '#FFF7EE',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  settingsNavTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  settingsNavSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#777',
    marginTop: 4,
  },
  settingsInfoCard: {
    backgroundColor: '#FFFDF9',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F4E5C9',
    marginBottom: 12,
  },
  settingsInfoTitle: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 6,
  },
  settingsInfoBody: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 4,
  },
  settingsFieldLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginBottom: 6,
    marginTop: 4,
  },
  settingsFieldInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E9E9E9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    marginBottom: 10,
    backgroundColor: '#FAFAFA',
  },
  settingsPasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  settingsPasswordToggle: {
    padding: 10,
    marginLeft: 4,
    marginBottom: 10,
  },
  settingsSecondaryButton: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  settingsSecondaryText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  settingsPrimaryButton: {
    backgroundColor: '#FF8C42',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  settingsDangerButton: {
    backgroundColor: '#E45858',
  },
  settingsPrimaryText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  settingsToggleRow: {
    backgroundColor: '#FFFDF9',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F4E5C9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  settingsToggleText: {
    flex: 1,
    marginRight: 10,
  },
  settingsToggleSwitch: {
    paddingRight: 6,
  },
  settingsToggleTitle: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  settingsToggleSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#777',
    marginTop: 4,
  },
  settingsButtonGroup: {},
  settingsPrimaryButtonStack: {
    marginBottom: 10,
  },
  logoutButton: {
    marginTop: 12,
    backgroundColor: '#FFF1F1',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: '#F6CACA',
  },
  logoutButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#D84A4A',
  },
  settingsEmptyText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#777',
    textAlign: 'center',
    marginTop: 12,
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7EE',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  blockedAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 10,
  },
  blockedName: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
  },
  blockedButton: {
    backgroundColor: '#FFE8E0',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  blockedButtonText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#C4462E',
  },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
  },
  confirmTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 6,
  },
  confirmBody: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 16,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  confirmCancel: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
  },
  confirmCancelText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#555',
  },
  confirmConfirm: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FF8C42',
  },
  confirmConfirmDanger: {
    backgroundColor: '#D84A4A',
  },
  confirmConfirmText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  inlinePromptOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  inlinePromptCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
  },
  inlinePromptTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 6,
    textAlign: 'center',
  },
  inlinePromptBody: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  inlinePromptActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  inlinePromptCancel: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
  },
  inlinePromptCancelText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#555',
  },
  inlinePromptGo: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#FF8C42',
  },
  inlinePromptGoText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  noActivitiesText: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingTop: 2,
    paddingBottom: 2,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  infoBodyBold: {
    fontFamily: 'Inter_700Bold',
    color: '#555',
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
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
  guestBrowseIntro: {
    alignItems: 'center',
    marginBottom: 8,
  },
  guestLoginButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  guestCreateAccountLink: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  guestCreateAccountLinkText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  sectionSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 16,
  },
});
