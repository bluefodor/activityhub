-- Ready Today push notifications + weekly engagement nudge
--
-- REQUIRED ONE-TIME SETUP before running this migration:
-- In the Supabase SQL Editor, run:
--   ALTER DATABASE postgres SET "app.settings.service_role_key" = 'your_service_role_key';
-- (Find your service role key in Supabase Dashboard → Settings → API)
--
-- Also ensure the pg_net extension is enabled:
--   CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── 1. Tracking columns on user_activity_skills ──────────────────────────────

ALTER TABLE public.user_activity_skills
  ADD COLUMN IF NOT EXISTS ready_today_toggled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS ready_today_notified_date date;

-- ─── 2. Trigger: stamp toggled_at when ready_today flips to true ──────────────
--    Also clears notified_date so re-toggling the same day re-sends.

CREATE OR REPLACE FUNCTION public.fn_ready_today_toggle_track()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ready_today = true AND (OLD.ready_today IS DISTINCT FROM true) THEN
    NEW.ready_today_toggled_at  := now();
    NEW.ready_today_notified_date := NULL;
  ELSIF NEW.ready_today = false THEN
    NEW.ready_today_toggled_at  := NULL;
    -- Leave notified_date alone so toggling off/on doesn't immediately re-notify.
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ready_today_toggle_track ON public.user_activity_skills;
CREATE TRIGGER trg_ready_today_toggle_track
  BEFORE UPDATE ON public.user_activity_skills
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_ready_today_toggle_track();

-- ─── 3. pg_cron: Ready Today push — every 5 minutes ──────────────────────────
--    Calls the edge function which does the heavy lifting (token lookup, Expo API).
--    The function short-circuits immediately if there are no pending rows.

SELECT cron.unschedule('ready-today-push-notifications')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'ready-today-push-notifications'
);

SELECT cron.schedule(
  'ready-today-push-notifications',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://krhmxspcxymovgorumqw.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body    := '{"type":"ready_today_check"}'::jsonb
  ) AS request_id;
  $$
);

-- ─── 4. pg_cron: Weekly engagement nudge — Thursday 6 pm ET (22:00 UTC) ────────
--    Thursday evening is when people plan their weekend activities.

SELECT cron.unschedule('weekly-engagement-nudge')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-engagement-nudge'
);

SELECT cron.schedule(
  'weekly-engagement-nudge',
  '0 22 * * 4',
  $$
  SELECT net.http_post(
    url     := 'https://krhmxspcxymovgorumqw.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body    := '{"type":"weekly_nudge"}'::jsonb
  ) AS request_id;
  $$
);
