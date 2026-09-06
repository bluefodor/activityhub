/*
  # Push notifications for plan group chat messages

  Code: supabase/functions/send-push-notification/index.ts (plan_group_chat_messages INSERT).
  In-app bell: 20260617_user_notifications_plan_group_chat.sql

  ## Required one-time setup (Supabase Dashboard)

  1. Deploy Edge Function:
       supabase functions deploy send-push-notification

  2. Database → Webhooks → Create webhook
     - Table: plan_group_chat_messages
     - Events: INSERT
     - Edge Function: send-push-notification
     - Authorization: Bearer <SERVICE_ROLE_KEY>

  Push goes to other plan members with chat_notifications_enabled = true
  (Profile → Notifications → Chat notifications).
*/

SELECT 1;
