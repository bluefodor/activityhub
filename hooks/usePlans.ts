import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { isPlanLocalDateTimePast, isPlanDayPast } from '@/lib/planDateTime';
import { appCalendarDateKey } from '@/lib/appCalendarDate';
import { parsePlanSkillLevel } from '@/lib/planSkillLevel';
import { useAuth } from './useAuth';
import { createSessionCache } from '@/lib/sessionCache';
import { DEFAULT_FETCH_THROTTLE_MS, isFetchThrottled, markFetchCompleted } from '@/lib/fetchThrottle';
import { uploadCompressedImage } from '@/lib/imageUpload';

const plansCache = createSessionCache<ActivityPlan[]>();
const MAX_PLANS_PER_DAY = 4;

async function uploadPlanImage(uri: string, userId: string): Promise<string | null> {
  const fileName = `activity-plans/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  return uploadCompressedImage(uri, {
    bucket: 'chat-images',
    path: fileName,
    preset: 'plan',
  });
}

export interface ActivityPlan {
  id: string;
  activity_id: string;
  creator_id: string;
  title: string;
  location: string;
  event_date: string;
  event_time: string;
  event_timezone: string;
  created_at: string;
  note?: string | null;
  /** null = legacy plan created before skill_level existed */
  skill_level: string | null;
  creator_name?: string;
  creator_avatar_url?: string | null;
  join_count: number;
  current_user_joined: boolean;
  image_url?: string | null;
  max_rsvps?: number | null;
  join_approval_required?: boolean;
  current_user_request_status?: 'none' | 'pending' | 'approved' | 'declined' | 'canceled';
  pending_request_count?: number;
}

export interface PlanJoinRequest {
  id: string;
  plan_id: string;
  requester_id: string;
  status: 'pending' | 'approved' | 'declined' | 'canceled';
  created_at?: string;
  requester_name?: string;
  requester_avatar_url?: string | null;
}

export function usePlans(activityId: string | undefined) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<ActivityPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [joiningPlanId, setJoiningPlanId] = useState<string | null>(null);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);

  /** Matches global selection; ignore late fetches for another activity (Forum-style guard). */
  const currentActivityIdRef = useRef<string | undefined>(undefined);
  /** Latest selected activity (mutations may finish after a tab switch). */
  const activityIdRef = useRef(activityId);
  activityIdRef.current = activityId;
  const plansRef = useRef(plans);
  plansRef.current = plans;

  const fetchPlans = useCallback(
    async (scopedActivityId?: string, options?: { force?: boolean }) => {
      const forActivityId = scopedActivityId ?? activityId;
      if (!forActivityId || forActivityId.trim() === '') {
        setPlans([]);
        setLoading(false);
        return;
      }

      const throttleKey = `plans:${forActivityId}`;
      if (isFetchThrottled(throttleKey, DEFAULT_FETCH_THROTTLE_MS, options?.force)) {
        if (currentActivityIdRef.current === forActivityId) {
          setLoading(false);
        }
        return;
      }

      // Keep existing list visible during force refresh — blanking UI was thrashing focus.
      const hasVisibleData =
        (plansCache.get(forActivityId)?.length ?? 0) > 0 ||
        (currentActivityIdRef.current === forActivityId && plansRef.current.length > 0);
      if (!hasVisibleData) {
        setLoading(true);
      }
      try {
        const today = appCalendarDateKey();
        const { data: plansData, error: plansError } = await supabase
          .from('activity_plans')
          .select(`
          id,
          activity_id,
          creator_id,
          title,
          location,
          event_date,
          event_time,
          event_timezone,
          created_at,
          note,
          skill_level,
          image_url,
          max_rsvps,
          join_approval_required,
          profiles!activity_plans_creator_id_fkey(name, avatar_url)
        `)
          .eq('activity_id', forActivityId)
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .order('event_time', { ascending: true });

        if (currentActivityIdRef.current !== forActivityId) {
          return;
        }

        if (plansError) {
          console.error('Error fetching plans:', plansError);
          return;
        }

        const planIds = (plansData || []).map((p: any) => p.id);
        if (planIds.length === 0) {
          const emptyList = (plansData || [])
            .map((p: any) => ({
              id: p.id,
              activity_id: p.activity_id,
              creator_id: p.creator_id,
              title: (p.title as string) ?? '',
              location: p.location,
              event_date: p.event_date,
              event_time: p.event_time,
              event_timezone: p.event_timezone || 'UTC',
              created_at: p.created_at,
              note: p.note ?? null,
              skill_level: (p.skill_level as string | null) ?? null,
              image_url: p.image_url ?? null,
              max_rsvps: p.max_rsvps ?? null,
              join_approval_required: !!p.join_approval_required,
              creator_name: p.profiles?.name ?? 'Someone',
              creator_avatar_url: p.profiles?.avatar_url ?? null,
              join_count: 0,
              current_user_joined: false,
              current_user_request_status: 'none',
              pending_request_count: 0,
            }))
            .filter((plan) => !isPlanDayPast(plan.event_date));
          setPlans(emptyList);
          plansCache.set(forActivityId, emptyList);
          markFetchCompleted(throttleKey);
          return;
        }

        const { data: joinsData, error: joinsError } = await supabase
          .from('plan_joins')
          .select('plan_id, user_id')
          .in('plan_id', planIds);

        const { data: joinRequestsData, error: joinRequestsError } = await supabase
          .from('plan_join_requests')
          .select('plan_id, requester_id, status')
          .in('plan_id', planIds);

        if (currentActivityIdRef.current !== forActivityId) {
          return;
        }

        if (joinsError) {
          console.error('Error fetching plan joins:', joinsError);
        }
        if (joinRequestsError) {
          console.error('Error fetching plan join requests:', joinRequestsError);
        }

        const joinsByPlan: Record<string, { count: number; userIds: string[] }> = {};
        (joinsData || []).forEach((j: { plan_id: string; user_id: string }) => {
          if (!joinsByPlan[j.plan_id]) joinsByPlan[j.plan_id] = { count: 0, userIds: [] };
          joinsByPlan[j.plan_id].count += 1;
          joinsByPlan[j.plan_id].userIds.push(j.user_id);
        });

        const pendingRequestsByPlan: Record<string, number> = {};
        const currentUserRequestStatusByPlan: Record<string, ActivityPlan['current_user_request_status']> = {};
        (joinRequestsData || []).forEach((r: { plan_id: string; requester_id: string; status: PlanJoinRequest['status'] }) => {
          if (r.status === 'pending') {
            pendingRequestsByPlan[r.plan_id] = (pendingRequestsByPlan[r.plan_id] || 0) + 1;
          }
          if (user?.id && r.requester_id === user.id) {
            currentUserRequestStatusByPlan[r.plan_id] = r.status;
          }
        });

        const list: ActivityPlan[] = (plansData || []).map((p: any) => {
          const joins = joinsByPlan[p.id] ?? { count: 0, userIds: [] };
          return {
            id: p.id,
            activity_id: p.activity_id,
            creator_id: p.creator_id,
            title: (p.title as string) ?? '',
            location: p.location,
            event_date: p.event_date,
            event_time: p.event_time,
            event_timezone: p.event_timezone || 'UTC',
            created_at: p.created_at,
            note: p.note ?? null,
            skill_level: (p.skill_level as string | null) ?? null,
            image_url: p.image_url ?? null,
            max_rsvps: p.max_rsvps ?? null,
            join_approval_required: !!p.join_approval_required,
            creator_name: p.profiles?.name ?? 'Someone',
            creator_avatar_url: p.profiles?.avatar_url ?? null,
            join_count: joins.count,
            current_user_joined: user ? joins.userIds.includes(user.id) : false,
            current_user_request_status: currentUserRequestStatusByPlan[p.id] ?? 'none',
            pending_request_count: pendingRequestsByPlan[p.id] ?? 0,
          };
        });

        setPlans(list.filter((plan) => !isPlanDayPast(plan.event_date)));
        plansCache.set(forActivityId, list.filter((plan) => !isPlanDayPast(plan.event_date)));
        markFetchCompleted(throttleKey);
      } finally {
        if (currentActivityIdRef.current === forActivityId) {
          setLoading(false);
        }
      }
    },
    [activityId, user?.id]
  );

  // When activityId changes, sync ref, clear list, fetch for the selected activity only
  useEffect(() => {
    if (!activityId || activityId.trim() === '') {
      currentActivityIdRef.current = undefined;
      setPlans([]);
      setLoading(false);
      return;
    }
    currentActivityIdRef.current = activityId;
    const cached = plansCache.get(activityId);
    if (cached) {
      setPlans(cached);
      setLoading(false);
    } else {
      setPlans([]);
      setLoading(true);
    }
    fetchPlans(activityId, { force: !plansCache.isFresh(activityId) });
  }, [activityId, fetchPlans]);

  const createPlan = useCallback(
    async (params: {
      title: string;
      location: string;
      event_date: string;
      event_time: string;
      skill_level: string;
      note?: string | null;
      /** Local file URI from image picker; uploaded before insert. */
      imageUri?: string | null;
      max_rsvps?: number | null;
      join_approval_required?: boolean;
    }): Promise<{ ok: boolean; error?: string }> => {
      const planActivityId = activityId;
      if (!user || !planActivityId) return { ok: false, error: 'Not signed in or no activity' };

      setCreating(true);
      try {
        const today = appCalendarDateKey();
        const { count, error: countError } = await supabase
          .from('activity_plans')
          .select('id', { count: 'exact', head: true })
          .eq('creator_id', user.id)
          .eq('event_date', today);

        if (countError) {
          setCreating(false);
          return { ok: false, error: 'Could not check event limit' };
        }
        if ((count ?? 0) >= MAX_PLANS_PER_DAY) {
          setCreating(false);
          return {
            ok: false,
            error: `You can only create ${MAX_PLANS_PER_DAY} events per day. Try again tomorrow.`,
          };
        }

        const titleVal = params.title.trim();
        if (!titleVal) {
          setCreating(false);
          return { ok: false, error: 'Please add a title for your plan.' };
        }
        if (titleVal.length > 120) {
          setCreating(false);
          return { ok: false, error: 'Title must be 120 characters or less.' };
        }
        const parsedSkill = parsePlanSkillLevel(params.skill_level);
        if (!parsedSkill) {
          setCreating(false);
          return { ok: false, error: 'Please choose a skill level for this plan.' };
        }
        const noteVal = params.note?.trim() || null;
        if (noteVal && noteVal.length > 160) {
          setCreating(false);
          return { ok: false, error: 'Note must be 160 characters or less.' };
        }
        if (isPlanLocalDateTimePast(params.event_date, params.event_time)) {
          setCreating(false);
          return { ok: false, error: 'Plan must be in the future. Please choose a date and time after now.' };
        }
        let imageUrl: string | null = null;
        if (params.imageUri?.trim()) {
          imageUrl = await uploadPlanImage(params.imageUri.trim(), user.id);
          if (!imageUrl) {
            setCreating(false);
            return { ok: false, error: 'Could not upload photo. Try again or remove the image.' };
          }
        }
        const { error } = await supabase
          .from('activity_plans')
          .insert({
            activity_id: planActivityId,
            creator_id: user.id,
            title: titleVal,
            location: params.location.trim(),
            event_date: params.event_date,
            event_time: params.event_time,
            event_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            note: noteVal,
            skill_level: parsedSkill,
            image_url: imageUrl,
            max_rsvps: params.max_rsvps ?? null,
            join_approval_required: !!params.join_approval_required,
          })
          .select('id')
          .single();

        if (error) {
          setCreating(false);
          return { ok: false, error: error.message };
        }
        // Creator join is inserted by DB trigger activity_plans_creator_auto_join (ON CONFLICT DO NOTHING).
        await fetchPlans(planActivityId, { force: true });
        return { ok: true };
      } finally {
        setCreating(false);
      }
    },
    [user, activityId, fetchPlans]
  );

  const updatePlan = useCallback(
    async (
      planId: string,
      params: {
        title: string;
        location: string;
        event_date: string;
        event_time: string;
        skill_level: string;
        note?: string | null;
        imageUri?: string | null;
        clearImage?: boolean;
        max_rsvps?: number | null;
        join_approval_required?: boolean;
      }
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!user) return { ok: false, error: 'Not signed in' };
      const plan = plans.find((p) => p.id === planId);
      if (!plan || plan.creator_id !== user.id) {
        return { ok: false, error: 'You can only edit your own event.' };
      }
      const titleVal = params.title.trim();
      if (!titleVal) {
        return { ok: false, error: 'Please add a title for your plan.' };
      }
      if (titleVal.length > 120) {
        return { ok: false, error: 'Title must be 120 characters or less.' };
      }
      const parsedSkill = parsePlanSkillLevel(params.skill_level);
      if (!parsedSkill) {
        return { ok: false, error: 'Please choose a skill level for this plan.' };
      }
      const noteVal = params.note?.trim() || null;
      if (noteVal && noteVal.length > 160) {
        return { ok: false, error: 'Note must be 160 characters or less.' };
      }
      if (isPlanLocalDateTimePast(params.event_date, params.event_time)) {
        return { ok: false, error: 'Plan must be in the future. Please choose a date and time after now.' };
      }
      setUpdatingPlanId(planId);
      try {
        const updatePayload: Record<string, unknown> = {
          title: titleVal,
          location: params.location.trim(),
          event_date: params.event_date,
          event_time: params.event_time,
          note: noteVal,
          skill_level: parsedSkill,
          max_rsvps: params.max_rsvps ?? null,
          join_approval_required: !!params.join_approval_required,
        };
        if (params.clearImage) {
          updatePayload.image_url = null;
        } else if (params.imageUri?.trim()) {
          const uploaded = await uploadPlanImage(params.imageUri.trim(), user.id);
          if (!uploaded) {
            setUpdatingPlanId(null);
            return { ok: false, error: 'Could not upload photo. Try again or remove the image.' };
          }
          updatePayload.image_url = uploaded;
        }
        const { error } = await supabase
          .from('activity_plans')
          .update(updatePayload)
          .eq('id', planId)
          .eq('creator_id', user.id);

        if (error) {
          setUpdatingPlanId(null);
          return { ok: false, error: error.message };
        }
        await fetchPlans(activityIdRef.current, { force: true });
        return { ok: true };
      } finally {
        setUpdatingPlanId(null);
      }
    },
    [user, plans, fetchPlans]
  );

  const deletePlan = useCallback(
    async (planId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!user) return { ok: false, error: 'Not signed in' };
      const plan = plans.find((p) => p.id === planId);
      if (!plan || plan.creator_id !== user.id) {
        return { ok: false, error: 'You can only delete your own event.' };
      }
      setDeletingPlanId(planId);
      try {
        const { error } = await supabase
          .from('activity_plans')
          .delete()
          .eq('id', planId)
          .eq('creator_id', user.id);

        if (error) {
          setDeletingPlanId(null);
          return { ok: false, error: error.message };
        }
        await fetchPlans(activityIdRef.current, { force: true });
        return { ok: true };
      } finally {
        setDeletingPlanId(null);
      }
    },
    [user, plans, fetchPlans]
  );

  const toggleJoin = useCallback(
    async (planId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!user) return { ok: false, error: 'Not signed in' };
      setJoiningPlanId(planId);
      try {
        const plan = plans.find((p) => p.id === planId);
        if (plan?.current_user_joined) {
          const { error } = await supabase
            .from('plan_joins')
            .delete()
            .eq('plan_id', planId)
            .eq('user_id', user.id);
          if (error) {
            console.error('Leave plan error:', error);
            return { ok: false, error: 'Could not leave plan.' };
          }
          if (plan.join_approval_required && plan.creator_id !== user.id) {
            await supabase
              .from('plan_join_requests')
              .upsert(
                {
                  plan_id: planId,
                  requester_id: user.id,
                  status: 'canceled',
                  responder_id: null,
                  responded_at: null,
                },
                { onConflict: 'plan_id,requester_id' }
              );
          }
        } else {
          if (plan?.join_approval_required && plan.creator_id !== user.id) {
            const currentStatus = plan.current_user_request_status ?? 'none';
            if (currentStatus === 'pending') {
              const { error } = await supabase
                .from('plan_join_requests')
                .update({ status: 'canceled', responder_id: null, responded_at: null })
                .eq('plan_id', planId)
                .eq('requester_id', user.id);
              if (error) {
                console.error('Cancel join request error:', error);
                return { ok: false, error: 'Could not cancel join request.' };
              }
            } else {
              const { error } = await supabase.from('plan_join_requests').upsert(
                {
                  plan_id: planId,
                  requester_id: user.id,
                  status: 'pending',
                  responder_id: null,
                  responded_at: null,
                },
                { onConflict: 'plan_id,requester_id' }
              );
              if (error) {
                console.error('Join request error:', error);
                return { ok: false, error: 'Could not request to join this plan.' };
              }
            }
          } else {
            const { error } = await supabase.from('plan_joins').insert({
              plan_id: planId,
              user_id: user.id,
            });
            if (error) {
              console.error('Join plan error:', error);
              const msg = error.message || '';
              if (msg.includes('PLAN_FULL')) return { ok: false, error: 'This plan is full.' };
              if (msg.includes('JOIN_APPROVAL_REQUIRED')) {
                return { ok: false, error: 'This plan requires host approval. Try requesting to join again.' };
              }
              return { ok: false, error: 'Could not join plan.' };
            }
          }
        }
        await fetchPlans(activityIdRef.current, { force: true });
        return { ok: true };
      } finally {
        setJoiningPlanId(null);
      }
    },
    [user, plans, fetchPlans]
  );

  const fetchPendingJoinRequests = useCallback(
    async (planId: string): Promise<PlanJoinRequest[]> => {
      if (!user?.id) return [];
      const plan = plans.find((p) => p.id === planId);
      if (!plan || plan.creator_id !== user.id) return [];
      const { data, error } = await supabase
        .from('plan_join_requests')
        .select(`
          id,
          plan_id,
          requester_id,
          status,
          created_at,
          profiles!plan_join_requests_requester_id_fkey(name, avatar_url)
        `)
        .eq('plan_id', planId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) {
        console.error('Error fetching pending join requests:', error);
        return [];
      }
      return (data || []).map((r: any) => ({
        id: r.id,
        plan_id: r.plan_id,
        requester_id: r.requester_id,
        status: r.status,
        created_at: r.created_at,
        requester_name: r.profiles?.name ?? 'Member',
        requester_avatar_url: r.profiles?.avatar_url ?? null,
      }));
    },
    [user?.id, plans]
  );

  const respondToJoinRequest = useCallback(
    async (requestId: string, approve: boolean): Promise<{ ok: boolean; error?: string }> => {
      if (!user?.id) return { ok: false, error: 'Not signed in' };
      setRespondingRequestId(requestId);
      try {
        const { data: req, error: reqError } = await supabase
          .from('plan_join_requests')
          .select('id, plan_id, requester_id, status')
          .eq('id', requestId)
          .single();
        if (reqError || !req) {
          return { ok: false, error: 'Request not found.' };
        }
        const plan = plans.find((p) => p.id === req.plan_id);
        if (!plan || plan.creator_id !== user.id) {
          return { ok: false, error: 'Only the host can respond to this request.' };
        }
        if (req.status !== 'pending') {
          return { ok: false, error: 'This request is no longer pending.' };
        }

        const { error: updateError } = await supabase
          .from('plan_join_requests')
          .update({
            status: approve ? 'approved' : 'declined',
            responder_id: user.id,
            responded_at: new Date().toISOString(),
          })
          .eq('id', requestId);
        if (updateError) {
          return { ok: false, error: 'Could not update request status.' };
        }

        if (approve) {
          const { error: joinError } = await supabase.from('plan_joins').insert({
            plan_id: req.plan_id,
            user_id: req.requester_id,
          });
          if (joinError) {
            console.error('Approve join insert failed:', joinError);
            await supabase
              .from('plan_join_requests')
              .update({ status: 'pending', responder_id: null, responded_at: null })
              .eq('id', requestId);
            const msg = joinError.message || '';
            if (msg.includes('PLAN_FULL')) return { ok: false, error: 'Plan is full.' };
            return { ok: false, error: 'Could not approve request.' };
          }
        }

        await fetchPlans(activityIdRef.current, { force: true });
        return { ok: true };
      } finally {
        setRespondingRequestId(null);
      }
    },
    [user?.id, plans, fetchPlans]
  );

  const refetchFn = useCallback((force?: boolean) => {
    if (activityId) {
      void fetchPlans(activityId, { force });
    }
  }, [activityId, fetchPlans]);

  return {
    plans,
    loading,
    creating,
    updatingPlanId,
    deletingPlanId,
    joiningPlanId,
    respondingRequestId,
    createPlan,
    updatePlan,
    deletePlan,
    toggleJoin,
    fetchPendingJoinRequests,
    respondToJoinRequest,
    refetch: refetchFn,
  };
}
