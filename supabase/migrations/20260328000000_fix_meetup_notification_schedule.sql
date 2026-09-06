/*
  # Fix meetup notification schedule

  Aligns private-invite notifications with product behavior:
  - immediate notification when invite is created
  - reminders 1 day and 1 hour before accepted meetups
  - resyncs pending jobs that were created under the old 3-hour / 5-minute schedule
*/

ALTER TABLE meetup_notification_jobs
  DROP CONSTRAINT IF EXISTS meetup_notification_jobs_type_check;

UPDATE meetup_notification_jobs
SET
  job_type = CASE
    WHEN job_type = 'accepted_reminder_3h' THEN 'accepted_reminder_1d'
    WHEN job_type = 'accepted_reminder_5m' THEN 'accepted_reminder_1h'
    ELSE job_type
  END,
  run_at = CASE
    WHEN job_type = 'accepted_reminder_3h' THEN event_start_at - interval '1 day'
    WHEN job_type = 'accepted_reminder_5m' THEN event_start_at - interval '1 hour'
    ELSE run_at
  END,
  status = CASE
    WHEN job_type = 'accepted_reminder_3h' AND status = 'pending' AND event_start_at - interval '1 day' <= now() THEN 'canceled'
    WHEN job_type = 'accepted_reminder_5m' AND status = 'pending' AND event_start_at - interval '1 hour' <= now() THEN 'canceled'
    ELSE status
  END,
  updated_at = now()
WHERE job_type IN ('accepted_reminder_3h', 'accepted_reminder_5m');

ALTER TABLE meetup_notification_jobs
  ADD CONSTRAINT meetup_notification_jobs_type_check CHECK (
    job_type IN ('invite_created', 'invite_reminder', 'accepted_reminder_1d', 'accepted_reminder_1h')
  );

CREATE OR REPLACE FUNCTION schedule_meetup_notification_jobs()
RETURNS TRIGGER AS $$
DECLARE
  event_start timestamptz;
  tz text;
  run_at_1d timestamptz;
  run_at_1h timestamptz;
BEGIN
  IF NEW.event_date IS NULL OR NEW.event_time IS NULL THEN
    RETURN NEW;
  END IF;

  tz := COALESCE(NULLIF(trim(NEW.event_timezone), ''), 'UTC');
  event_start := timezone(tz, (NEW.event_date + NEW.event_time));

  DELETE FROM meetup_notification_jobs
    WHERE invite_id = NEW.id
      AND status = 'pending';

  IF event_start <= now() THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'pending' THEN
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
      'invite_created',
      now(),
      event_start
    );
  ELSIF NEW.status = 'accepted' THEN
    run_at_1d := event_start - interval '1 day';
    run_at_1h := event_start - interval '1 hour';

    IF run_at_1d > now() THEN
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
        'accepted_reminder_1d',
        run_at_1d,
        event_start
      );
    END IF;

    IF run_at_1h > now() THEN
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
        'accepted_reminder_1h',
        run_at_1h,
        event_start
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DELETE FROM meetup_notification_jobs
WHERE status = 'pending';

INSERT INTO meetup_notification_jobs (
  invite_id,
  recipient_id,
  sender_id,
  job_type,
  run_at,
  event_start_at
)
SELECT
  i.id,
  i.recipient_id,
  i.sender_id,
  'invite_created',
  now(),
  timezone(COALESCE(NULLIF(trim(i.event_timezone), ''), 'UTC'), (i.event_date + i.event_time))
FROM meetup_invites i
WHERE i.status = 'pending'
  AND i.event_date IS NOT NULL
  AND i.event_time IS NOT NULL
  AND timezone(COALESCE(NULLIF(trim(i.event_timezone), ''), 'UTC'), (i.event_date + i.event_time)) > now();

INSERT INTO meetup_notification_jobs (
  invite_id,
  recipient_id,
  sender_id,
  job_type,
  run_at,
  event_start_at
)
SELECT
  i.id,
  i.recipient_id,
  i.sender_id,
  'accepted_reminder_1d',
  timezone(COALESCE(NULLIF(trim(i.event_timezone), ''), 'UTC'), (i.event_date + i.event_time)) - interval '1 day',
  timezone(COALESCE(NULLIF(trim(i.event_timezone), ''), 'UTC'), (i.event_date + i.event_time))
FROM meetup_invites i
WHERE i.status = 'accepted'
  AND i.event_date IS NOT NULL
  AND i.event_time IS NOT NULL
  AND timezone(COALESCE(NULLIF(trim(i.event_timezone), ''), 'UTC'), (i.event_date + i.event_time)) - interval '1 day' > now();

INSERT INTO meetup_notification_jobs (
  invite_id,
  recipient_id,
  sender_id,
  job_type,
  run_at,
  event_start_at
)
SELECT
  i.id,
  i.recipient_id,
  i.sender_id,
  'accepted_reminder_1h',
  timezone(COALESCE(NULLIF(trim(i.event_timezone), ''), 'UTC'), (i.event_date + i.event_time)) - interval '1 hour',
  timezone(COALESCE(NULLIF(trim(i.event_timezone), ''), 'UTC'), (i.event_date + i.event_time))
FROM meetup_invites i
WHERE i.status = 'accepted'
  AND i.event_date IS NOT NULL
  AND i.event_time IS NOT NULL
  AND timezone(COALESCE(NULLIF(trim(i.event_timezone), ''), 'UTC'), (i.event_date + i.event_time)) - interval '1 hour' > now();
