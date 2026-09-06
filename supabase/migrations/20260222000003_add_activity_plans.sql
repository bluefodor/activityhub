-- Activity plans: community plans per activity (location, date, time).
-- Creators limited to 2 plans per day (enforced in app + optional trigger).
-- Plans are hidden after event day (filter in app: event_date >= current_date).
-- plan_joins: users who tapped "Join"; count shown on plan card.

CREATE TABLE IF NOT EXISTS activity_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  location text NOT NULL,
  event_date date NOT NULL,
  event_time time NOT NULL,
  event_timezone text DEFAULT 'UTC',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_joins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES activity_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(plan_id, user_id)
);

ALTER TABLE activity_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_joins ENABLE ROW LEVEL SECURITY;

-- Plans: anyone authenticated can read (for activities they can see)
CREATE POLICY "Authenticated can read activity_plans"
  ON activity_plans FOR SELECT TO authenticated USING (true);

-- Only creator can update/delete their plan
CREATE POLICY "Creator can update own plan"
  ON activity_plans FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creator can delete own plan"
  ON activity_plans FOR DELETE TO authenticated USING (auth.uid() = creator_id);

-- Insert: authenticated; 2/day and profile picture enforced in app
CREATE POLICY "Authenticated can create plan"
  ON activity_plans FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

-- Plan joins: read for authenticated
CREATE POLICY "Authenticated can read plan_joins"
  ON plan_joins FOR SELECT TO authenticated USING (true);

-- Join: insert own row
CREATE POLICY "Users can join plan"
  ON plan_joins FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Leave: delete own row
CREATE POLICY "Users can leave plan"
  ON plan_joins FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS activity_plans_activity_id_idx ON activity_plans(activity_id);
CREATE INDEX IF NOT EXISTS activity_plans_creator_id_idx ON activity_plans(creator_id);
CREATE INDEX IF NOT EXISTS activity_plans_event_date_idx ON activity_plans(event_date);
CREATE INDEX IF NOT EXISTS plan_joins_plan_id_idx ON plan_joins(plan_id);
CREATE INDEX IF NOT EXISTS plan_joins_user_id_idx ON plan_joins(user_id);
