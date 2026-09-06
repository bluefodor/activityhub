-- Optional RSVP limits and optional host approval for activity plans.
-- Adds:
-- 1) activity_plans.max_rsvps (nullable; null means unlimited)
-- 2) activity_plans.join_approval_required
-- 3) plan_join_requests queue for host approval flows
-- 4) DB-side enforcement for capacity + approval constraints on plan_joins inserts

ALTER TABLE public.activity_plans
  ADD COLUMN IF NOT EXISTS max_rsvps integer,
  ADD COLUMN IF NOT EXISTS join_approval_required boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activity_plans_max_rsvps_check'
  ) THEN
    ALTER TABLE public.activity_plans
      ADD CONSTRAINT activity_plans_max_rsvps_check
      CHECK (max_rsvps IS NULL OR (max_rsvps >= 1 AND max_rsvps <= 10));
  END IF;
END $$;

COMMENT ON COLUMN public.activity_plans.max_rsvps IS
  'Optional plan capacity. NULL means unlimited seats.';
COMMENT ON COLUMN public.activity_plans.join_approval_required IS
  'When true, non-creator joins require creator approval via plan_join_requests.';

CREATE TABLE IF NOT EXISTS public.plan_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.activity_plans(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  responder_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_join_requests_status_check CHECK (status IN ('pending', 'approved', 'declined', 'canceled')),
  CONSTRAINT plan_join_requests_unique UNIQUE (plan_id, requester_id)
);

CREATE INDEX IF NOT EXISTS plan_join_requests_plan_id_idx
  ON public.plan_join_requests(plan_id);
CREATE INDEX IF NOT EXISTS plan_join_requests_requester_id_idx
  ON public.plan_join_requests(requester_id);
CREATE INDEX IF NOT EXISTS plan_join_requests_status_idx
  ON public.plan_join_requests(status);

ALTER TABLE public.plan_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read plan_join_requests" ON public.plan_join_requests;
CREATE POLICY "Authenticated can read plan_join_requests"
  ON public.plan_join_requests
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can create own plan join request" ON public.plan_join_requests;
CREATE POLICY "Users can create own plan join request"
  ON public.plan_join_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Requester can cancel own pending request" ON public.plan_join_requests;
CREATE POLICY "Requester can cancel own pending request"
  ON public.plan_join_requests
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = requester_id)
  WITH CHECK (
    auth.uid() = requester_id
    AND status IN ('pending', 'canceled')
    AND responder_id IS NULL
  );

DROP POLICY IF EXISTS "Creator can respond plan join requests" ON public.plan_join_requests;
CREATE POLICY "Creator can respond plan join requests"
  ON public.plan_join_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.activity_plans p
      WHERE p.id = plan_join_requests.plan_id
        AND p.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.activity_plans p
      WHERE p.id = plan_join_requests.plan_id
        AND p.creator_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.plan_join_requests_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_plan_join_requests_set_updated_at ON public.plan_join_requests;
CREATE TRIGGER trigger_plan_join_requests_set_updated_at
  BEFORE UPDATE ON public.plan_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.plan_join_requests_set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_activity_plan_join_constraints()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_creator_id uuid;
  p_max_rsvps integer;
  p_join_approval_required boolean;
  current_count integer;
BEGIN
  SELECT creator_id, max_rsvps, join_approval_required
    INTO p_creator_id, p_max_rsvps, p_join_approval_required
  FROM public.activity_plans
  WHERE id = NEW.plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan does not exist';
  END IF;

  -- Host can always auto-join own plan; others require an approved request when enabled.
  IF NEW.user_id <> p_creator_id AND p_join_approval_required THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.plan_join_requests r
      WHERE r.plan_id = NEW.plan_id
        AND r.requester_id = NEW.user_id
        AND r.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'JOIN_APPROVAL_REQUIRED';
    END IF;
  END IF;

  IF p_max_rsvps IS NOT NULL THEN
    SELECT count(*)
      INTO current_count
    FROM public.plan_joins
    WHERE plan_id = NEW.plan_id;

    IF current_count >= p_max_rsvps THEN
      RAISE EXCEPTION 'PLAN_FULL';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_activity_plan_join_constraints ON public.plan_joins;
CREATE TRIGGER trigger_enforce_activity_plan_join_constraints
  BEFORE INSERT ON public.plan_joins
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_activity_plan_join_constraints();
