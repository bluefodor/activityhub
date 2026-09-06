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

serve(async () => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const nowIso = now.toISOString();

    const { data: jobs, error: jobsError } = await supabase
      .from("meetup_notification_jobs")
      .select("id, invite_id, recipient_id, sender_id, job_type, run_at, event_start_at")
      .eq("status", "pending")
      .lte("run_at", nowIso)
      .order("run_at", { ascending: true })
      .limit(100);

    if (jobsError) {
      console.error("Error fetching meetup notification jobs:", jobsError);
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
      const isInviteCreated = job.job_type === "invite_created";
      const isInviteReminder = job.job_type === "invite_reminder";
      const isAcceptedReminder1d =
        job.job_type === "accepted_reminder_1d" || job.job_type === "accepted_reminder_3h";
      const isAcceptedReminder1h =
        job.job_type === "accepted_reminder_1h" || job.job_type === "accepted_reminder_5m";

      if (job.event_start_at && new Date(job.event_start_at).getTime() <= now.getTime()) {
        await supabase
          .from("meetup_notification_jobs")
          .update({ status: "canceled", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      const { data: invite, error: inviteError } = await supabase
        .from("meetup_invites")
        .select("id, sender_id, recipient_id, location, event_date, event_time, event_timezone, status, activity_name, chat_id")
        .eq("id", job.invite_id)
        .single();

      if (inviteError || !invite) {
        await supabase
          .from("meetup_notification_jobs")
          .update({ status: "canceled", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      if ((isInviteReminder || isInviteCreated) && invite.status !== "pending") {
        await supabase
          .from("meetup_notification_jobs")
          .update({ status: "canceled", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      if (!isInviteReminder && !isInviteCreated && invite.status !== "accepted") {
        await supabase
          .from("meetup_notification_jobs")
          .update({ status: "canceled", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", invite.sender_id)
        .single();

      const senderName = senderProfile?.name || "someone";
      const activityName = invite.activity_name || "Activity";
      const eventDate = invite.event_date;
      const eventTime = invite.event_time;
      let dateTimeLabel = "a scheduled time";
      if (eventDate && eventTime) {
        try {
          const tz = invite.event_timezone || "UTC";
          const startMs = new Date(job.event_start_at).getTime();
          if (!Number.isNaN(startMs)) {
            dateTimeLabel = new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
              timeZone: tz,
            }).format(new Date(startMs));
          }
        } catch {
          dateTimeLabel = `${eventDate} ${eventTime}`;
        }
      }

      let title = "";
      let body = "";
      let data: any = {};

      if (isInviteCreated) {
        title = `${activityName} invite received!`;
        body = `${senderName} has invited you on ${dateTimeLabel}. Tap to see more.`;
        data = {
          type: "invite_created",
          inviteId: invite.id,
          senderId: invite.sender_id,
          senderName,
          chatId: invite.chat_id,
        };
      } else if (isInviteReminder) {
        title = "Quick check!";
        body = `${senderName} waiting to hear from you. ${invite.location} in 3 hours.`;
        data = {
          type: "invite_reminder",
          inviteId: invite.id,
          senderId: invite.sender_id,
          senderName,
          chatId: invite.chat_id,
        };
      } else if (isAcceptedReminder1d) {
        title = `Tomorrow: ${activityName}`;
        body = `${senderName} at ${invite.location}. ${dateTimeLabel}.`;
        data = {
          type: "event_reminder",
          meetingId: invite.id,
          inviteId: invite.id,
          otherUserId: invite.sender_id,
          userName: senderName,
          chatId: invite.chat_id,
        };
      } else {
        title = `${activityName} starts in 1 hour`;
        body = `${senderName} at ${invite.location}. ${dateTimeLabel}.`;
        data = {
          type: "event_reminder",
          meetingId: invite.id,
          inviteId: invite.id,
          otherUserId: invite.sender_id,
          userName: senderName,
          chatId: invite.chat_id,
        };
      }

      const { data: pushTokens, error: tokensError } = await supabase
        .from("push_tokens")
        .select("expo_push_token")
        .eq("user_id", job.recipient_id);

      const { data: recipientProfile, error: recipientProfileError } = await supabase
        .from("profiles")
        .select("private_invite_notifications_enabled")
        .eq("id", job.recipient_id)
        .single();

      if (recipientProfileError) {
        await supabase
          .from("meetup_notification_jobs")
          .update({ status: "error", updated_at: nowIso })
          .eq("id", jobId);
        console.error("Error fetching invite notification preference:", recipientProfileError);
        continue;
      }

      if (recipientProfile?.private_invite_notifications_enabled === false) {
        await supabase
          .from("meetup_notification_jobs")
          .update({ status: "skipped", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      if (tokensError || !pushTokens || pushTokens.length === 0) {
        await supabase
          .from("meetup_notification_jobs")
          .update({ status: "skipped", updated_at: nowIso })
          .eq("id", jobId);
        continue;
      }

      const notifications: PushNotificationPayload[] = pushTokens.map((token) => ({
        to: token.expo_push_token,
        sound: "default",
        title,
        body,
        channelId: "default",
        priority: "high",
        data,
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
          .from("meetup_notification_jobs")
          .update({ status: "error", updated_at: nowIso })
          .eq("id", jobId);
        console.error("Expo push error:", result);
        continue;
      }

      await supabase
        .from("meetup_notification_jobs")
        .update({ status: "sent", updated_at: nowIso })
        .eq("id", jobId);
    }

    return new Response(JSON.stringify({ message: "Processed jobs", count: jobs.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in process-meetup-notifications:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
