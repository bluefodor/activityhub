-- Persist the forum "last seen" timestamp server-side so that already-read
-- messages never reappear as unread after an app reinstall, cache clear, or
-- device switch. The client still uses AsyncStorage for fast badge computation;
-- this column acts as the authoritative fallback when AsyncStorage is empty.

ALTER TABLE public.user_activity_skills
  ADD COLUMN IF NOT EXISTS forum_seen_at timestamptz;
