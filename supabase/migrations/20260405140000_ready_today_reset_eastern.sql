/*
  Optional pg_cron cleanup. The app stores ready_today_date using each user’s device-local
  calendar day; this server job cannot match every user’s midnight. It only clears rows whose
  stored date is before “today” in America/New_York as a coarse sweep. Client-side reset in
  useProfile remains authoritative for each user.

  Replaces the older "clear every row with ready_today = true at UTC midnight" behavior.
*/

CREATE OR REPLACE FUNCTION reset_ready_today_daily()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eastern_today text;
BEGIN
  eastern_today := to_char((now() AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD');

  UPDATE user_activity_skills
  SET ready_today = false,
      ready_today_date = NULL
  WHERE ready_today_date IS NOT NULL
    AND ready_today_date < eastern_today;
END;
$$;
