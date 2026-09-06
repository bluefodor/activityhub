-- Home-screen badge: unread chats only (DMs + plan group chats).
-- Excludes forum, new plans, and other bell inbox items.

CREATE OR REPLACE FUNCTION public.get_app_icon_badge_count(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_dm integer := 0;
  v_group integer := 0;
BEGIN
  SELECT COALESCE(SUM(sub.cnt), 0)::integer INTO v_dm
  FROM (
    SELECT (
      SELECT COUNT(*)::integer
      FROM chat_messages cm
      WHERE cm.chat_id = c.id
        AND cm.sender_id <> p_user_id
        AND cm.created_at > COALESCE(
          CASE
            WHEN c.participant_1 = p_user_id THEN c.last_read_p1
            ELSE c.last_read_p2
          END,
          '1970-01-01'::timestamptz
        )
    ) AS cnt
    FROM chats c
    WHERE (c.participant_1 = p_user_id OR c.participant_2 = p_user_id)
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users bu
        WHERE bu.user_id = p_user_id
          AND bu.blocked_user_id = CASE
            WHEN c.participant_1 = p_user_id THEN c.participant_2
            ELSE c.participant_1
          END
      )
  ) sub;

  SELECT COALESCE(SUM(sub.cnt), 0)::integer INTO v_group
  FROM (
    SELECT (
      SELECT COUNT(*)::integer
      FROM plan_group_chat_messages m
      WHERE m.chat_id = gc.id
        AND m.user_id <> p_user_id
        AND m.created_at > COALESCE(r.last_read_at, '1970-01-01'::timestamptz)
    ) AS cnt
    FROM plan_group_chats gc
    INNER JOIN plan_joins pj ON pj.plan_id = gc.plan_id AND pj.user_id = p_user_id
    LEFT JOIN plan_group_chat_reads r ON r.chat_id = gc.id AND r.user_id = p_user_id
    WHERE gc.expires_at > now()
  ) sub;

  RETURN LEAST(99, GREATEST(0, v_dm + v_group));
END;
$$;
