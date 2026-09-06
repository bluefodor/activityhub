-- App updates + feature requests tab
-- Shown in the Updates tab within the Chats screen.

-- ─── 1. App updates (posted by admin) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_updates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version    text,
  title      text NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Everyone can read updates
ALTER TABLE public.app_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_updates_read" ON public.app_updates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_updates_read_anon" ON public.app_updates
  FOR SELECT TO anon USING (true);

-- ─── 2. Comments on updates ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_update_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id  uuid NOT NULL REFERENCES public.app_updates(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message    text NOT NULL CHECK (char_length(message) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_update_comments_update_idx
  ON public.app_update_comments (update_id, created_at ASC);

ALTER TABLE public.app_update_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_read" ON public.app_update_comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "comments_insert" ON public.app_update_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete_own" ON public.app_update_comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── 3. Feature requests ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_update_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text       text NOT NULL CHECK (char_length(text) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_update_requests_created_idx
  ON public.app_update_requests (created_at DESC);

ALTER TABLE public.app_update_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requests_read" ON public.app_update_requests
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "requests_insert" ON public.app_update_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "requests_delete_own" ON public.app_update_requests
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── 4. Votes on feature requests ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_update_request_votes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.app_update_requests(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, user_id)
);

CREATE INDEX IF NOT EXISTS app_update_request_votes_request_idx
  ON public.app_update_request_votes (request_id);

ALTER TABLE public.app_update_request_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "votes_read" ON public.app_update_request_votes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "votes_insert" ON public.app_update_request_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "votes_delete_own" ON public.app_update_request_votes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── 5. Seed first update ────────────────────────────────────────────────────

INSERT INTO public.app_updates (version, title, body) VALUES (
  'v1.43',
  'What''s new',
  '• Forum polls — two poll types: multiple choice and open-ended.' || E'\n' ||
  '• Plan group chat — every plan now has a group chat for all members.' || E'\n' ||
  '• Photo sharing — send up to 4 photos in a single message.'
);
