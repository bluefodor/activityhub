-- Alerts inbox: new activity plans for users who have that activity on their profile.

ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_type_check;

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_type_check
  CHECK (type IN ('forum_mention', 'new_plan'));

CREATE OR REPLACE FUNCTION public.notify_inbox_new_activity_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_name text;
  v_activity_name text;
  v_activity_emoji text;
  v_plan_title text;
  v_recipient uuid;
BEGIN
  SELECT name INTO v_creator_name FROM public.profiles WHERE id = NEW.creator_id;
  SELECT name, emoji
  INTO v_activity_name, v_activity_emoji
  FROM public.activities
  WHERE id = NEW.activity_id;

  v_plan_title := COALESCE(NULLIF(trim(NEW.title), ''), 'Meetup');

  FOR v_recipient IN
    SELECT DISTINCT uas.user_id
    FROM public.user_activity_skills uas
    WHERE uas.activity_id = NEW.activity_id
      AND uas.user_id IS DISTINCT FROM NEW.creator_id
  LOOP
    INSERT INTO public.user_notifications (user_id, type, title, body, data)
    VALUES (
      v_recipient,
      'new_plan',
      COALESCE(v_creator_name, 'Someone') || ' created a plan',
      COALESCE(v_activity_name, 'Activity') || ' · ' || v_plan_title,
      jsonb_build_object(
        'planId', NEW.id,
        'activityId', NEW.activity_id,
        'activityName', v_activity_name,
        'activityEmoji', v_activity_emoji,
        'creatorId', NEW.creator_id,
        'creatorName', v_creator_name,
        'planTitle', v_plan_title
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activity_plans_inbox_notify_trigger ON public.activity_plans;
CREATE TRIGGER activity_plans_inbox_notify_trigger
  AFTER INSERT ON public.activity_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_inbox_new_activity_plan();
