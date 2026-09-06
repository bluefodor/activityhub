/*
  # Daily reset of ready_today for everyone (end of day)

  Runs at 00:00 UTC every day and sets ready_today = false for all users.
  Requires pg_cron extension (enable in Supabase Dashboard: Database > Extensions > pg_cron).

  Optional: if you prefer per-user reset only when they open the app the next day,
  you can skip or revert this migration.
*/

CREATE OR REPLACE FUNCTION reset_ready_today_daily()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_activity_skills
  SET ready_today = false
  WHERE ready_today = true;
END;
$$;

-- Schedule daily at midnight UTC (minute hour day month dow)
SELECT cron.schedule(
  'reset-ready-today-daily',
  '0 0 * * *',
  'SELECT reset_ready_today_daily();'
);
