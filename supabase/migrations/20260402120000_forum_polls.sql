/*
  Forum polls: threaded poll messages with public counts, auth-only voter detail.

  - Anyone (anon + authenticated) can read polls and option vote_count.
  - Only authenticated users can vote; votes table SELECT is authenticated-only.
*/

-- Message discriminator (existing rows = text)
ALTER TABLE forum_messages
  ADD COLUMN IF NOT EXISTS message_kind text NOT NULL DEFAULT 'text'
  CHECK (message_kind IN ('text', 'poll'));

COMMENT ON COLUMN forum_messages.message_kind IS 'text = normal message; poll = carries forum_polls row';

CREATE TABLE IF NOT EXISTS public.forum_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.forum_messages(id) ON DELETE CASCADE,
  question text NOT NULL,
  allow_multiple_selection boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id)
);

CREATE INDEX IF NOT EXISTS idx_forum_polls_activity_id ON public.forum_polls(activity_id);

CREATE TABLE IF NOT EXISTS public.forum_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.forum_polls(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  vote_count int NOT NULL DEFAULT 0,
  CONSTRAINT forum_poll_options_text_nonempty CHECK (length(trim(option_text)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_forum_poll_options_poll_id ON public.forum_poll_options(poll_id);

CREATE TABLE IF NOT EXISTS public.forum_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.forum_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.forum_poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, option_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_forum_poll_votes_poll_id ON public.forum_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_forum_poll_votes_option_id ON public.forum_poll_votes(option_id);
CREATE INDEX IF NOT EXISTS idx_forum_poll_votes_user_id ON public.forum_poll_votes(user_id);

-- Single-choice: replace previous votes for same user on insert (see trigger).
CREATE OR REPLACE FUNCTION public.forum_poll_vote_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mult boolean;
BEGIN
  SELECT allow_multiple_selection INTO mult FROM forum_polls WHERE id = NEW.poll_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Poll not found';
  END IF;
  IF NOT mult THEN
    DELETE FROM forum_poll_votes WHERE poll_id = NEW.poll_id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forum_poll_vote_before_insert_trg ON public.forum_poll_votes;
CREATE TRIGGER forum_poll_vote_before_insert_trg
  BEFORE INSERT ON public.forum_poll_votes
  FOR EACH ROW
  EXECUTE PROCEDURE public.forum_poll_vote_before_insert();

CREATE OR REPLACE FUNCTION public.forum_poll_vote_touch_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE forum_poll_options SET vote_count = vote_count + 1 WHERE id = NEW.option_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE forum_poll_options SET vote_count = GREATEST(0, vote_count - 1) WHERE id = OLD.option_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.option_id IS DISTINCT FROM NEW.option_id THEN
      UPDATE forum_poll_options SET vote_count = GREATEST(0, vote_count - 1) WHERE id = OLD.option_id;
      UPDATE forum_poll_options SET vote_count = vote_count + 1 WHERE id = NEW.option_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS forum_poll_vote_touch_insert ON public.forum_poll_votes;
DROP TRIGGER IF EXISTS forum_poll_vote_touch_delete ON public.forum_poll_votes;
DROP TRIGGER IF EXISTS forum_poll_vote_touch_update ON public.forum_poll_votes;
CREATE TRIGGER forum_poll_vote_touch_insert
  AFTER INSERT ON public.forum_poll_votes
  FOR EACH ROW
  EXECUTE PROCEDURE public.forum_poll_vote_touch_counts();
CREATE TRIGGER forum_poll_vote_touch_delete
  AFTER DELETE ON public.forum_poll_votes
  FOR EACH ROW
  EXECUTE PROCEDURE public.forum_poll_vote_touch_counts();
CREATE TRIGGER forum_poll_vote_touch_update
  AFTER UPDATE OF option_id ON public.forum_poll_votes
  FOR EACH ROW
  EXECUTE PROCEDURE public.forum_poll_vote_touch_counts();

-- Atomic create: message + poll + options (auth required).
CREATE OR REPLACE FUNCTION public.create_forum_poll(
  p_activity_id uuid,
  p_question text,
  p_allow_multiple boolean,
  p_option_texts text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id uuid;
  v_poll_id uuid;
  v_user uuid := auth.uid();
  n int;
  i int;
  t text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_question IS NULL OR length(trim(p_question)) < 1 OR length(p_question) > 500 THEN
    RAISE EXCEPTION 'Invalid question';
  END IF;
  IF p_option_texts IS NULL THEN
    RAISE EXCEPTION 'Invalid options';
  END IF;
  n := array_length(p_option_texts, 1);
  IF n IS NULL OR n < 2 OR n > 10 THEN
    RAISE EXCEPTION 'Need between 2 and 10 options';
  END IF;

  FOR i IN 1..n LOOP
    t := trim(p_option_texts[i]);
    IF length(t) < 1 OR length(t) > 200 THEN
      RAISE EXCEPTION 'Invalid option text';
    END IF;
  END LOOP;

  INSERT INTO forum_messages (activity_id, user_id, message, message_kind, image_urls, reply_to_id)
  VALUES (
    p_activity_id,
    v_user,
    '',
    'poll',
    ARRAY[]::text[],
    NULL
  )
  RETURNING id INTO v_message_id;

  INSERT INTO forum_polls (activity_id, message_id, question, allow_multiple_selection, created_by)
  VALUES (p_activity_id, v_message_id, trim(p_question), COALESCE(p_allow_multiple, false), v_user)
  RETURNING id INTO v_poll_id;

  FOR i IN 1..n LOOP
    INSERT INTO forum_poll_options (poll_id, option_text, sort_order)
    VALUES (v_poll_id, trim(p_option_texts[i]), i - 1);
  END LOOP;

  RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_forum_poll(uuid, text, boolean, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_forum_poll(uuid, text, boolean, text[]) TO authenticated;

ALTER TABLE public.forum_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_poll_votes ENABLE ROW LEVEL SECURITY;

-- Polls: public read
DROP POLICY IF EXISTS "Anyone can read forum polls" ON public.forum_polls;
CREATE POLICY "Anyone can read forum polls"
  ON public.forum_polls FOR SELECT
  TO anon, authenticated
  USING (true);

-- Options: public read (includes vote_count)
DROP POLICY IF EXISTS "Anyone can read forum poll options" ON public.forum_poll_options;
CREATE POLICY "Anyone can read forum poll options"
  ON public.forum_poll_options FOR SELECT
  TO anon, authenticated
  USING (true);

-- Votes: only signed-in users can see who voted for what
DROP POLICY IF EXISTS "Authenticated can read forum poll votes" ON public.forum_poll_votes;
CREATE POLICY "Authenticated can read forum poll votes"
  ON public.forum_poll_votes FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert own forum poll votes" ON public.forum_poll_votes;
CREATE POLICY "Authenticated can insert own forum poll votes"
  ON public.forum_poll_votes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated can delete own forum poll votes" ON public.forum_poll_votes;
CREATE POLICY "Authenticated can delete own forum poll votes"
  ON public.forum_poll_votes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Inserts to polls/options are only via create_forum_poll (SECURITY DEFINER); no direct client INSERT policies.
