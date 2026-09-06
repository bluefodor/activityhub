/*
  # Add custom activity name to meetup invites
*/

ALTER TABLE meetup_invites
  ADD COLUMN IF NOT EXISTS activity_name text;
