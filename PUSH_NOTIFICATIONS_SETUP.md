# Push Notifications Setup Guide

This guide will help you set up push notifications for your app so messages work even when the app is closed.

## Why in-app toggles can be “on” but nothing arrives

From the codebase, there are **two separate paths**:

1. **Real-time (chat, forum, new public plans)**  
   Inserts into `chat_messages`, `forum_messages`, or `activity_plans` do **not** call the Edge Function by themselves. The migration trigger `prepare_push_notification` only runs SQL and returns; it does **not** send HTTP.  
   **Delivery requires [Database Webhooks](https://supabase.com/docs/guides/database/webhooks)** in the Supabase Dashboard that POST the webhook payload to `send-push-notification`. If those webhooks are missing or misconfigured, **no push is sent** even when messages/plans appear in the app.

2. **Scheduled (plan reminders, meetup invite notifications)**  
   Rows are written to `plan_reminder_jobs` and `meetup_notification_jobs` by database triggers. The Edge Functions `process-plan-reminders` and `process-meetup-notifications` **must be invoked on a schedule** (Supabase **Cron** on the function, or an external cron `curl`).  
   **Without a schedule, those jobs never run** — this is not a user settings issue.

**Cron is not required** for chat/forum/new-plan pushes; **webhooks are**. **Cron (or similar) is required** for reminder/meetup job processors.

## Prerequisites

- Supabase account (you already have this)
- Expo account (you already have this)
- Supabase CLI installed (for deploying Edge Functions)

## Step 1: Run Database Migrations

Run the migration files in your Supabase dashboard:

1. Go to Supabase Dashboard > SQL Editor
2. Run `supabase/migrations/20260103000000_add_push_tokens.sql`
3. Run `supabase/migrations/20260103000001_add_push_notification_trigger.sql`

Or use Supabase CLI:
```bash
supabase db push
```

## Step 2: Deploy Edge Function

1. Install Supabase CLI if you haven't:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. Deploy the function:
   ```bash
   supabase functions deploy send-push-notification
   ```

## Step 3: Set Up Database Webhook (Chat Messages)

1. Go to Supabase Dashboard > Database > Webhooks
2. Click "Create a new webhook"
3. Configure:
   - **Name**: Send Push Notification
   - **Table**: `chat_messages`
   - **Events**: INSERT
   - **HTTP Request**
     - **URL**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push-notification`
     - **Method**: POST
     - **Headers**:
       ```
       Authorization: Bearer YOUR_SERVICE_ROLE_KEY
       Content-Type: application/json
       ```
     - **Request Body** (Advanced):
       ```json
       {
         "recipientUserId": "{{(SELECT CASE WHEN participant_1 = new.sender_id THEN participant_2 ELSE participant_1 END FROM chats WHERE id = new.chat_id)}}",
         "title": "New message from {{(SELECT name FROM profiles WHERE id = new.sender_id)}}",
         "body": "{{new.message || '📷 Photo'}}",
         "data": {
           "type": "new_message",
           "chatId": "{{new.chat_id}}",
           "otherUserId": "{{new.sender_id}}"
         }
       }
       ```

**Note**: The webhook body syntax above is simplified. You may need to use Supabase's webhook transformation feature or create a simpler webhook that calls a database function.

## Step 4: Set Up Database Webhook (Forum Messages)

1. Go to Supabase Dashboard > Database > Webhooks
2. Click "Create a new webhook"
3. Configure:
   - **Name**: Send Forum Push Notification
   - **Table**: `forum_messages`
   - **Events**: INSERT
   - **HTTP Request**
     - **URL**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push-notification`
     - **Method**: POST
     - **Headers**:
       ```
       Authorization: Bearer YOUR_SERVICE_ROLE_KEY
       Content-Type: application/json
       ```
     - **Request Body** (Advanced): leave empty (Edge Function can parse the webhook payload)

## Step 5: Alternative - Use pg_net Extension

If your Supabase project has the `pg_net` extension enabled, you can use the trigger-based approach instead of webhooks.

1. Enable pg_net extension in Supabase Dashboard > Database > Extensions
2. The trigger in the migration will automatically work

**Note:** As shipped, the migration trigger does not perform `pg_net` HTTP calls; you still need either Dashboard webhooks or custom SQL using `pg_net` to POST to the Edge Function.

## Step 5b: Set Up Database Webhook (New activity plan / “new event”)

When someone creates a plan, other people with that activity should get a push. The Edge Function handles `activity_plans` INSERT payloads (same shape as other webhooks).

1. Database → Webhooks → Create webhook  
2. **Table**: `activity_plans`  
3. **Events**: INSERT  
4. **URL**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push-notification`  
5. **Method**: POST  
6. **Headers**: `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`, `Content-Type: application/json`  
7. **Request body**: leave default / empty so the full webhook JSON is sent (the function reads `type`, `table`, `record`).

## Step 5d: Set Up Database Webhook (Plan group chat messages)

Plan group chats have **two** notification paths in code:

| Path | Setup | What it does |
|------|--------|--------------|
| **In-app bell** | Migration `20260617_user_notifications_plan_group_chat.sql` (run with `supabase db push`) | Inserts `user_notifications` rows automatically on every group chat message |
| **Push (app closed)** | Dashboard webhook below + deployed `send-push-notification` | Sends Expo push to other plan members with **Chat notifications** enabled |

To enable **push** for plan group chats:

1. Database → Webhooks → Create webhook  
2. **Table**: `plan_group_chat_messages`  
3. **Events**: INSERT  
4. **URL**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push-notification`  
5. **Method**: POST  
6. **Headers**: `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`, `Content-Type: application/json`  
7. **Request body**: leave default / empty (Edge Function handles `type`, `table`, `record`).

See also `supabase/migrations/20260618_plan_group_chat_push_webhook.sql`.

## Step 5c: Schedule job processors (plan reminders & meetups)

These are **not** triggered by webhooks; they poll job tables:

| Edge Function | Purpose |
|---------------|---------|
| `process-plan-reminders` | Sends 1-day / 1-hour plan reminders (`plan_reminder_jobs`) |
| `process-meetup-notifications` | Sends meetup-related pushes (`meetup_notification_jobs`) |

Deploy both, then in **Supabase Dashboard → Edge Functions → [function] → Cron**, add a schedule (e.g. every 15 minutes), **or** call them from external cron. See `supabase/functions/process-plan-reminders/README.md`.

## Step 6: Test

1. Build and install the app on a device
2. Log in with two different accounts
3. Send a message from one account to the other
4. Close the receiving app completely
5. The message should trigger a push notification

## Troubleshooting

### Push tokens not being stored
- Check that the `push_tokens` table was created
- Check app logs for errors when registering tokens
- Verify user is logged in when token is registered

### Notifications not being sent
- Check Edge Function logs in Supabase Dashboard
- Verify webhook is configured correctly
- Check that push tokens exist for the recipient user
- Verify Expo Push Token is valid

### Edge Function deployment fails
- Make sure you're logged in: `supabase login`
- Verify project is linked: `supabase projects list`
- Check that you have the correct permissions

## How It Works

1. **User logs in** → App gets Expo push token → Stores in `push_tokens` table
2. **User sends message** → Message inserted into `chat_messages` table
3. **Database webhook** (Dashboard) POSTs to Edge Function `send-push-notification` (the SQL trigger does not send HTTP by itself)
4. **Edge Function** → Looks up recipient's push tokens → Sends to Expo API
5. **Expo** → Delivers notification to device (even if app is closed)

## Cost

- **Supabase Edge Functions**: Free tier includes 500,000 invocations/month
- **Expo Push Notifications**: Free, unlimited
- **Total**: $0 for most apps
