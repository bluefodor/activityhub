-- Auto-join plan creator to plan_joins when a plan is created.
-- Ensures the creator always appears in Upcoming Plans even if the client insert fails.

CREATE OR REPLACE FUNCTION activity_plans_creator_auto_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO plan_joins (plan_id, user_id)
  VALUES (NEW.id, NEW.creator_id)
  ON CONFLICT (plan_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activity_plans_creator_auto_join_trigger ON activity_plans;
CREATE TRIGGER activity_plans_creator_auto_join_trigger
  AFTER INSERT ON activity_plans
  FOR EACH ROW
  EXECUTE FUNCTION activity_plans_creator_auto_join();
