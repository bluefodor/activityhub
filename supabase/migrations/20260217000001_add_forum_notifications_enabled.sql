/*
  # Add forum notifications preference
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS forum_notifications_enabled boolean NOT NULL DEFAULT true;
