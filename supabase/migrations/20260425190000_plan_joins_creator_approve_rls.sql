-- Allow plan hosts to insert plan_joins for another user after approving a join request.
-- Existing policy only allows auth.uid() = user_id (self-join), which blocks host approval inserts.

DROP POLICY IF EXISTS "Plan creator can insert join for approved request" ON public.plan_joins;
CREATE POLICY "Plan creator can insert join for approved request"
  ON public.plan_joins
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.activity_plans p
      WHERE p.id = plan_joins.plan_id
        AND p.creator_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.plan_join_requests r
      WHERE r.plan_id = plan_joins.plan_id
        AND r.requester_id = plan_joins.user_id
        AND r.status = 'approved'
    )
  );
