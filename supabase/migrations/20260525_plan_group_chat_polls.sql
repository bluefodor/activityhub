-- Simple polls for plan group chats: single-choice, 2–6 options, live vote counts.

ALTER TABLE plan_group_chat_messages
  ADD COLUMN IF NOT EXISTS message_kind text NOT NULL DEFAULT 'text'
  CHECK (message_kind IN ('text', 'poll'));

COMMENT ON COLUMN plan_group_chat_messages.message_kind IS
  'text = normal message; poll = carries plan_group_chat_polls row';

CREATE TABLE IF NOT EXISTS plan_group_chat_polls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     uuid NOT NULL REFERENCES plan_group_chats(id) ON DELETE CASCADE,
  message_id  uuid NOT NULL REFERENCES plan_group_chat_messages(id) ON DELETE CASCADE,
  question    text NOT NULL,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_group_chat_polls_chat_id ON plan_group_chat_polls(chat_id);

CREATE TABLE IF NOT EXISTS plan_group_chat_poll_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     uuid NOT NULL REFERENCES plan_group_chat_polls(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  vote_count  int NOT NULL DEFAULT 0,
  CONSTRAINT plan_group_chat_poll_options_text_nonempty CHECK (length(trim(option_text)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_plan_group_chat_poll_options_poll_id ON plan_group_chat_poll_options(poll_id);

CREATE TABLE IF NOT EXISTS plan_group_chat_poll_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     uuid NOT NULL REFERENCES plan_group_chat_polls(id) ON DELETE CASCADE,
  option_id   uuid NOT NULL REFERENCES plan_group_chat_poll_options(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_group_chat_poll_votes_poll_id ON plan_group_chat_poll_votes(poll_id);

-- Replace previous vote when user picks a different option (single choice).
CREATE OR REPLACE FUNCTION plan_group_chat_poll_vote_before_insert()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM plan_group_chat_poll_votes
   WHERE poll_id = NEW.poll_id AND user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plan_group_chat_poll_vote_before_insert_trg ON plan_group_chat_poll_votes;
CREATE TRIGGER plan_group_chat_poll_vote_before_insert_trg
  BEFORE INSERT ON plan_group_chat_poll_votes
  FOR EACH ROW EXECUTE FUNCTION plan_group_chat_poll_vote_before_insert();

CREATE OR REPLACE FUNCTION plan_group_chat_poll_vote_touch_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE plan_group_chat_poll_options SET vote_count = vote_count + 1 WHERE id = NEW.option_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE plan_group_chat_poll_options SET vote_count = GREATEST(0, vote_count - 1) WHERE id = OLD.option_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.option_id IS DISTINCT FROM NEW.option_id THEN
      UPDATE plan_group_chat_poll_options SET vote_count = GREATEST(0, vote_count - 1) WHERE id = OLD.option_id;
      UPDATE plan_group_chat_poll_options SET vote_count = vote_count + 1 WHERE id = NEW.option_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plan_group_chat_poll_vote_touch_insert ON plan_group_chat_poll_votes;
DROP TRIGGER IF EXISTS plan_group_chat_poll_vote_touch_delete ON plan_group_chat_poll_votes;
DROP TRIGGER IF EXISTS plan_group_chat_poll_vote_touch_update ON plan_group_chat_poll_votes;
CREATE TRIGGER plan_group_chat_poll_vote_touch_insert
  AFTER INSERT ON plan_group_chat_poll_votes
  FOR EACH ROW EXECUTE FUNCTION plan_group_chat_poll_vote_touch_counts();
CREATE TRIGGER plan_group_chat_poll_vote_touch_delete
  AFTER DELETE ON plan_group_chat_poll_votes
  FOR EACH ROW EXECUTE FUNCTION plan_group_chat_poll_vote_touch_counts();
CREATE TRIGGER plan_group_chat_poll_vote_touch_update
  AFTER UPDATE OF option_id ON plan_group_chat_poll_votes
  FOR EACH ROW EXECUTE FUNCTION plan_group_chat_poll_vote_touch_counts();

CREATE OR REPLACE FUNCTION create_plan_group_chat_poll(
  p_chat_id uuid,
  p_question text,
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
  IF NOT EXISTS (
    SELECT 1
      FROM plan_group_chats c
      JOIN plan_joins pj ON pj.plan_id = c.plan_id
     WHERE c.id = p_chat_id
       AND pj.user_id = v_user
       AND c.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p_question IS NULL OR length(trim(p_question)) < 1 OR length(p_question) > 300 THEN
    RAISE EXCEPTION 'Invalid question';
  END IF;
  n := array_length(p_option_texts, 1);
  IF n IS NULL OR n < 2 OR n > 6 THEN
    RAISE EXCEPTION 'Need between 2 and 6 options';
  END IF;
  FOR i IN 1..n LOOP
    t := trim(p_option_texts[i]);
    IF length(t) < 1 OR length(t) > 120 THEN
      RAISE EXCEPTION 'Invalid option text';
    END IF;
  END LOOP;

  INSERT INTO plan_group_chat_messages (chat_id, user_id, message, message_kind, image_urls)
  VALUES (p_chat_id, v_user, '', 'poll', '[]'::jsonb)
  RETURNING id INTO v_message_id;

  INSERT INTO plan_group_chat_polls (chat_id, message_id, question, created_by)
  VALUES (p_chat_id, v_message_id, trim(p_question), v_user)
  RETURNING id INTO v_poll_id;

  FOR i IN 1..n LOOP
    INSERT INTO plan_group_chat_poll_options (poll_id, option_text, sort_order)
    VALUES (v_poll_id, trim(p_option_texts[i]), i - 1);
  END LOOP;

  RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION create_plan_group_chat_poll(uuid, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_plan_group_chat_poll(uuid, text, text[]) TO authenticated;

ALTER TABLE plan_group_chat_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_group_chat_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_group_chat_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read plan group chat polls" ON plan_group_chat_polls;
CREATE POLICY "Members can read plan group chat polls"
  ON plan_group_chat_polls FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM plan_group_chats c
        JOIN plan_joins pj ON pj.plan_id = c.plan_id
       WHERE c.id = plan_group_chat_polls.chat_id
         AND pj.user_id = auth.uid()
         AND c.expires_at > now()
    )
  );

DROP POLICY IF EXISTS "Members can read plan group chat poll options" ON plan_group_chat_poll_options;
CREATE POLICY "Members can read plan group chat poll options"
  ON plan_group_chat_poll_options FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM plan_group_chat_polls p
        JOIN plan_group_chats c ON c.id = p.chat_id
        JOIN plan_joins pj ON pj.plan_id = c.plan_id
       WHERE p.id = plan_group_chat_poll_options.poll_id
         AND pj.user_id = auth.uid()
         AND c.expires_at > now()
    )
  );

DROP POLICY IF EXISTS "Members can read plan group chat poll votes" ON plan_group_chat_poll_votes;
CREATE POLICY "Members can read plan group chat poll votes"
  ON plan_group_chat_poll_votes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM plan_group_chat_polls p
        JOIN plan_group_chats c ON c.id = p.chat_id
        JOIN plan_joins pj ON pj.plan_id = c.plan_id
       WHERE p.id = plan_group_chat_poll_votes.poll_id
         AND pj.user_id = auth.uid()
         AND c.expires_at > now()
    )
  );

DROP POLICY IF EXISTS "Members can insert own plan group chat poll votes" ON plan_group_chat_poll_votes;
CREATE POLICY "Members can insert own plan group chat poll votes"
  ON plan_group_chat_poll_votes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM plan_group_chat_polls p
        JOIN plan_group_chats c ON c.id = p.chat_id
        JOIN plan_joins pj ON pj.plan_id = c.plan_id
       WHERE p.id = plan_group_chat_poll_votes.poll_id
         AND pj.user_id = auth.uid()
         AND c.expires_at > now()
    )
  );

DROP POLICY IF EXISTS "Members can update own plan group chat poll votes" ON plan_group_chat_poll_votes;
CREATE POLICY "Members can update own plan group chat poll votes"
  ON plan_group_chat_poll_votes FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members can delete own plan group chat poll votes" ON plan_group_chat_poll_votes;
CREATE POLICY "Members can delete own plan group chat poll votes"
  ON plan_group_chat_poll_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Live vote count updates in the chat UI.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'plan_group_chat_poll_options'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_group_chat_poll_options';
  END IF;
END $$;
