-- Reschedule plan reminder push jobs when plan date/time/timezone changes.

CREATE OR REPLACE FUNCTION public.reschedule_plan_reminder_jobs_for_plan(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p activity_plans%ROWTYPE;
  event_start timestamptz;
  run_at_1d timestamptz;
  run_at_1h timestamptz;
  tz text;
  join_row record;
BEGIN
  SELECT * INTO p FROM activity_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  tz := COALESCE(NULLIF(trim(p.event_timezone), ''), 'UTC');
  event_start := timezone(tz, (p.event_date + p.event_time));

  UPDATE plan_reminder_jobs
  SET status = 'canceled', updated_at = now()
  WHERE plan_id = p_plan_id AND status = 'pending';

  IF event_start <= now() THEN
    RETURN;
  END IF;

  run_at_1d := event_start - interval '1 day';
  run_at_1h := event_start - interval '1 hour';

  FOR join_row IN
    SELECT user_id FROM plan_joins WHERE plan_id = p_plan_id
  LOOP
    IF run_at_1d > now() THEN
      INSERT INTO plan_reminder_jobs (plan_id, user_id, job_type, run_at, event_start_at)
      VALUES (p_plan_id, join_row.user_id, '1d_before', run_at_1d, event_start);
    END IF;
    IF run_at_1h > now() THEN
      INSERT INTO plan_reminder_jobs (plan_id, user_id, job_type, run_at, event_start_at)
      VALUES (p_plan_id, join_row.user_id, '1h_before', run_at_1h, event_start);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_plan_reminder_jobs_on_plan_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_date IS DISTINCT FROM OLD.event_date
     OR NEW.event_time IS DISTINCT FROM OLD.event_time
     OR NEW.event_timezone IS DISTINCT FROM OLD.event_timezone THEN
    PERFORM public.reschedule_plan_reminder_jobs_for_plan(NEW.id);

    UPDATE plan_group_chats
    SET expires_at = ((NEW.event_date + interval '1 day')::timestamp AT TIME ZONE COALESCE(NULLIF(trim(NEW.event_timezone), ''), 'UTC'))
    WHERE plan_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_reschedule_plan_reminder_jobs_on_plan_update ON public.activity_plans;
CREATE TRIGGER trigger_reschedule_plan_reminder_jobs_on_plan_update
  AFTER UPDATE OF event_date, event_time, event_timezone ON public.activity_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.reschedule_plan_reminder_jobs_on_plan_update();

-- Backfill pending jobs from current plan times.
DO $$
DECLARE
  pid uuid;
BEGIN
  FOR pid IN SELECT DISTINCT plan_id FROM plan_reminder_jobs WHERE status = 'pending'
  LOOP
    PERFORM public.reschedule_plan_reminder_jobs_for_plan(pid);
  END LOOP;
END;
$$;
