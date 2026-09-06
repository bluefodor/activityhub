-- Add invite_created job type on invite creation
-- Schedules immediate push for new invites

CREATE OR REPLACE FUNCTION schedule_meetup_notification_jobs()
RETURNS trigger AS $$
DECLARE
  event_start timestamptz;
  run_at_3h timestamptz;
  run_at_5m timestamptz;
BEGIN
  IF NEW.event_date IS NULL OR NEW.event_time IS NULL THEN
    RETURN NEW;
  END IF;

  event_start := (NEW.event_date::text || ' ' || NEW.event_time::text)::timestamptz;

  -- Immediate invite notification for pending invites
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
  END IF;

  -- Accepted reminders
  IF NEW.status = 'accepted' THEN
    run_at_3h := event_start - interval '3 hours';
    run_at_5m := event_start - interval '5 minutes';

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

