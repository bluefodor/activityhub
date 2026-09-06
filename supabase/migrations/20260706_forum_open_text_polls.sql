-- Open-text forum polls: everyone writes their own answer (one per user).

ALTER TABLE public.forum_polls
  ADD COLUMN IF NOT EXISTS poll_style text NOT NULL DEFAULT 'choice'
  CHECK (poll_style IN ('choice', 'open_text'));

ALTER TABLE public.forum_polls
  ADD COLUMN IF NOT EXISTS response_count int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.forum_polls.poll_style IS
  'choice = pick from predefined options; open_text = each member submits free-text answer';

CREATE TABLE IF NOT EXISTS public.forum_poll_text_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.forum_polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id),
  CONSTRAINT forum_poll_text_responses_nonempty CHECK (length(trim(response_text)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_forum_poll_text_responses_poll_id
  ON public.forum_poll_text_responses(poll_id);

CREATE OR REPLACE FUNCTION public.forum_poll_text_response_touch_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE forum_polls SET response_count = response_count + 1 WHERE id = NEW.poll_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE forum_polls SET response_count = GREATEST(0, response_count - 1) WHERE id = OLD.poll_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS forum_poll_text_response_touch_insert ON public.forum_poll_text_responses;
DROP TRIGGER IF EXISTS forum_poll_text_response_touch_delete ON public.forum_poll_text_responses;
CREATE TRIGGER forum_poll_text_response_touch_insert
  AFTER INSERT ON public.forum_poll_text_responses
  FOR EACH ROW EXECUTE PROCEDURE public.forum_poll_text_response_touch_count();
CREATE TRIGGER forum_poll_text_response_touch_delete
  AFTER DELETE ON public.forum_poll_text_responses
  FOR EACH ROW EXECUTE PROCEDURE public.forum_poll_text_response_touch_count();

CREATE OR REPLACE FUNCTION public.create_forum_open_text_poll(
  p_activity_id uuid,
  p_question text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id uuid;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_question IS NULL OR length(trim(p_question)) < 1 OR length(p_question) > 500 THEN
    RAISE EXCEPTION 'Invalid question';
  END IF;

  INSERT INTO forum_messages (activity_id, user_id, message, message_kind, image_urls, reply_to_id)
  VALUES (p_activity_id, v_user, '', 'poll', ARRAY[]::text[], NULL)
  RETURNING id INTO v_message_id;

  INSERT INTO forum_polls (
    activity_id, message_id, question, allow_multiple_selection, created_by, poll_style
  )
  VALUES (p_activity_id, v_message_id, trim(p_question), false, v_user, 'open_text');

  RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_forum_open_text_poll(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_forum_open_text_poll(uuid, text) TO authenticated;

ALTER TABLE public.forum_poll_text_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read forum poll text responses" ON public.forum_poll_text_responses;
CREATE POLICY "Authenticated can read forum poll text responses"
  ON public.forum_poll_text_responses FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert own forum poll text responses" ON public.forum_poll_text_responses;
CREATE POLICY "Authenticated can insert own forum poll text responses"
  ON public.forum_poll_text_responses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated can update own forum poll text responses" ON public.forum_poll_text_responses;
CREATE POLICY "Authenticated can update own forum poll text responses"
  ON public.forum_poll_text_responses FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated can delete own forum poll text responses" ON public.forum_poll_text_responses;
CREATE POLICY "Authenticated can delete own forum poll text responses"
  ON public.forum_poll_text_responses FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
