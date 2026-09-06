-- Plan-scoped group chats: one per plan, started by the plan creator,
-- visible to anyone currently in plan_joins, auto-expires at end of the
-- plan's event_date local day (plan_groupchat is hidden after that).
--
-- Membership is derived live from plan_joins (no separate members table)
-- so anyone approved/joining after creation automatically gains access via RLS.
--
-- Notifications stay in-app: a chat appears in the user's chat list when
-- they have access; no push tokens are involved here.

-- ── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_group_chats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES activity_plans(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(plan_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_group_chats_plan_id ON plan_group_chats(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_group_chats_expires_at ON plan_group_chats(expires_at);

CREATE TABLE IF NOT EXISTS plan_group_chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     uuid NOT NULL REFERENCES plan_group_chats(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message     text NOT NULL DEFAULT '',
  image_urls  jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_to_id uuid REFERENCES plan_group_chat_messages(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  edited_at   timestamptz,
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_plan_group_chat_messages_chat_id ON plan_group_chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_plan_group_chat_messages_created_at ON plan_group_chat_messages(created_at);

-- Per-user read tracking so the chat list can show unread counts.
CREATE TABLE IF NOT EXISTS plan_group_chat_reads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id       uuid NOT NULL REFERENCES plan_group_chats(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at  timestamptz DEFAULT now(),
  UNIQUE(chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_group_chat_reads_user ON plan_group_chat_reads(user_id);

-- ── Auto-fill expires_at on insert (end of plan's local day) ──────────────
-- expires_at = (event_date + 1 day) at 00:00 in the plan's event_timezone.
CREATE OR REPLACE FUNCTION set_plan_group_chat_expires_at()
RETURNS TRIGGER AS $$
DECLARE
  plan_event_date date;
  plan_tz text;
BEGIN
  IF NEW.expires_at IS NULL THEN
    SELECT event_date, COALESCE(event_timezone, 'UTC')
      INTO plan_event_date, plan_tz
      FROM activity_plans
     WHERE id = NEW.plan_id;
    IF plan_event_date IS NULL THEN
      RAISE EXCEPTION 'plan_id % not found', NEW.plan_id;
    END IF;
    NEW.expires_at := ((plan_event_date + INTERVAL '1 day')::timestamp AT TIME ZONE plan_tz);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plan_group_chats_set_expires_at ON plan_group_chats;
CREATE TRIGGER plan_group_chats_set_expires_at
  BEFORE INSERT ON plan_group_chats
  FOR EACH ROW EXECUTE FUNCTION set_plan_group_chat_expires_at();

-- ── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE plan_group_chats           ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_group_chat_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_group_chat_reads      ENABLE ROW LEVEL SECURITY;

-- plan_group_chats:
--   SELECT: caller is in plan_joins for plan_id AND chat not expired
--   INSERT: caller is the plan creator AND no chat exists yet (UNIQUE handles dup)
DROP POLICY IF EXISTS "Members can read plan group chats" ON plan_group_chats;
CREATE POLICY "Members can read plan group chats"
  ON plan_group_chats FOR SELECT TO authenticated
  USING (
    expires_at > now()
    AND EXISTS (
      SELECT 1 FROM plan_joins pj
       WHERE pj.plan_id = plan_group_chats.plan_id
         AND pj.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Plan creator can start group chat" ON plan_group_chats;
CREATE POLICY "Plan creator can start group chat"
  ON plan_group_chats FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM activity_plans p
       WHERE p.id = plan_group_chats.plan_id
         AND p.creator_id = auth.uid()
    )
  );

-- plan_group_chat_messages:
--   SELECT/INSERT: caller is in plan_joins for parent chat's plan AND chat not expired
--   UPDATE (edit/soft-delete): only own messages AND chat not expired
DROP POLICY IF EXISTS "Members can read plan group chat messages" ON plan_group_chat_messages;
CREATE POLICY "Members can read plan group chat messages"
  ON plan_group_chat_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM plan_group_chats c
        JOIN plan_joins pj
          ON pj.plan_id = c.plan_id
       WHERE c.id = plan_group_chat_messages.chat_id
         AND pj.user_id = auth.uid()
         AND c.expires_at > now()
    )
  );

DROP POLICY IF EXISTS "Members can send plan group chat messages" ON plan_group_chat_messages;
CREATE POLICY "Members can send plan group chat messages"
  ON plan_group_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM plan_group_chats c
        JOIN plan_joins pj
          ON pj.plan_id = c.plan_id
       WHERE c.id = plan_group_chat_messages.chat_id
         AND pj.user_id = auth.uid()
         AND c.expires_at > now()
    )
  );

DROP POLICY IF EXISTS "Members can update own plan group chat messages" ON plan_group_chat_messages;
CREATE POLICY "Members can update own plan group chat messages"
  ON plan_group_chat_messages FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM plan_group_chats c
       WHERE c.id = plan_group_chat_messages.chat_id
         AND c.expires_at > now()
    )
  )
  WITH CHECK (user_id = auth.uid());

-- plan_group_chat_reads: a user can only see/upsert their own read row
DROP POLICY IF EXISTS "User can read own plan group chat read state" ON plan_group_chat_reads;
CREATE POLICY "User can read own plan group chat read state"
  ON plan_group_chat_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "User can upsert own plan group chat read state" ON plan_group_chat_reads;
CREATE POLICY "User can upsert own plan group chat read state"
  ON plan_group_chat_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "User can update own plan group chat read state" ON plan_group_chat_reads;
CREATE POLICY "User can update own plan group chat read state"
  ON plan_group_chat_reads FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Realtime ──────────────────────────────────────────────────────────────
-- Allow client subscriptions to message INSERT/UPDATEs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'plan_group_chat_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_group_chat_messages';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'plan_group_chats'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_group_chats';
  END IF;
END $$;
