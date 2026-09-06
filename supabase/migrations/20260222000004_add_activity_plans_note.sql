-- Optional note for activity_plans (e.g. event details), max 160 characters.
ALTER TABLE activity_plans
  ADD COLUMN IF NOT EXISTS note text CHECK (note IS NULL OR length(note) <= 160);
