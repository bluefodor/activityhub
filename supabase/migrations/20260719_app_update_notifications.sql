-- Infrastructure for in-app "New update available" alerts.
-- These appear in the bell/alerts inbox and deep-link to the Updates tab in Chats.
--
-- HOW TO SEND AN ALERT WHEN YOU PUBLISH A NEW UPDATE:
--
--   SELECT send_app_update_notification(
--     '<paste the app_update row UUID here>',
--     'New in Active Portland',
--     'Forum polls, Active Today alerts, group chats & more — tap to see what''s new.'
--   );
--
-- That''s it. Every signed-in user gets an inbox notification.
-- The notification type is "app_update" so the bell routes them directly to the Updates tab.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.send_app_update_notification(
  p_update_id  uuid,
  p_title      text,
  p_body       text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.user_notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'app_update',
    p_title,
    p_body,
    jsonb_build_object('updateId', p_update_id::text)
  FROM public.profiles p
  -- Skip users who already have an unread notification for this exact update
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_notifications un
    WHERE un.user_id = p.id
      AND un.type   = 'app_update'
      AND un.data->>'updateId' = p_update_id::text
      AND un.read_at IS NULL
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Only the service role (Edge Functions / SQL editor) can call this.
REVOKE ALL ON FUNCTION public.send_app_update_notification FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_app_update_notification TO service_role;
