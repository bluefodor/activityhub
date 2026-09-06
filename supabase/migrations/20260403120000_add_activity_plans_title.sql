-- Short title for plans (shown in lists and forum announcements), separate from location.
ALTER TABLE activity_plans
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';

COMMENT ON COLUMN activity_plans.title IS 'User-facing plan title; legacy rows use empty string.';
