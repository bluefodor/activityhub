/*
  # Plan reminder notifications for plans the user has joined

  - plan_reminder_jobs: scheduled push reminders (1 day before, 1 hour before)
  - plan_reminder_notifications_enabled on profiles
  - Trigger on plan_joins INSERT: schedule jobs for that user+plan
  - Trigger on plan_joins DELETE: cancel pending jobs for that user+plan
*/

-- Preference: users can turn off plan reminder pushes
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_reminder_notifications_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN profiles.plan_reminder_notifications_enabled IS
  'When true, user receives push reminders for plans they have joined (1 day and 1 hour before).';

-- Jobs table (run by cron → process-plan-reminders Edge Function)
CREATE TABLE IF NOT EXISTS plan_reminder_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES activity_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  run_at timestamptz NOT NULL,
  event_start_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT plan_reminder_jobs_type_check CHECK (
    job_type IN ('1d_before', '1h_before')
  ),
  CONSTRAINT plan_reminder_jobs_status_check CHECK (
    status IN ('pending', 'sent', 'canceled', 'error', 'skipped')
  )
);

CREATE INDEX IF NOT EXISTS idx_plan_reminder_jobs_status_run_at
  ON plan_reminder_jobs(status, run_at);

CREATE INDEX IF NOT EXISTS idx_plan_reminder_jobs_plan_id
  ON plan_reminder_jobs(plan_id);

CREATE INDEX IF NOT EXISTS idx_plan_reminder_jobs_user_id
  ON plan_reminder_jobs(user_id);

ALTER TABLE plan_reminder_jobs ENABLE ROW LEVEL SECURITY;

-- Service role / cron will process jobs; app doesn't need to read/write jobs directly
CREATE POLICY "Allow service role full access to plan_reminder_jobs"
  ON plan_reminder_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Schedule reminder jobs when a user joins a plan
CREATE OR REPLACE FUNCTION schedule_plan_reminder_jobs()
RETURNS TRIGGER AS $$
DECLARE
  p activity_plans%ROWTYPE;
  event_start timestamptz;
  run_at_1d timestamptz;
  run_at_1h timestamptz;
  tz text;
BEGIN
  SELECT * INTO p FROM activity_plans WHERE id = NEW.plan_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  tz := COALESCE(NULLIF(trim(p.event_timezone), ''), 'UTC');
  event_start := timezone(tz, (p.event_date + p.event_time));

  -- Event already in the past: no jobs
  IF event_start <= now() THEN
    RETURN NEW;
  END IF;

  run_at_1d := event_start - interval '1 day';
  run_at_1h := event_start - interval '1 hour';

  IF run_at_1d > now() THEN
    INSERT INTO plan_reminder_jobs (plan_id, user_id, job_type, run_at, event_start_at)
    VALUES (NEW.plan_id, NEW.user_id, '1d_before', run_at_1d, event_start);
  END IF;

  IF run_at_1h > now() THEN
    INSERT INTO plan_reminder_jobs (plan_id, user_id, job_type, run_at, event_start_at)
    VALUES (NEW.plan_id, NEW.user_id, '1h_before', run_at_1h, event_start);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_schedule_plan_reminder_jobs ON plan_joins;
CREATE TRIGGER trigger_schedule_plan_reminder_jobs
  AFTER INSERT ON plan_joins
  FOR EACH ROW
  EXECUTE FUNCTION schedule_plan_reminder_jobs();

-- Cancel pending jobs when user leaves a plan
CREATE OR REPLACE FUNCTION cancel_plan_reminder_jobs_on_leave()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE plan_reminder_jobs
  SET status = 'canceled', updated_at = now()
  WHERE plan_id = OLD.plan_id AND user_id = OLD.user_id AND status = 'pending';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_cancel_plan_reminder_jobs_on_leave ON plan_joins;
CREATE TRIGGER trigger_cancel_plan_reminder_jobs_on_leave
  AFTER DELETE ON plan_joins
  FOR EACH ROW
  EXECUTE FUNCTION cancel_plan_reminder_jobs_on_leave();
