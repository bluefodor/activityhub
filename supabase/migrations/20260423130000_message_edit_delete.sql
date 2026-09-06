-- Soft-delete + edit metadata for forum and 1:1 chat messages.
-- Clients set deleted_at and clear body text on delete; set edited_at on text edit.

ALTER TABLE public.forum_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.forum_messages.edited_at IS 'Set when the author last edited message text.';
COMMENT ON COLUMN public.forum_messages.deleted_at IS 'Soft delete timestamp; author-only.';
COMMENT ON COLUMN public.chat_messages.edited_at IS 'Set when the sender last edited message text.';
COMMENT ON COLUMN public.chat_messages.deleted_at IS 'Soft delete timestamp; sender-only.';

-- Authors may update their own forum rows (edit text / soft-delete).
DROP POLICY IF EXISTS "forum_messages_author_update" ON public.forum_messages;
CREATE POLICY "forum_messages_author_update"
  ON public.forum_messages
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Senders may update their own chat rows.
DROP POLICY IF EXISTS "chat_messages_sender_update" ON public.chat_messages;
CREATE POLICY "chat_messages_sender_update"
  ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());
