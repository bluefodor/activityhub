-- In-app notification inbox (forum @mentions first).

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('forum_mention', 'new_plan')),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
  ON public.user_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_notifications_user_unread_idx
  ON public.user_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.user_notifications;
CREATE POLICY "Users read own notifications"
  ON public.user_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.user_notifications;
CREATE POLICY "Users update own notifications"
  ON public.user_notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Inserts only via SECURITY DEFINER RPC (sender must own the forum message).

CREATE OR REPLACE FUNCTION public.create_forum_mention_notifications(
  p_message_id uuid,
  p_mentioned_user_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg public.forum_messages%ROWTYPE;
  v_sender_name text;
  v_activity_name text;
  v_activity_emoji text;
  v_uid uuid;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_msg FROM public.forum_messages WHERE id = p_message_id;
  IF NOT FOUND OR v_msg.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_mentioned_user_ids IS NULL OR array_length(p_mentioned_user_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT name INTO v_sender_name FROM public.profiles WHERE id = v_msg.user_id;
  SELECT name, emoji INTO v_activity_name, v_activity_emoji
  FROM public.activities WHERE id = v_msg.activity_id;

  FOREACH v_uid IN ARRAY p_mentioned_user_ids
  LOOP
    IF v_uid IS NULL OR v_uid = v_msg.user_id THEN
      CONTINUE;
    END IF;

    INSERT INTO public.user_notifications (user_id, type, title, body, data)
    VALUES (
      v_uid,
      'forum_mention',
      COALESCE(v_sender_name, 'Someone') || ' mentioned you',
      COALESCE(v_activity_name, 'Forum'),
      jsonb_build_object(
        'messageId', p_message_id,
        'activityId', v_msg.activity_id,
        'activityName', v_activity_name,
        'activityEmoji', v_activity_emoji,
        'senderId', v_msg.user_id,
        'senderName', v_sender_name
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_forum_mention_notifications(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_forum_mention_notifications(uuid, uuid[]) TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
