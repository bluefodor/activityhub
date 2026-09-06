/*
  # Add meetup notification jobs for server-side push reminders

  - Adds event_timezone to meetup_invites
  - Creates meetup_notification_jobs table
  - Adds trigger to schedule/cancel jobs on invite changes
*/

ALTER TABLE meetup_invites
  ADD COLUMN IF NOT EXISTS event_timezone text NOT NULL DEFAULT 'UTC';

CREATE TABLE IF NOT EXISTS meetup_notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES meetup_invites(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  run_at timestamptz NOT NULL,
  event_start_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT meetup_notification_jobs_type_check CHECK (
    job_type IN ('invite_reminder', 'accepted_reminder_3h', 'accepted_reminder_5m')
  ),
  CONSTRAINT meetup_notification_jobs_status_check CHECK (
    status IN ('pending', 'sent', 'canceled', 'error', 'skipped')
  )
);

CREATE INDEX IF NOT EXISTS meetup_notification_jobs_status_run_at_idx
  ON meetup_notification_jobs(status, run_at);

CREATE INDEX IF NOT EXISTS meetup_notification_jobs_invite_id_idx
  ON meetup_notification_jobs(invite_id);

CREATE OR REPLACE FUNCTION schedule_meetup_notification_jobs()
RETURNS TRIGGER AS $$
DECLARE
  event_start timestamptz;
  tz text;
  run_at_3h timestamptz;
  run_at_5m timestamptz;
BEGIN
  tz := COALESCE(NEW.event_timezone, 'UTC');
  event_start := timezone(tz, (NEW.event_date + NEW.event_time));
  run_at_3h := event_start - interval '3 hours';
  run_at_5m := event_start - interval '5 minutes';

  -- Clear pending jobs for this invite (reschedule on updates)
  DELETE FROM meetup_notification_jobs
    WHERE invite_id = NEW.id
      AND status = 'pending';

  IF NEW.status = 'pending' THEN
    IF run_at_3h > now() THEN
      INSERT INTO meetup_notification_jobs (
        invite_id,
        recipient_id,
        sender_id,
        job_type,
        run_at,
        event_start_at
      ) VALUES (
        NEW.id,
        NEW.recipient_id,
        NEW.sender_id,
        'invite_reminder',
        run_at_3h,
        event_start
      );
    END IF;
  ELSIF NEW.status = 'accepted' THEN
    IF run_at_3h > now() THEN
      INSERT INTO meetup_notification_jobs (
        invite_id,
        recipient_id,
        sender_id,
        job_type,
        run_at,
        event_start_at
      ) VALUES (
        NEW.id,
        NEW.recipient_id,
        NEW.sender_id,
        'accepted_reminder_3h',
        run_at_3h,
        event_start
      );
    END IF;

    IF run_at_5m > now() THEN
      INSERT INTO meetup_notification_jobs (
        invite_id,
        recipient_id,
        sender_id,
        job_type,
        run_at,
        event_start_at
      ) VALUES (
        NEW.id,
        NEW.recipient_id,
        NEW.sender_id,
        'accepted_reminder_5m',
        run_at_5m,
        event_start
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_schedule_meetup_notification_jobs'
  ) THEN
    CREATE TRIGGER trigger_schedule_meetup_notification_jobs
      AFTER INSERT OR UPDATE ON meetup_invites
      FOR EACH ROW
      EXECUTE FUNCTION schedule_meetup_notification_jobs();
  END IF;
END $$;
