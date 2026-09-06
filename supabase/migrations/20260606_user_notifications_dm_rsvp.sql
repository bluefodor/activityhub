-- In-app alerts inbox: direct messages and plan RSVP host-approval flows.

ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_type_check;

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_type_check
  CHECK (type IN (
    'forum_mention',
    'new_plan',
    'direct_message',
    'plan_join_request',
    'plan_join_approved',
    'plan_join_declined'
  ));

CREATE OR REPLACE FUNCTION public.notify_inbox_direct_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_sender_name text;
  v_preview text;
BEGIN
  SELECT
    CASE
      WHEN c.participant_1 = NEW.sender_id THEN c.participant_2
      ELSE c.participant_1
    END
  INTO v_recipient
  FROM public.chats c
  WHERE c.id = NEW.chat_id;

  IF v_recipient IS NULL OR v_recipient = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_sender_name FROM public.profiles WHERE id = NEW.sender_id;

  v_preview := COALESCE(NULLIF(trim(NEW.message), ''), '📷 Photo');
  IF length(v_preview) > 80 THEN
    v_preview := left(v_preview, 80) || '...';
  END IF;

  INSERT INTO public.user_notifications (user_id, type, title, body, data)
  VALUES (
    v_recipient,
    'direct_message',
    COALESCE(v_sender_name, 'Someone') || ' sent you a message',
    v_preview,
    jsonb_build_object(
      'chatId', NEW.chat_id,
      'messageId', NEW.id,
      'otherUserId', NEW.sender_id,
      'senderName', v_sender_name
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_inbox_plan_join_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host uuid;
  v_activity_id uuid;
  v_requester_name text;
  v_plan_title text;
  v_activity_name text;
  v_activity_emoji text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT
    p.creator_id,
    p.activity_id,
    COALESCE(NULLIF(trim(p.title), ''), 'Meetup'),
    a.name,
    a.emoji
  INTO v_host, v_activity_id, v_plan_title, v_activity_name, v_activity_emoji
  FROM public.activity_plans p
  LEFT JOIN public.activities a ON a.id = p.activity_id
  WHERE p.id = NEW.plan_id;

  IF v_host IS NULL OR v_host = NEW.requester_id THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_requester_name FROM public.profiles WHERE id = NEW.requester_id;

  INSERT INTO public.user_notifications (user_id, type, title, body, data)
  VALUES (
    v_host,
    'plan_join_request',
    COALESCE(v_requester_name, 'Someone') || ' requested to join',
    COALESCE(v_activity_name, 'Plan') || ' · ' || v_plan_title,
    jsonb_build_object(
      'requestId', NEW.id,
      'planId', NEW.plan_id,
      'activityId', v_activity_id,
      'activityName', v_activity_name,
      'activityEmoji', v_activity_emoji,
      'requesterId', NEW.requester_id,
      'requesterName', v_requester_name,
      'planTitle', v_plan_title
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_inbox_plan_join_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host_name text;
  v_activity_id uuid;
  v_plan_title text;
  v_activity_name text;
  v_activity_emoji text;
  v_notif_type text;
  v_title text;
BEGIN
  IF OLD.status <> 'pending' OR NEW.status NOT IN ('approved', 'declined') THEN
    RETURN NEW;
  END IF;

  SELECT
    pr.name,
    p.activity_id,
    COALESCE(NULLIF(trim(p.title), ''), 'Meetup'),
    a.name,
    a.emoji
  INTO v_host_name, v_activity_id, v_plan_title, v_activity_name, v_activity_emoji
  FROM public.activity_plans p
  LEFT JOIN public.profiles pr ON pr.id = p.creator_id
  LEFT JOIN public.activities a ON a.id = p.activity_id
  WHERE p.id = NEW.plan_id;

  IF NEW.status = 'approved' THEN
    v_notif_type := 'plan_join_approved';
    v_title := COALESCE(v_host_name, 'The host') || ' approved your request';
  ELSE
    v_notif_type := 'plan_join_declined';
    v_title := COALESCE(v_host_name, 'The host') || ' declined your request';
  END IF;

  INSERT INTO public.user_notifications (user_id, type, title, body, data)
  VALUES (
    NEW.requester_id,
    v_notif_type,
    v_title,
    COALESCE(v_activity_name, 'Plan') || ' · ' || v_plan_title,
    jsonb_build_object(
      'requestId', NEW.id,
      'planId', NEW.plan_id,
      'activityId', v_activity_id,
      'activityName', v_activity_name,
      'activityEmoji', v_activity_emoji,
      'hostId', (SELECT creator_id FROM public.activity_plans WHERE id = NEW.plan_id),
      'hostName', v_host_name,
      'planTitle', v_plan_title
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_inbox_notify_trigger ON public.chat_messages;
CREATE TRIGGER chat_messages_inbox_notify_trigger
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_inbox_direct_message();

DROP TRIGGER IF EXISTS plan_join_requests_inbox_request_trigger ON public.plan_join_requests;
CREATE TRIGGER plan_join_requests_inbox_request_trigger
  AFTER INSERT OR UPDATE OF status ON public.plan_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_inbox_plan_join_request();

DROP TRIGGER IF EXISTS plan_join_requests_inbox_response_trigger ON public.plan_join_requests;
CREATE TRIGGER plan_join_requests_inbox_response_trigger
  AFTER UPDATE OF status ON public.plan_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_inbox_plan_join_response();
