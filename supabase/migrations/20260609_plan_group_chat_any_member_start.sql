-- Allow any plan joiner (not just the host) to start the one group chat per plan.
-- Membership stays derived from plan_joins, so later joiners still get access via RLS.

DROP POLICY IF EXISTS "Plan creator can start group chat" ON public.plan_group_chats;
DROP POLICY IF EXISTS "Plan members can start group chat" ON public.plan_group_chats;

CREATE POLICY "Plan members can start group chat"
  ON public.plan_group_chats FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.plan_joins pj
       WHERE pj.plan_id = plan_group_chats.plan_id
         AND pj.user_id = auth.uid()
    )
  );
