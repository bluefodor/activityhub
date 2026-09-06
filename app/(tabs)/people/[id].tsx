import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { ICONS } from '@/lib/helperUtils';
import { CachedImage } from '@/components/CachedImage';
import { useAuth } from '@/hooks/useAuth';
import { calculateDistance, formatDistance, getCurrentLocation } from '@/lib/locationUtils';
import { requireAuth } from '@/lib/authHelpers';
import {
  formatPlanDisplayDateConcise,
  formatPlanTime12hShort,
  isPlanDayPast,
} from '@/lib/planDateTime';
import { getPlanSkillLevelColor, parsePlanSkillLevel } from '@/lib/planSkillLevel';
import { appCalendarDateKey } from '@/lib/appCalendarDate';
import { getMostRecentPlanDate, isCommunityBuilderStatus } from '@/lib/communityBuilder';

type ActivityItem = {
  id: string;
  name: string;
  emoji: string | null;
  skill_level: string;
};

export default function PersonDetailsScreen() {
  const { id, name, from, fromChatUserId, fromChatName } = useLocalSearchParams<{
    id: string;
    name?: string;
    from?: string;
    fromChatUserId?: string;
    fromChatName?: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [profileEvents, setProfileEvents] = useState<any[]>([]);
  const [profileEventsLoading, setProfileEventsLoading] = useState(false);
  const [joiningPlanId, setJoiningPlanId] = useState<string | null>(null);
  const [distanceFromUser, setDistanceFromUser] = useState<string | null>(null);
  const [planStats, setPlanStats] = useState<{ created: number; joined: number; lastCreatedAt: string | null } | null>(null);
  const [planCreatedDates, setPlanCreatedDates] = useState<string[]>([]);
  const { user } = useAuth();
  const [safetyAction, setSafetyAction] = useState<'report' | 'block' | null>(null);
  const [photoZoomVisible, setPhotoZoomVisible] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch profile (include location for distance when sharing enabled)
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, name, avatar_url, latitude, longitude, location_sharing_enabled')
          .eq('id', id)
          .maybeSingle();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
        } else {
          setProfile(profileData);
          // Compute distance from current user when profile shares location
          if (profileData?.location_sharing_enabled && profileData?.latitude != null && profileData?.longitude != null) {
            const currentLoc = await Promise.race([
              getCurrentLocation(),
              new Promise<{ latitude: number; longitude: number } | null>((r) => setTimeout(() => r(null), 6000)),
            ]);
            if (currentLoc) {
              const miles = calculateDistance(currentLoc, {
                latitude: profileData.latitude,
                longitude: profileData.longitude,
              });
              setDistanceFromUser(formatDistance(miles));
            } else {
              setDistanceFromUser(null);
            }
          } else {
            setDistanceFromUser(null);
          }
        }

        // Fetch plan stats — split joined query so a failure doesn't block the badge
        const { data: planRows, error: plansErr } = await supabase
          .from('activity_plans')
          .select('created_at')
          .eq('creator_id', id)
          .order('created_at', { ascending: false });
        if (plansErr) console.error('Plan dates error:', plansErr);

        const createdAts = (planRows ?? [])
          .map((row) => row.created_at)
          .filter((value): value is string => !!value);

        let plansJoined = 0;
        try {
          const { count: joined } = await supabase
            .from('plan_joins')
            .select('plan_id, activity_plans!inner(creator_id)', { count: 'exact', head: true })
            .eq('user_id', id)
            .neq('activity_plans.creator_id', id);
          plansJoined = joined ?? 0;
        } catch (joinErr) {
          console.error('Plan joined count error:', joinErr);
        }
        setPlanCreatedDates(createdAts);
        setPlanStats({
          created: createdAts.length,
          joined: plansJoined,
          lastCreatedAt: getMostRecentPlanDate(createdAts),
        });

        // Fetch activities for this user
        const { data: skillsData, error: skillsError } = await supabase
          .from('user_activity_skills')
          .select(`
            id,
            activity_id,
            skill_level,
            activities (
              name,
              emoji
            )
          `)
          .eq('user_id', id);

        if (skillsError) {
          console.error('Error fetching user activities:', skillsError);
          setActivities([]);
        } else {
          const mapped: ActivityItem[] =
            (skillsData || [])
              .filter((item: any) => item.activities)
              .map((item: any) => ({
                id: item.id,
                name: item.activities.name,
                emoji: item.activities.emoji || null,
                skill_level: item.skill_level ?? 'Beginner',
              }))
              .sort((a, b) => a.name.localeCompare(b.name));

          setActivities(mapped);
        }

        setProfileEventsLoading(true);
        const today = appCalendarDateKey();
        const { data: plansData, error: plansError } = await supabase
          .from('activity_plans')
          .select(`
            id,
            title,
            location,
            event_date,
            event_time,
            note,
            skill_level,
            image_url,
            activities!activity_plans_activity_id_fkey (name, emoji)
          `)
          .eq('creator_id', id)
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .order('event_time', { ascending: true });

        if (plansError) {
          console.error('Error fetching profile events:', plansError);
          setProfileEvents([]);
        } else {
          const planIds = (plansData || []).map((p: any) => p.id);
          if (planIds.length === 0) {
            setProfileEvents(
              (plansData || [])
                .map((p: any) => ({
                  ...p,
                  title: p.title ?? '',
                  skill_level: p.skill_level ?? null,
                  image_url: p.image_url ?? null,
                  activity_name: p.activities?.name ?? 'Activity',
                  activity_emoji: p.activities?.emoji ?? '📌',
                  join_count: 0,
                  current_user_joined: false,
                }))
                .filter((plan: any) => !isPlanDayPast(plan.event_date))
            );
          } else {
            const { data: joinsData } = await supabase
              .from('plan_joins')
              .select('plan_id, user_id')
              .in('plan_id', planIds);
            const joinsByPlan: Record<string, { count: number; userIds: string[] }> = {};
            (joinsData || []).forEach((j: { plan_id: string; user_id: string }) => {
              if (!joinsByPlan[j.plan_id]) joinsByPlan[j.plan_id] = { count: 0, userIds: [] };
              joinsByPlan[j.plan_id].count += 1;
              joinsByPlan[j.plan_id].userIds.push(j.user_id);
            });
            setProfileEvents(
              (plansData || []).map((p: any) => {
                const joins = joinsByPlan[p.id] ?? { count: 0, userIds: [] };
                return {
                  id: p.id,
                  title: p.title ?? '',
                  location: p.location,
                  event_date: p.event_date,
                  event_time: p.event_time,
                  note: p.note ?? null,
                  skill_level: p.skill_level ?? null,
                  image_url: p.image_url ?? null,
                  activity_name: p.activities?.name ?? 'Activity',
                  activity_emoji: p.activities?.emoji ?? '📌',
                  join_count: joins.count,
                  current_user_joined: user ? joins.userIds.includes(user.id) : false,
                };
              }).filter((plan: any) => !isPlanDayPast(plan.event_date))
            );
          }
        }
        setProfileEventsLoading(false);
      } catch (error) {
        console.error('Unexpected error fetching person details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, user?.id]);

  const displayName = profile?.name || name || 'ActivityHub member';

  const isCommunityBuilder = isCommunityBuilderStatus(planCreatedDates);

  const openChat = () => {
    if (!user) {
      requireAuth('message users');
      return;
    }

    router.push({
      pathname: '/(tabs)/chats/[id]',
      params: { id: id as string, name: displayName },
    });
  };

  const performReportUser = () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to report users.');
      return;
    }
    const userId = id;
    const userName = displayName || 'User';

    const email = 'activityhubsercive@gmail.com';
    const subject = encodeURIComponent(`Report User - ${userId}`);
    const body = encodeURIComponent(
      `I would like to report user ${userName} (ID: ${userId}) for the following reason:\n\n`
    );
    const mailtoLink = `mailto:${email}?subject=${subject}&body=${body}`;
    Linking.canOpenURL(mailtoLink).then(supported => {
      if (supported) {
        Linking.openURL(mailtoLink);
      } else {
        Alert.alert(
          'Error',
          `Please email ${email} with subject: "Report User - ${userId}"`
        );
      }
    });
  };

  const performBlockUser = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to block users.');
      return;
    }
    const raw = id;
    const userId = Array.isArray(raw) ? raw[0] : raw;
    if (!userId || typeof userId !== 'string') {
      Alert.alert('Error', 'Invalid profile — could not block.');
      return;
    }
    const blockedTargetId = userId.trim();
    const userName = displayName || 'User';

    try {
      const { error } = await supabase
        .from('blocked_users')
        .upsert(
          {
            user_id: user.id,
            blocked_user_id: blockedTargetId,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,blocked_user_id' }
        );

      if (error) {
        console.error('Error blocking user:', error);
        Alert.alert('Error', 'Failed to block user. Please try again.');
      } else {
        Alert.alert('User Blocked', `${userName} has been blocked.`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error('Error blocking user:', error);
      Alert.alert('Error', 'Failed to block user. Please try again.');
    }
  };

  const handleJoinPlan = async (planId: string) => {
    if (!user?.id) return;
    setJoiningPlanId(planId);
    try {
      const plan = profileEvents.find((p) => p.id === planId);
      if (plan?.current_user_joined) {
        await supabase.from('plan_joins').delete().eq('plan_id', planId).eq('user_id', user.id);
        setProfileEvents((prev) =>
          prev.map((p) =>
            p.id === planId
              ? { ...p, join_count: p.join_count - 1, current_user_joined: false }
              : p
          )
        );
      } else {
        await supabase.from('plan_joins').insert({ plan_id: planId, user_id: user.id });
        setProfileEvents((prev) =>
          prev.map((p) =>
            p.id === planId ? { ...p, join_count: p.join_count + 1, current_user_joined: true } : p
          )
        );
      }
    } catch (e) {
      console.error('Join plan error:', e);
    } finally {
      setJoiningPlanId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (from === 'chat' && fromChatUserId) {
              router.push({
                pathname: '/chats/[id]',
                params: { id: fromChatUserId, name: fromChatName || name || '' },
              });
              return;
            }
            if (from === 'people') {
              router.push('/(tabs)/people');
              return;
            }
            if (from === 'forum') {
              router.push('/(tabs)/forum');
              return;
            }
            router.back();
          }}
        >
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF8C42" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileCard}>
            <TouchableOpacity
              style={styles.avatarWrapper}
              activeOpacity={0.9}
              onPress={() => {
                if (profile?.avatar_url) setPhotoZoomVisible(true);
              }}
            >
              <CachedImage
                source={
                  profile?.avatar_url
                    ? { uri: profile.avatar_url }
                    : ICONS.profileIcon
                }
                style={styles.avatarLarge}
              />
              {isCommunityBuilder && (
                <View style={styles.communityStarBadge}>
                  <Ionicons name="star" size={18} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.name}>{displayName}</Text>
            {isCommunityBuilder && (
              <View style={styles.communityBuilderBlock}>
                <View style={styles.communityBuilderPill}>
                  <Ionicons name="star" size={16} color="#F5A623" />
                  <Text style={styles.communityBuilderText}>Community Builder</Text>
                </View>
                <Text style={styles.communityBuilderSubtext}>
                  {displayName} creates plans that bring people together
                </Text>
              </View>
            )}
            {distanceFromUser != null && (
              <Text style={styles.distanceText}>{distanceFromUser} away</Text>
            )}
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
            <TouchableOpacity style={styles.messageButton} onPress={openChat}>
              <Ionicons name="chatbubble" size={18} color="#fff" />
              <Text style={styles.messageButtonText}>Message</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.section, styles.sectionGap]}>
            <Text style={styles.sectionTitle}>Activities</Text>
            <LinearGradient
              colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sectionDivider}
            />
            {activities.length === 0 ? (
              <Text style={styles.emptyText}>
                No activities selected yet.
              </Text>
            ) : (
              activities.map((activity, index) => (
                <View
                  key={activity.id}
                  style={[
                    styles.activityRow,
                    index === activities.length - 1 && styles.activityRowLast,
                  ]}
                >
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityEmoji}>
                      {activity.emoji || '🏃'}
                    </Text>
                    <View style={styles.activityTextContainer}>
                      <Text style={styles.activityName}>{activity.name}</Text>
                      <View style={styles.badgeRow}>
                        <View style={[styles.skillDot, getSkillBadgeStyle(activity.skill_level)]} />
                        <Text style={styles.skillLevelText}>
                          {formatSkillLevel(activity.skill_level)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={[styles.section, styles.sectionGap]}>
            <Text style={styles.sectionTitle}>Plans</Text>
            <LinearGradient
              colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sectionDivider}
            />
            {profileEventsLoading ? (
              <ActivityIndicator size="small" color="#FF8C42" style={{ marginTop: 12 }} />
            ) : profileEvents.length === 0 ? (
              <Text style={styles.emptyText}>No upcoming plans.</Text>
            ) : (
              <View style={styles.profileEventsList}>
                {profileEvents.map((evt: any) => {
                  const dateLabel = evt.event_date ? formatPlanDisplayDateConcise(evt.event_date) : '';
                  const timeLabel = evt.event_time ? formatPlanTime12hShort(evt.event_time) : '';
                  const titleText = evt.title?.trim() ? evt.title : 'Meetup';
                  const planSkill = parsePlanSkillLevel(evt.skill_level);
                  return (
                    <View key={evt.id} style={styles.profileEventCard}>
                      {planSkill ? (
                        <View style={styles.profileEventSkillTopRight} pointerEvents="none">
                          <View
                            style={[
                              styles.profileEventSkillBubble,
                              { backgroundColor: getPlanSkillLevelColor(planSkill) },
                            ]}
                          >
                            <Text style={styles.profileEventSkillBubbleText}>{planSkill}</Text>
                          </View>
                        </View>
                      ) : null}
                      <Text
                        style={[styles.profileEventTitle, planSkill ? styles.profileEventTitleWithSkillCorner : null]}
                      >
                        {titleText}
                      </Text>
                      <Text style={styles.profileEventLocation}>{evt.location}</Text>
                      {evt.image_url ? (
                        <CachedImage
                          source={{ uri: evt.image_url }}
                          style={styles.profileEventImage}
                          recyclingKey={evt.id}
                        />
                      ) : null}
                      <Text style={styles.profileEventDateTime}>
                        📅 {dateLabel} at {timeLabel}
                      </Text>
                      {evt.note ? <Text style={styles.profileEventNote}>{evt.note}</Text> : null}
                      <View style={styles.profileEventFooter}>
                        <TouchableOpacity
                          style={[
                            styles.profileEventJoinButton,
                            evt.current_user_joined && styles.profileEventJoinButtonJoined,
                          ]}
                          onPress={() => handleJoinPlan(evt.id)}
                          disabled={joiningPlanId === evt.id}
                        >
                          {joiningPlanId === evt.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <>
                              <Ionicons
                                name={evt.current_user_joined ? 'checkmark-circle' : 'person-add'}
                                size={18}
                                color="#fff"
                              />
                              <Text style={styles.profileEventJoinText}>
                                {evt.current_user_joined ? 'Joined' : 'Join'}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <Text style={styles.profileEventJoinCount}>
                          {evt.join_count} {evt.join_count === 1 ? 'person' : 'people'} joined
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.safetyRow}>
            <TouchableOpacity style={styles.safetyButton} onPress={() => setSafetyAction('report')}>
              <Ionicons name="flag-outline" size={18} color="#666" />
              <Text style={styles.safetyText}>Report user</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.safetyButton, styles.safetyButtonDanger]} onPress={() => setSafetyAction('block')}>
              <Ionicons name="ban-outline" size={18} color="#D32F2F" />
              <Text style={[styles.safetyText, styles.safetyTextDanger]}>Block user</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
      <Modal
        visible={!!safetyAction}
        transparent
        animationType="fade"
        onRequestClose={() => setSafetyAction(null)}
      >
        <View style={styles.safetyModalOverlay}>
          <View style={styles.safetyModalCard}>
            <Text style={styles.safetyModalTitle}>
              {safetyAction === 'block' ? 'Block this user?' : 'Report this user?'}
            </Text>
            <Text style={styles.safetyModalBody}>
              {safetyAction === 'block'
                ? 'Are you sure you want to block this user?'
                : 'Are you sure you want to report this user?'}
            </Text>
            <View style={styles.safetyModalActions}>
              <TouchableOpacity
                style={[styles.safetyModalButton, styles.safetyModalCancel]}
                onPress={() => setSafetyAction(null)}
              >
                <Text style={styles.safetyModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.safetyModalButton, styles.safetyModalConfirm]}
                onPress={async () => {
                  const action = safetyAction;
                  setSafetyAction(null);
                  if (action === 'block') {
                    await performBlockUser();
                  } else {
                    performReportUser();
                  }
                }}
              >
                <Text style={styles.safetyModalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    </SafeAreaView>
  );
}

function formatSkillLevel(level: string): string {
  const s = (level || '').trim();
  if (!s) return 'Beginner';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function getSkillBadgeStyle(skillLevel: string) {
  const n = formatSkillLevel(skillLevel);
  switch (n) {
    case 'Beginner':
      return { backgroundColor: '#4CAF50' };
    case 'Intermediate':
      return { backgroundColor: '#FFCF56' };
    case 'Advanced':
      return { backgroundColor: '#FF8C42' };
    default:
      return { backgroundColor: '#999' };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eaecee',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#d8dadc',
    backgroundColor: '#eaecee',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
  },
  profileCard: {
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarLarge: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  communityStarBadge: {
    position: 'absolute',
    bottom: 2,
    right: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F5A623',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#fff',
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 3,
    elevation: 4,
  },
  communityBuilderBlock: {
    alignItems: 'center',
    marginTop: -4,
    marginBottom: 10,
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
  name: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  distanceText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    marginTop: -4,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 14,
    marginBottom: 4,
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
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#888',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#e0e0e0',
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FF8C42',
    marginTop: 14,
  },
  messageButtonText: {
    marginLeft: 6,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 16,
    borderTopWidth: 4,
    borderTopColor: '#FFCF56',
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionGap: {
    marginTop: 0,
  },
  safetyRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 16,
  },
  safetyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
  },
  safetyButtonDanger: {
    borderColor: '#F2C5C5',
    backgroundColor: '#FFF5F5',
  },
  safetyText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  safetyTextDanger: {
    color: '#D32F2F',
  },
  safetyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  safetyModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
  },
  safetyModalTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 6,
  },
  safetyModalBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 16,
  },
  profileEventsList: { marginTop: 8 },
  profileEventCard: {
    position: 'relative',
    backgroundColor: '#FFFDF9',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F4E5C9',
    marginBottom: 10,
  },
  profileEventSkillTopRight: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
  },
  profileEventSkillBubble: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    maxWidth: 112,
  },
  profileEventSkillBubbleText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 1,
  },
  profileEventTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 4,
  },
  profileEventTitleWithSkillCorner: { paddingRight: 102 },
  profileEventLocation: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#555',
    marginBottom: 6,
    lineHeight: 20,
  },
  profileEventImage: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#f0f0f0',
  },
  profileEventDateTime: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 4,
  },
  profileEventNote: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginTop: 4,
    marginBottom: 8,
  },
  profileEventFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  profileEventJoinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF8C42',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  profileEventJoinButtonJoined: { backgroundColor: '#4CAF50' },
  profileEventJoinText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  profileEventJoinCount: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#999' },
  safetyModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  safetyModalButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyModalCancel: {
    backgroundColor: '#FDEDED',
    borderWidth: 1,
    borderColor: '#F2C5C5',
  },
  safetyModalConfirm: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  safetyModalCancelText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#D32F2F',
  },
  safetyModalConfirmText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#2E7D32',
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
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 12,
  },
  sectionDivider: {
    height: 3,
    borderRadius: 2,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  activityRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  activityRowLast: {
    borderBottomWidth: 0,
  },
  activityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  activityTextContainer: {
    flex: 1,
  },
  activityName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  skillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  skillLevelText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#555',
  },
});
