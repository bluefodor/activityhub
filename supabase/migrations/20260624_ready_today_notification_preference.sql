-- Add a dedicated toggle for Ready Today push notifications.
-- Defaults to true so existing users receive them unless they opt out.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ready_today_notifications_enabled boolean NOT NULL DEFAULT true;
