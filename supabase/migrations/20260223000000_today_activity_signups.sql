-- "What are you up to today?" – daily signups per activity (resets by date).
-- One row per user per day; submitting again upserts (same activity + time + location).

CREATE TABLE IF NOT EXISTS today_activity_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  time_slot text NOT NULL,
  location text,
  signup_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, signup_date)
);

CREATE INDEX IF NOT EXISTS idx_today_activity_signups_date_activity
  ON today_activity_signups(signup_date, activity_id);

COMMENT ON TABLE today_activity_signups IS
  'Daily "what are you up to today?" signups; used for Ready Today list. One signup per user per day.';

-- RLS
ALTER TABLE today_activity_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own signup"
  ON today_activity_signups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own signup"
  ON today_activity_signups FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own signup"
  ON today_activity_signups FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read signups for list"
  ON today_activity_signups FOR SELECT
  TO authenticated
  USING (true);

-- Keep updated_at in sync
CREATE OR REPLACE FUNCTION set_today_signup_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER today_activity_signups_updated_at
  BEFORE UPDATE ON today_activity_signups
  FOR EACH ROW EXECUTE PROCEDURE set_today_signup_updated_at();
