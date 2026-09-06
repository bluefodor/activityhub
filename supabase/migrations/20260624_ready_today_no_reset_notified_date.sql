-- Fix ready_today notification cap.
-- Previously the trigger reset ready_today_notified_date to NULL on every toggle-on,
-- which meant toggling off → on bypassed the once-per-day cap.
-- Now we only update toggled_at on toggle; notified_date is left untouched so the
-- daily cap persists across multiple toggles within the same day.

CREATE OR REPLACE FUNCTION public.fn_ready_today_toggle_track()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ready_today = TRUE AND (OLD.ready_today IS DISTINCT FROM NEW.ready_today) THEN
    NEW.ready_today_toggled_at := now();
    -- Do NOT reset ready_today_notified_date here.
    -- Resetting it would let users re-trigger notifications by toggling off/on,
    -- spamming activity members. The date is only cleared at midnight (new day).
  END IF;
  RETURN NEW;
END;
$$;
