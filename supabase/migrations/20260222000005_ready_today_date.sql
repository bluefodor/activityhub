-- Ready today expires after midnight: store the date when toggled on.
-- App treats "ready today" as true only when ready_today_date = current local date,
-- so it automatically turns off the next day without needing a cron job.

ALTER TABLE user_activity_skills
  ADD COLUMN IF NOT EXISTS ready_today_date date NULL;

COMMENT ON COLUMN user_activity_skills.ready_today_date IS
  'Date (YYYY-MM-DD) when user last set ready_today to true. Used so ready today expires after midnight (app shows on only when this equals today).';
