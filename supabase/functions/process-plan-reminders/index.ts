import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

interface PushNotificationPayload {
  to: string;
  sound: string;
  title: string;
  body: string;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  data?: any;
}

/**
 * Keep plan reminder copy in the same wall-clock time users selected in-app.
 * We intentionally avoid timezone conversion here because server-side formatting
 * can drift when stored timezone metadata is stale or inconsistent.
 */
function formatPlanDateTimeLabel(eventDate?: string | null, eventTime?: string | null): string {
  if (!eventDate || !eventTime) return "soon";
  try {
    const [yearStr, monthStr, dayStr] = eventDate.split("-");
    const [hourStr, minuteStr] = eventTime.split(":");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      !Number.isFinite(hour) ||
      !Number.isFinite(minute)
    ) {
      return `${eventDate} ${eventTime}`;
    }
    const date = new Date(year, Math.max(0, month - 1), day, hour, minute, 0, 0);
    if (Number.isNaN(date.getTime())) return `${eventDate} ${eventTime}`;
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return `${eventDate} ${eventTime}`;
  }
}

serve(async () => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const nowIso = now.toISOString();

    const { data: jobs, error: jobsError } = await supabase
      .from("plan_reminder_jobs")
      .select("id, plan_id, user_id, job_type, run_at, event_start_at")
      .eq("status", "pending")
      .lte("run_at", nowIso)
      .order("run_at", { ascending: true })
      .limit(100);

    if (jobsError) {
      console.error("Error fetching plan reminder jobs:", jobsError);
      return new Response(JSON.stringify({ error: "Failed to fetch jobs" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: "No jobs due" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    for (const job of jobs) {
      const jobId = job.id;

      if (job.event_start_at && new Date(job.event_start_at).getTime() <= now.getTime()) {
        await supabase
          .from("plan_reminder_jobs")
          .update({ status: "canceled", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      const { data: plan, error: planError } = await supabase
        .from("activity_plans")
        .select("id, activity_id, title, location, event_date, event_time, event_timezone")
        .eq("id", job.plan_id)
        .single();

      if (planError || !plan) {
        await supabase
          .from("plan_reminder_jobs")
          .update({ status: "canceled", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      const { data: activity } = await supabase
        .from("activities")
        .select("name, emoji")
        .eq("id", plan.activity_id)
        .single();

      const activityName = activity?.name || "Activity";
      const activityEmoji = activity?.emoji || "📌";

      const dateTimeLabel = formatPlanDateTimeLabel(plan.event_date, plan.event_time);

      const { data: recipientProfile, error: profileError } = await supabase
        .from("profiles")
        .select("plan_reminder_notifications_enabled")
        .eq("id", job.user_id)
        .single();

      if (profileError) {
        await supabase
          .from("plan_reminder_jobs")
          .update({ status: "error", updated_at: nowIso })
          .eq("id", jobId);
        console.error("Error fetching plan reminder preference:", profileError);
        continue;
      }

      if (recipientProfile?.plan_reminder_notifications_enabled === false) {
        await supabase
          .from("plan_reminder_jobs")
          .update({ status: "skipped", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      const { data: pushTokens, error: tokensError } = await supabase
        .from("push_tokens")
        .select("expo_push_token")
        .eq("user_id", job.user_id);

      if (tokensError || !pushTokens || pushTokens.length === 0) {
        await supabase
          .from("plan_reminder_jobs")
          .update({ status: "skipped", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      const planTitle =
        plan.title && String(plan.title).trim() ? String(plan.title).trim() : "Meetup";
      const is1h = job.job_type === "1h_before";
      const title = is1h ? `${activityEmoji} Starting in 1 hour` : `${activityEmoji} Tomorrow: ${activityName}`;
      const body = is1h
        ? `${planTitle} — ${plan.location || "your area"} · ${dateTimeLabel}`
        : `${planTitle} · ${dateTimeLabel}\n${plan.location || "your area"}`;

      const notifications: PushNotificationPayload[] = pushTokens.map((token) => ({
        to: token.expo_push_token,
        sound: "default",
        title,
        body,
        channelId: "default",
        priority: "high",
        data: {
          type: "plan_reminder",
          planId: plan.id,
          activityId: plan.activity_id,
          activityName,
          activityEmoji,
          jobType: job.job_type,
        },
      }));

      const response = await fetch(EXPO_PUSH_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(notifications),
      });

      const result = await response.json();

      if (!response.ok) {
        await supabase
          .from("plan_reminder_jobs")
          .update({ status: "error", updated_at: nowIso })
          .eq("id", jobId);
        console.error("Expo push error:", result);
        continue;
      }

      await supabase
        .from("plan_reminder_jobs")
        .update({ status: "sent", updated_at: nowIso })
        .eq("id", jobId);
    }

    return new Response(JSON.stringify({ message: "Processed jobs", count: jobs.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in process-plan-reminders:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
