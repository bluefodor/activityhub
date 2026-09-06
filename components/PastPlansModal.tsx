import { CachedImage } from '@/components/CachedImage';
import { appCalendarDateKey } from '@/lib/appCalendarDate';
import { formatLocalYyyyMmDd, formatPlanTime12hShort } from '@/lib/planDateTime';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type PastPlan = {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  skillLevel: string | null;
  note: string | null;
  imageUrl: string | null;
  creatorName: string;
  attendeeCount: number;
};

type Props = {
  visible: boolean;
  activityId: string;
  activityName: string;
  onClose: () => void;
};

export function PastPlansModal({ visible, activityId, activityName, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<PastPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const loadPastPlans = useCallback(async () => {
    if (!activityId) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);

    try {
      const { data, error: plansError } = await supabase
        .from('activity_plans')
        .select(`
          id,
          title,
          event_date,
          event_time,
          skill_level,
          note,
          image_url,
          profiles!activity_plans_creator_id_fkey(name)
        `)
        .eq('activity_id', activityId)
        .lt('event_date', appCalendarDateKey())
        .order('event_date', { ascending: false })
        .order('event_time', { ascending: false })
        .limit(20);

      if (plansError) throw plansError;
      if (request !== requestRef.current) return;

      const ids = (data ?? []).map((row: any) => row.id);
      const attendeeCountByPlan = new Map<string, number>();
      if (ids.length > 0) {
        const { data: joins, error: joinsError } = await supabase
          .from('plan_joins')
          .select('plan_id')
          .in('plan_id', ids);
        if (joinsError) throw joinsError;
        (joins ?? []).forEach((join: any) => {
          attendeeCountByPlan.set(
            join.plan_id,
            (attendeeCountByPlan.get(join.plan_id) ?? 0) + 1
          );
        });
      }

      if (request !== requestRef.current) return;
      setPlans(
        (data ?? []).map((row: any) => {
          const creator = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
          return {
            id: row.id,
            title: row.title?.trim() || 'Activity meetup',
            eventDate: row.event_date,
            eventTime: row.event_time,
            skillLevel: row.skill_level ?? null,
            note: row.note?.trim() || null,
            imageUrl: row.image_url ?? null,
            creatorName: creator?.name || 'Community member',
            attendeeCount: attendeeCountByPlan.get(row.id) ?? 0,
          };
        })
      );
    } catch (loadError) {
      if (request !== requestRef.current) return;
      console.warn('Could not load past plans:', loadError);
      setError('Past plans could not be loaded. Please try again.');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    if (visible) {
      void loadPastPlans();
    } else {
      requestRef.current += 1;
    }
  }, [visible, loadPastPlans]);

  const renderPlan = ({ item }: { item: PastPlan }) => (
    <View style={styles.card}>
      {item.imageUrl ? (
        <CachedImage
          source={{ uri: item.imageUrl }}
          style={styles.photo}
          displayPreset="plan"
          resizeMode="cover"
        />
      ) : (
        <View style={styles.photoPlaceholder}>
          <Ionicons name="calendar-outline" size={30} color="#C8C8C8" />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.completedPill}>
            <Text style={styles.completedText}>Past</Text>
          </View>
        </View>
        <Text style={styles.dateText}>
          {formatLocalYyyyMmDd(item.eventDate, 'en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
          {item.eventTime ? ` · ${formatPlanTime12hShort(item.eventTime)}` : ''}
        </Text>
        <View style={styles.metaRow}>
          {item.skillLevel ? (
            <View style={styles.skillPill}>
              <Text style={styles.skillText}>{item.skillLevel}</Text>
            </View>
          ) : null}
          <View style={styles.attendeeMeta}>
            <Ionicons name="people-outline" size={14} color="#777" />
            <Text style={styles.metaText}>
              {item.attendeeCount > 0
                ? `${item.attendeeCount} ${item.attendeeCount === 1 ? 'person' : 'people'} joined`
                : `Hosted by ${item.creatorName}`}
            </Text>
          </View>
        </View>
        {item.note ? <Text style={styles.note} numberOfLines={2}>{item.note}</Text> : null}
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View
          style={[
            styles.header,
            {
              // A page-sheet modal can report a zero top inset on iOS even on
              // notched phones, so keep a safe fallback below the status bar.
              paddingTop: Platform.OS === 'ios' ? Math.max(insets.top, 48) : insets.top + 12,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Back to channel"
          >
            <Ionicons name="chevron-back" size={20} color="#FF8C42" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Past Plans</Text>
            <Text style={styles.subtitle}>{activityName || 'This channel'}</Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close past plans"
          >
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        <Text style={styles.intro}>
          See what this community has planned together.
        </Text>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#FF8C42" />
            <Text style={styles.stateText}>Loading past plans…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Ionicons name="cloud-offline-outline" size={38} color="#AAA" />
            <Text style={styles.stateText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => void loadPastPlans()}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={plans}
            renderItem={renderPlan}
            keyExtractor={(item) => item.id}
            contentContainerStyle={plans.length === 0 ? styles.emptyList : styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.centerState}>
                <Ionicons name="time-outline" size={42} color="#C8C8C8" />
                <Text style={styles.emptyTitle}>No past plans yet</Text>
                <Text style={styles.stateText}>
                  Completed plans for this channel will appear here.
                </Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDD',
  },
  headerText: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -6,
    marginRight: 8,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  backText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#222' },
  subtitle: { marginTop: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: '#888' },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F3F3',
  },
  intro: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  list: { padding: 16, paddingBottom: 32, gap: 12 },
  emptyList: { flexGrow: 1 },
  card: {
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: '#FFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7E7E7',
  },
  photo: { width: 108, minHeight: 132 },
  photoPlaceholder: {
    width: 108,
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F1F1',
  },
  cardBody: { flex: 1, padding: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Inter_700Bold',
    color: '#222',
  },
  completedPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#EFEFEF',
  },
  completedText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: '#666' },
  dateText: {
    marginTop: 5,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#777',
  },
  metaRow: { marginTop: 8, gap: 7 },
  skillPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: '#FFF1E8',
  },
  skillText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: '#C96524' },
  attendeeMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', color: '#777' },
  note: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Inter_400Regular',
    color: '#555',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 10,
  },
  emptyTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: '#555' },
  stateText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
    color: '#888',
  },
  retryButton: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: '#FF8C42',
  },
  retryText: { color: '#FFF', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
