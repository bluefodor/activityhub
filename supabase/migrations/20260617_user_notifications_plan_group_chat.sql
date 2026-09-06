-- In-app bell notifications when someone posts in a plan group chat.

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
    'plan_join_declined',
    'plan_group_chat_message'
  ));

CREATE OR REPLACE FUNCTION public.notify_inbox_plan_group_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_plan_title text;
  v_activity_id uuid;
  v_activity_name text;
  v_activity_emoji text;
  v_sender_name text;
  v_preview text;
  v_recipient uuid;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    c.plan_id,
    COALESCE(NULLIF(trim(p.title), ''), 'Meetup'),
    p.activity_id,
    a.name,
    a.emoji
  INTO v_plan_id, v_plan_title, v_activity_id, v_activity_name, v_activity_emoji
  FROM public.plan_group_chats c
  JOIN public.activity_plans p ON p.id = c.plan_id
  LEFT JOIN public.activities a ON a.id = p.activity_id
  WHERE c.id = NEW.chat_id;

  IF v_plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_sender_name FROM public.profiles WHERE id = NEW.user_id;

  IF NEW.message_kind = 'poll' THEN
    v_preview := 'Poll';
  ELSIF NEW.image_urls IS NOT NULL AND jsonb_array_length(NEW.image_urls) > 0 THEN
    v_preview := '📷 Photo';
  ELSE
    v_preview := COALESCE(NULLIF(trim(NEW.message), ''), 'New message');
  END IF;

  IF length(v_preview) > 80 THEN
    v_preview := left(v_preview, 80) || '...';
  END IF;

  FOR v_recipient IN
    SELECT pj.user_id
    FROM public.plan_joins pj
    WHERE pj.plan_id = v_plan_id
      AND pj.user_id <> NEW.user_id
  LOOP
    INSERT INTO public.user_notifications (user_id, type, title, body, data)
    VALUES (
      v_recipient,
      'plan_group_chat_message',
      COALESCE(v_sender_name, 'Someone') || ' · ' || v_plan_title,
      v_preview,
      jsonb_build_object(
        'groupChatId', NEW.chat_id,
        'planId', v_plan_id,
        'planTitle', v_plan_title,
        'messageId', NEW.id,
        'senderId', NEW.user_id,
        'senderName', v_sender_name,
        'activityId', v_activity_id,
        'activityName', v_activity_name,
        'activityEmoji', v_activity_emoji
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plan_group_chat_messages_inbox_notify_trigger ON public.plan_group_chat_messages;
CREATE TRIGGER plan_group_chat_messages_inbox_notify_trigger
  AFTER INSERT ON public.plan_group_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_inbox_plan_group_chat_message();
