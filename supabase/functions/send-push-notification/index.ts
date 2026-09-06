import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DateTime } from "https://esm.sh/luxon@3.5.0";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

interface PushNotificationPayload {
  to: string;
  sound: string;
  title: string;
  body: string;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  badge?: number;
  /** Collapses duplicate pushes with the same id on the device. */
  collapseId?: string;
  data?: any;
}

const EXPO_PUSH_BATCH_SIZE = 100;
const MAX_APP_BADGE = 99;

const chunkNotifications = (items: PushNotificationPayload[], size: number) => {
  const chunks: PushNotificationPayload[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

async function loadBadgeCountsForUsers(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<Map<string, number>> {
  const badgeByUser = new Map<string, number>();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];

  await Promise.all(
    uniqueIds.map(async (userId) => {
      const { data, error } = await supabase.rpc("get_app_icon_badge_count", {
        p_user_id: userId,
      });
      if (error) {
        console.warn(`⚠️ Badge count RPC failed for ${userId}:`, error.message);
        badgeByUser.set(userId, 1);
        return;
      }
      const count = typeof data === "number" ? data : Number(data) || 0;
      badgeByUser.set(userId, Math.min(MAX_APP_BADGE, Math.max(0, count)));
    }),
  );

  return badgeByUser;
}

/** Supabase webhooks may use `record` or legacy `new`. */
function getWebhookRecord(requestBody: { record?: Record<string, unknown>; new?: Record<string, unknown> }) {
  return requestBody.record ?? requestBody.new ?? null;
}

serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        },
      });
    }

    const requestBody = await req.json();
    console.log("📥 Received request:", JSON.stringify(requestBody, null, 2));

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let recipientUserId = "";
    let recipientUserIds: string[] = [];
    const excludeUserIds = new Set<string>();
    let title: string;
    let body: string;
    let data: any;
    // Skip per-user badge RPC for broadcast notifications (forum, new plan) to
    // avoid N×DB calls that push execution past the webhook timeout and cause retries.
    let skipBadgeLookup = false;

    // Check if this is a webhook payload (from database trigger) or direct API call
    const chatMessageRecord = getWebhookRecord(requestBody);
    if (requestBody.type === "INSERT" && requestBody.table === "chat_messages" && chatMessageRecord) {
      // This is a webhook payload from Supabase
      console.log("🔔 Processing webhook payload for new message");
      const messageRecord = chatMessageRecord;
      const senderId = String(messageRecord.sender_id ?? "");
      if (senderId) excludeUserIds.add(senderId);
      const chatId = messageRecord.chat_id;
      const messageText = messageRecord.message || "📷 Photo";

      // Get the chat to find the recipient
      const { data: chat, error: chatError } = await supabase
        .from("chats")
        .select("participant_1, participant_2")
        .eq("id", chatId)
        .single();

      if (chatError || !chat) {
        console.error("❌ Error fetching chat:", chatError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch chat information" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // Determine recipient (the person who didn't send the message)
      recipientUserId = chat.participant_1 === senderId ? chat.participant_2 : chat.participant_1;

      const { data: recipientProfile, error: recipientProfileError } = await supabase
        .from("profiles")
        .select("chat_notifications_enabled")
        .eq("id", recipientUserId)
        .single();

      if (recipientProfileError) {
        console.error("❌ Error fetching recipient profile:", recipientProfileError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch recipient notification preferences" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      if (recipientProfile?.chat_notifications_enabled === false) {
        console.warn(`⚠️ Chat notifications disabled for recipient ${recipientUserId}`);
        return new Response(
          JSON.stringify({ message: "Chat notifications disabled", sent: 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Get sender's name
      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", senderId)
        .single();

      const senderName = senderProfile?.name || "Someone";

      // Format notification
      title = senderName;
      body = messageText.length > 100 ? messageText.substring(0, 100) + "..." : messageText;
      data = {
        type: "new_message",
        chatId: chatId,
        otherUserId: senderId,
        userName: senderName,
      };

      console.log(`✅ Processed webhook: recipient=${recipientUserId}, sender=${senderName}`);
    } else if (requestBody.type === "INSERT" && requestBody.table === "forum_messages") {
      const messageRecord = getWebhookRecord(requestBody);
      if (!messageRecord) {
        return new Response(
          JSON.stringify({ error: "Missing forum_messages record in webhook payload" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      console.log("🔔 Processing webhook payload for forum message");
      let senderId = String(messageRecord.user_id ?? messageRecord.userId ?? "");
      const activityId = messageRecord.activity_id ?? messageRecord.activityId;
      const messageText = (messageRecord.message as string | undefined) || "📷 Photo";

      if (!senderId && messageRecord.id) {
        const { data: msgRow } = await supabase
          .from("forum_messages")
          .select("user_id")
          .eq("id", messageRecord.id)
          .single();
        senderId = String(msgRow?.user_id ?? "");
      }

      if (!senderId) {
        console.warn("⚠️ Forum message webhook missing sender user_id; aborting push");
        return new Response(
          JSON.stringify({ message: "Missing sender for forum message", sent: 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      excludeUserIds.add(senderId);

      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", senderId)
        .single();

      const senderName = senderProfile?.name || "Someone";

      const { data: activity } = await supabase
        .from("activities")
        .select("name, emoji")
        .eq("id", activityId)
        .single();

      const activityName = activity?.name || "Forum";
      const activityEmoji = activity?.emoji || "📌";

      const { data: participants, error: participantsError } = await supabase
        .from("user_activity_skills")
        .select("user_id")
        .eq("activity_id", activityId);

      if (participantsError) {
        console.error("❌ Error fetching forum participants:", participantsError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch forum participants" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      const rawRecipientIds = (participants || [])
        .map((p: { user_id: string }) => p.user_id)
        .filter((id: string) => id && id !== senderId);
      const uniqueRecipientIds = Array.from(new Set(rawRecipientIds));

      if (uniqueRecipientIds.length === 0) {
        console.warn("⚠️ No forum recipients found");
        return new Response(
          JSON.stringify({ message: "No forum recipients found", sent: 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const { data: preferenceRows, error: preferenceError } = await supabase
        .from("profiles")
        .select("id")
        .in("id", uniqueRecipientIds)
        .eq("forum_notifications_enabled", true);

      if (preferenceError) {
        console.error("❌ Error checking forum notification preferences:", preferenceError);
        return new Response(
          JSON.stringify({ error: "Failed to check forum notification preferences" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      recipientUserIds = (preferenceRows || []).map((row: { id: string }) => row.id);

      if (recipientUserIds.length === 0) {
        console.warn("⚠️ No forum recipients after preference filter");
        return new Response(
          JSON.stringify({ message: "No forum recipients after preference filter", sent: 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      title = `Forum: ${activityName}`;
      body = `${senderName}\n${messageText.length > 100 ? messageText.substring(0, 100) + "..." : messageText}`;
      data = {
        type: "forum_message",
        activityId,
        senderId,
        messageId: messageRecord.id,
        activityName,
        activityEmoji,
      };

      skipBadgeLookup = true; // many recipients — skip per-user RPC to stay within webhook timeout
      console.log(`✅ Forum message processed: activity=${activityName}, recipients=${recipientUserIds.length}`);
    } else if (requestBody.type === "INSERT" && requestBody.table === "activity_plans" && requestBody.record) {
      console.log("🔔 Processing webhook payload for new activity plan");
      const planRecord = requestBody.record;
      const creatorId = planRecord.creator_id;
      const activityId = planRecord.activity_id;
      const location = planRecord.location || "your area";
      const planTitle =
        planRecord.title && String(planRecord.title).trim()
          ? String(planRecord.title).trim()
          : "Meetup";
      const eventDate = planRecord.event_date;
      const eventTime = planRecord.event_time;

      if (!creatorId || !activityId) {
        return new Response(
          JSON.stringify({ error: "Missing creator_id or activity_id for activity_plans webhook" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      excludeUserIds.add(String(creatorId));

      const [{ data: creatorProfile }, { data: activity }] = await Promise.all([
        supabase.from("profiles").select("name").eq("id", creatorId).single(),
        supabase.from("activities").select("name, emoji").eq("id", activityId).single(),
      ]);

      const creatorName = creatorProfile?.name || "Someone";
      const activityName = activity?.name || "Activity";
      const activityEmoji = activity?.emoji || "📌";

      const { data: participants, error: participantsError } = await supabase
        .from("user_activity_skills")
        .select("user_id")
        .eq("activity_id", activityId)
        .neq("user_id", creatorId);

      if (participantsError) {
        console.error("❌ Error fetching activity participants:", participantsError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch activity participants" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      const uniqueRecipientIds = Array.from(
        new Set((participants || []).map((p: { user_id: string }) => p.user_id))
      );

      if (uniqueRecipientIds.length === 0) {
        return new Response(
          JSON.stringify({ message: "No recipients for new event notification", sent: 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const { data: preferenceRows, error: preferenceError } = await supabase
        .from("profiles")
        .select("id")
        .in("id", uniqueRecipientIds)
        .eq("new_event_notifications_enabled", true);

      if (preferenceError) {
        console.error("❌ Error checking new event notification preferences:", preferenceError);
        return new Response(
          JSON.stringify({ error: "Failed to check new event notification preferences" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      recipientUserIds = (preferenceRows || []).map((row: { id: string }) => row.id);

      if (recipientUserIds.length === 0) {
        return new Response(
          JSON.stringify({ message: "No recipients after preference filter", sent: 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      let dateTimeLabel = "Soon";
      if (eventDate && eventTime) {
        try {
          const tz = planRecord.event_timezone || "UTC";
          const d = String(eventDate).trim();
          const t = String(eventTime).trim();
          const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
          const tparts = t.split(":");
          const h = parseInt(tparts[0], 10);
          const min = parseInt(tparts[1] ?? "0", 10);
          const secPart = tparts[2] ?? "0";
          const sec = parseInt(String(secPart).replace(/\D/g, "") || "0", 10) || 0;
          if (dm && !Number.isNaN(h) && !Number.isNaN(min)) {
            const dt = DateTime.fromObject(
              {
                year: parseInt(dm[1], 10),
                month: parseInt(dm[2], 10),
                day: parseInt(dm[3], 10),
                hour: h,
                minute: min,
                second: Number.isNaN(sec) ? 0 : sec,
              },
              { zone: tz },
            );
            if (dt.isValid) {
              const ev = dt.toJSDate();
              const timeStr = new Intl.DateTimeFormat("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
                timeZone: tz,
              })
                .format(ev)
                .replace(" AM", " am")
                .replace(" PM", " pm");
              const mo = parseInt(dm[2], 10);
              const day = parseInt(dm[3], 10);
              const yy = parseInt(dm[1], 10) % 100;
              dateTimeLabel = `${mo}/${day}/${String(yy).padStart(2, "0")} · ${timeStr}`;
            }
          }
        } catch {
          dateTimeLabel = `${eventDate} ${eventTime}`;
        }
      }

      title = `${activityEmoji} ${creatorName} made a plan`;
      body = `Tap to join!`;
      data = {
        type: "new_event",
        planId: planRecord.id,
        activityId,
        activityName,
        activityEmoji,
        creatorId,
      };

      skipBadgeLookup = true; // many recipients — skip per-user RPC to stay within webhook timeout
      console.log(`✅ New activity event processed: activity=${activityName}, recipients=${recipientUserIds.length}`);
    } else if (
      requestBody.type === "INSERT" &&
      requestBody.table === "plan_group_chat_messages" &&
      requestBody.record
    ) {
      console.log("🔔 Processing webhook payload for plan group chat message");
      const messageRecord = requestBody.record;
      const senderId = messageRecord.user_id;
      const groupChatId = messageRecord.chat_id;

      if (!senderId || !groupChatId) {
        return new Response(
          JSON.stringify({ error: "Missing user_id or chat_id for plan_group_chat_messages webhook" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      excludeUserIds.add(String(senderId));

      let messageText = messageRecord.message || "";
      if (messageRecord.message_kind === "poll") {
        messageText = "Poll";
      } else if (
        Array.isArray(messageRecord.image_urls) &&
        messageRecord.image_urls.length > 0
      ) {
        messageText = "📷 Photo";
      } else if (!messageText.trim()) {
        messageText = "New message";
      }

      const { data: chatRow, error: chatError } = await supabase
        .from("plan_group_chats")
        .select("plan_id, activity_plans!plan_group_chats_plan_id_fkey(title)")
        .eq("id", groupChatId)
        .single();

      if (chatError || !chatRow?.plan_id) {
        console.error("❌ Error fetching plan group chat:", chatError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch plan group chat" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      const planId = chatRow.plan_id as string;
      const planRel = chatRow.activity_plans as { title?: string } | { title?: string }[] | null;
      const planTitle = (Array.isArray(planRel) ? planRel[0]?.title : planRel?.title) || "Group chat";

      const [{ data: senderProfile }, { data: joins, error: joinsError }] = await Promise.all([
        supabase.from("profiles").select("name").eq("id", senderId).single(),
        supabase.from("plan_joins").select("user_id").eq("plan_id", planId).neq("user_id", senderId),
      ]);

      if (joinsError) {
        console.error("❌ Error fetching plan group chat members:", joinsError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch plan group chat members" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      const uniqueRecipientIds = Array.from(
        new Set((joins || []).map((j: { user_id: string }) => j.user_id)),
      );

      if (uniqueRecipientIds.length === 0) {
        return new Response(
          JSON.stringify({ message: "No recipients for plan group chat message", sent: 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      const { data: preferenceRows, error: preferenceError } = await supabase
        .from("profiles")
        .select("id")
        .in("id", uniqueRecipientIds)
        .eq("chat_notifications_enabled", true);

      if (preferenceError) {
        console.error("❌ Error checking chat notification preferences:", preferenceError);
        return new Response(
          JSON.stringify({ error: "Failed to check chat notification preferences" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      recipientUserIds = (preferenceRows || []).map((row: { id: string }) => row.id);

      if (recipientUserIds.length === 0) {
        return new Response(
          JSON.stringify({ message: "No recipients after chat preference filter", sent: 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      const senderName = senderProfile?.name || "Someone";
      title = `${senderName} · ${planTitle}`;
      body = messageText.length > 100 ? messageText.substring(0, 100) + "..." : messageText;
      data = {
        type: "plan_group_chat_message",
        groupChatId,
        planId,
        planTitle,
        senderId,
        senderName,
        messageId: messageRecord.id,
      };

      console.log(
        `✅ Plan group chat message processed: chat=${groupChatId}, recipients=${recipientUserIds.length}`,
      );
    } else if (requestBody.type === "ready_today_check") {
      // ── Cron-triggered: send "X is ready today" pushes to activity members ──
      console.log("🟢 Processing ready_today_check");
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const todayStart = `${today}T00:00:00.000Z`;
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const { data: readyRows, error: readyError } = await supabase
        .from("user_activity_skills")
        .select(`
          id,
          user_id,
          activity_id,
          profiles!user_activity_skills_user_id_fkey ( name ),
          activities ( name, emoji )
        `)
        .eq("ready_today", true)
        .gte("ready_today_toggled_at", todayStart)
        .lte("ready_today_toggled_at", fiveMinAgo)
        .or(`ready_today_notified_date.is.null,ready_today_notified_date.lt.${today}`);

      if (readyError) {
        console.error("❌ Error fetching ready_today rows:", readyError);
        return new Response(JSON.stringify({ error: "DB error" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }

      if (!readyRows || readyRows.length === 0) {
        console.log("ℹ️ No pending ready_today notifications");
        return new Response(JSON.stringify({ message: "No pending ready_today notifications", sent: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      console.log(`✅ Found ${readyRows.length} pending ready_today row(s)`);

      // Fetch all activity members in one query
      const activityIds = [...new Set(readyRows.map((r: any) => r.activity_id))];
      const { data: allMembers } = await supabase
        .from("user_activity_skills")
        .select("user_id, activity_id")
        .in("activity_id", activityIds);

      const membersByActivity = new Map<string, string[]>();
      for (const m of (allMembers || [])) {
        const arr = membersByActivity.get(m.activity_id) ?? [];
        arr.push(m.user_id);
        membersByActivity.set(m.activity_id, arr);
      }

      // Build the set of potential recipients (exclude ready-today users themselves)
      const readyUserIds = new Set(readyRows.map((r: any) => r.user_id));
      const potentialRecipients = new Set<string>();
      for (const members of membersByActivity.values()) {
        for (const uid of members) {
          if (!readyUserIds.has(uid)) potentialRecipients.add(uid);
        }
      }

      if (potentialRecipients.size === 0) {
        return new Response(JSON.stringify({ message: "No recipients for ready_today", sent: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // Filter by notification preference
      const { data: prefRows } = await supabase
        .from("profiles")
        .select("id")
        .in("id", [...potentialRecipients])
        .eq("ready_today_notifications_enabled", true);

      const notifEnabledIds = new Set((prefRows || []).map((r: any) => r.id));

      // Get push tokens for eligible recipients
      const { data: allTokens } = await supabase
        .from("push_tokens")
        .select("user_id, expo_push_token")
        .in("user_id", [...notifEnabledIds]);

      const tokensByUser = new Map<string, string[]>();
      for (const t of (allTokens || [])) {
        const arr = tokensByUser.get(t.user_id) ?? [];
        arr.push(t.expo_push_token);
        tokensByUser.set(t.user_id, arr);
      }

      // Build all notifications (badge filled after counts are loaded)
      const readyTodayNotifs: PushNotificationPayload[] = [];
      const readyTodayRecipientIds: string[] = [];
      for (const row of readyRows) {
        const members = membersByActivity.get(row.activity_id) ?? [];
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const activity = Array.isArray(row.activities) ? row.activities[0] : row.activities;
        const userName = profile?.name ?? "Someone";
        const activityName = activity?.name ?? "Activity";
        const activityEmoji = activity?.emoji ?? "📌";

        for (const memberId of members) {
          if (memberId === row.user_id) continue;
          if (!notifEnabledIds.has(memberId)) continue;
          readyTodayRecipientIds.push(memberId);
          for (const token of (tokensByUser.get(memberId) ?? [])) {
            readyTodayNotifs.push({
              to: token,
              sound: "default",
              title: `${activityEmoji} ${activityName}`,
              body: `${userName} is ready today — join them!`,
              channelId: "default",
              priority: "high",
              data: {
                type: "ready_today",
                activityId: row.activity_id,
                activityName,
                activityEmoji,
              },
            });
          }
        }
      }

      const readyBadgeByUser = await loadBadgeCountsForUsers(supabase, readyTodayRecipientIds);
      for (const notif of readyTodayNotifs) {
        const tokenRow = (allTokens || []).find((t: { expo_push_token: string; user_id: string }) =>
          t.expo_push_token === notif.to
        );
        if (tokenRow?.user_id) {
          notif.badge = readyBadgeByUser.get(tokenRow.user_id) ?? 1;
        }
      }

      // Send in batches
      let readySentCount = 0;
      for (const batch of chunkNotifications(readyTodayNotifs, EXPO_PUSH_BATCH_SIZE)) {
        const resp = await fetch(EXPO_PUSH_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
          body: JSON.stringify(batch),
        });
        const result = await resp.json();
        readySentCount += Array.isArray(result.data) ? result.data.filter((r: any) => r.status === "ok").length : 0;
      }

      // Mark all processed rows as notified (bulk update)
      const processedIds = readyRows.map((r: any) => r.id);
      await supabase
        .from("user_activity_skills")
        .update({ ready_today_notified_date: today })
        .in("id", processedIds);

      console.log(`✅ Ready today notifications sent: ${readySentCount}`);
      return new Response(
        JSON.stringify({ message: "Ready today notifications sent", sent: readySentCount, rows: processedIds.length }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    } else if (requestBody.type === "weekly_nudge") {
      // ── Cron-triggered: weekly engagement nudge to all opted-in users ──
      // Idempotent: only the first call per Eastern calendar day may send.
      console.log("📅 Processing weekly_nudge");

      const periodKey = DateTime.now().setZone("America/New_York").toISODate() ?? "unknown";
      let claimedPeriod = false;
      const { error: claimError } = await supabase
        .from("notification_campaign_runs")
        .insert({ campaign: "weekly_nudge", period_key: periodKey });

      if (claimError) {
        if (claimError.code === "23505") {
          console.log(`ℹ️ Weekly nudge already sent for ${periodKey} — skipping`);
          return new Response(
            JSON.stringify({
              message: "Weekly nudge already sent this period",
              sent: 0,
              skipped: true,
              period_key: periodKey,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        // Table missing / RLS / etc. — still send, but log so we don't block the weekly nudge.
        console.warn("⚠️ Could not claim weekly_nudge period (continuing without lock):", claimError.message);
      } else {
        claimedPeriod = true;
      }

      try {
        const { data: users } = await supabase
          .from("profiles")
          .select("id")
          .eq("new_event_notifications_enabled", true);

        const nudgeUserIds = (users || []).map((u: any) => u.id);
        if (nudgeUserIds.length === 0) {
          if (claimedPeriod) {
            await supabase
              .from("notification_campaign_runs")
              .update({ completed_at: new Date().toISOString(), sent_count: 0 })
              .eq("campaign", "weekly_nudge")
              .eq("period_key", periodKey);
          }
          return new Response(JSON.stringify({ message: "No users for weekly nudge", sent: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        const { data: nudgeTokens } = await supabase
          .from("push_tokens")
          .select("expo_push_token, user_id")
          .in("user_id", nudgeUserIds);

        if (!nudgeTokens || nudgeTokens.length === 0) {
          if (claimedPeriod) {
            await supabase
              .from("notification_campaign_runs")
              .update({ completed_at: new Date().toISOString(), sent_count: 0 })
              .eq("campaign", "weekly_nudge")
              .eq("period_key", periodKey);
          }
          return new Response(JSON.stringify({ message: "No tokens for weekly nudge", sent: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        // One push per unique token (guards against duplicate token rows).
        const seenTokens = new Set<string>();
        const uniqueNudgeTokens = nudgeTokens.filter((t: { expo_push_token: string }) => {
          if (!t.expo_push_token || seenTokens.has(t.expo_push_token)) return false;
          seenTokens.add(t.expo_push_token);
          return true;
        });

        const nudgeBadgeByUser = await loadBadgeCountsForUsers(
          supabase,
          uniqueNudgeTokens.map((t: { user_id: string }) => t.user_id),
        );

        const collapseId = `weekly_nudge_${periodKey}`;
        const nudgeNotifs: PushNotificationPayload[] = uniqueNudgeTokens.map((t: { expo_push_token: string; user_id: string }) => ({
          to: t.expo_push_token,
          sound: "default",
          title: "Active this weekend?",
          body: "Create a plan for others to join!",
          channelId: "default",
          priority: "high",
          badge: nudgeBadgeByUser.get(t.user_id) ?? 1,
          collapseId,
          data: { type: "weekly_nudge" },
        }));

        let nudgeSentCount = 0;
        for (const batch of chunkNotifications(nudgeNotifs, EXPO_PUSH_BATCH_SIZE)) {
          const resp = await fetch(EXPO_PUSH_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
            body: JSON.stringify(batch),
          });
          const result = await resp.json();
          nudgeSentCount += Array.isArray(result.data) ? result.data.filter((r: any) => r.status === "ok").length : 0;
        }

        if (claimedPeriod) {
          await supabase
            .from("notification_campaign_runs")
            .update({ completed_at: new Date().toISOString(), sent_count: nudgeSentCount })
            .eq("campaign", "weekly_nudge")
            .eq("period_key", periodKey);
        }

        console.log(`✅ Weekly nudge sent: ${nudgeSentCount}`);
        return new Response(
          JSON.stringify({ message: "Weekly nudge sent", sent: nudgeSentCount, total: nudgeNotifs.length, period_key: periodKey }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (nudgeError) {
        // Release claim so a later retry can send if this run failed mid-flight.
        if (claimedPeriod) {
          await supabase
            .from("notification_campaign_runs")
            .delete()
            .eq("campaign", "weekly_nudge")
            .eq("period_key", periodKey);
        }
        throw nudgeError;
      }

    } else {
      // This is a direct API call (for testing)
      console.log("📞 Processing direct API call");
      ({ recipientUserId, title, body, data } = requestBody);

      if (!recipientUserId || !title || !body) {
        console.error("❌ Missing required fields:", { recipientUserId, title, body });
        return new Response(
          JSON.stringify({ error: "Missing required fields: recipientUserId, title, body" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }
    
    console.log("✅ Request validated, looking up push tokens");

    // Get recipient's push tokens
    const pushTokenQuery = supabase
      .from("push_tokens")
      .select("expo_push_token, user_id");

    const { data: pushTokens, error: tokensError } = recipientUserIds.length > 0
      ? await pushTokenQuery.in("user_id", recipientUserIds)
      : await pushTokenQuery.eq("user_id", recipientUserId);

    if (tokensError) {
      console.error("Error fetching push tokens:", tokensError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch push tokens" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!pushTokens || pushTokens.length === 0) {
      const targetLabel = recipientUserIds.length > 0
        ? `${recipientUserIds.length} users`
        : `user ${recipientUserId}`;
      console.warn(`⚠️ No push tokens found for ${targetLabel}`);
      return new Response(
        JSON.stringify({ 
          message: "No push tokens found for user(s)", 
          sent: 0,
          userId: recipientUserId,
          userIds: recipientUserIds,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const deliverableTokens = excludeUserIds.size > 0
      ? pushTokens.filter((token: { user_id?: string }) =>
        !token.user_id || !excludeUserIds.has(token.user_id)
      )
      : pushTokens;

    if (deliverableTokens.length === 0) {
      console.warn("⚠️ No push tokens after excluding sender(s)");
      return new Response(
        JSON.stringify({ message: "No push tokens after excluding sender(s)", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    
    console.log(`✅ Found ${deliverableTokens.length} push token(s) for notification`);

    const badgeByUser = skipBadgeLookup
      ? new Map<string, number>()
      : await loadBadgeCountsForUsers(
          supabase,
          deliverableTokens
            .map((token: { user_id?: string }) => token.user_id)
            .filter((id): id is string => !!id),
        );

    // Prepare notifications for all tokens (user might have multiple devices)
    const notifications: PushNotificationPayload[] = deliverableTokens.map((token: { expo_push_token: string; user_id?: string }) => ({
      to: token.expo_push_token,
      sound: "default",
      title,
      body,
      channelId: "default",
      priority: "high",
      badge: skipBadgeLookup ? 1 : (token.user_id ? (badgeByUser.get(token.user_id) ?? 1) : 1),
      data: data || {},
    }));

    // Send to Expo Push Notification API in batches
    console.log(`📤 Sending ${notifications.length} notification(s) to Expo API...`);
    let successCount = 0;
    const expoResults: any[] = [];
    for (const batch of chunkNotifications(notifications, EXPO_PUSH_BATCH_SIZE)) {
      const response = await fetch(EXPO_PUSH_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(batch),
      });

      const result = await response.json();
      console.log("📥 Expo API response:", JSON.stringify(result, null, 2));
      expoResults.push(result);

      if (!response.ok) {
        console.error("Expo API error:", result);
        return new Response(
          JSON.stringify({ error: "Failed to send push notification", details: result }),
          {
            status: response.status,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const batchSuccess = Array.isArray(result.data)
        ? result.data.filter((r: any) => r.status === "ok").length
        : 0;
      successCount += batchSuccess;
    }

    return new Response(
      JSON.stringify({
        message: "Push notifications sent",
        sent: successCount,
        total: notifications.length,
        results: expoResults,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error in send-push-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
