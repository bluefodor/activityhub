-- Allow emoji reactions on plan group chat messages (same message_reactions table as forum/DM).

ALTER TABLE public.message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_message_type_check;

ALTER TABLE public.message_reactions
  ADD CONSTRAINT message_reactions_message_type_check
  CHECK (message_type IN ('forum', 'chat', 'plan_group_chat'));

DROP POLICY IF EXISTS "Users can read plan group chat message reactions" ON public.message_reactions;
CREATE POLICY "Users can read plan group chat message reactions"
  ON public.message_reactions
  FOR SELECT
  TO authenticated
  USING (
    message_type = 'plan_group_chat'
    AND EXISTS (
      SELECT 1
      FROM public.plan_group_chat_messages m
      JOIN public.plan_group_chats c ON c.id = m.chat_id
      JOIN public.plan_joins pj ON pj.plan_id = c.plan_id
      WHERE m.id = message_reactions.message_id
        AND pj.user_id = auth.uid()
        AND c.expires_at > now()
    )
  );

DROP POLICY IF EXISTS "Users can add plan group chat reaction" ON public.message_reactions;
CREATE POLICY "Users can add plan group chat reaction"
  ON public.message_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND message_type = 'plan_group_chat'
    AND EXISTS (
      SELECT 1
      FROM public.plan_group_chat_messages m
      JOIN public.plan_group_chats c ON c.id = m.chat_id
      JOIN public.plan_joins pj ON pj.plan_id = c.plan_id
      WHERE m.id = message_id
        AND pj.user_id = auth.uid()
        AND c.expires_at > now()
    )
  );
