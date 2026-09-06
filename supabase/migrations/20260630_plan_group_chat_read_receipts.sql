-- Read receipts: plan members can see each other's last_read_at in shared group chats.

DROP POLICY IF EXISTS "Members can read plan group chat read state in their chats" ON public.plan_group_chat_reads;
CREATE POLICY "Members can read plan group chat read state in their chats"
  ON public.plan_group_chat_reads FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.plan_group_chats c
        JOIN public.plan_joins pj ON pj.plan_id = c.plan_id
       WHERE c.id = plan_group_chat_reads.chat_id
         AND pj.user_id = auth.uid()
         AND c.expires_at > now()
    )
  );

-- Realtime so senders see "Read by X/Y" update when others open the chat.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'plan_group_chat_reads'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_group_chat_reads';
  END IF;
END $$;
