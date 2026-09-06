/*
  # Add notification preference columns on profiles
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS chat_notifications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_event_notifications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS private_invite_notifications_enabled boolean NOT NULL DEFAULT true;
