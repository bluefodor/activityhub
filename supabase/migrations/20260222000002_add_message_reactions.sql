/*
  # Message reactions (Option A: separate table)

  1. New table: message_reactions
    - id (uuid, primary key)
    - message_id (uuid) - id of forum_messages.id or chat_messages.id
    - message_type (text) - 'forum' | 'chat'
    - user_id (uuid, references profiles)
    - emoji (text) - e.g. '👍', '❤️'
    - created_at (timestamptz)
    - Unique (message_id, message_type, user_id) - one reaction per user per message

  2. RLS
    - Read: users can see reactions for messages they can see (forum: same activity; chat: participant)
    - Insert/Update/Delete: users can only manage their own reaction
*/

CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  message_type text NOT NULL CHECK (message_type IN ('forum', 'chat')),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, message_type, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id, message_type);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON message_reactions(user_id);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Users can read reactions for forum messages in activities they can read (everyone can read forum_messages per existing policy)
CREATE POLICY "Users can read forum message reactions"
  ON message_reactions
  FOR SELECT
  TO authenticated
  USING (
    message_type = 'forum'
    AND EXISTS (
      SELECT 1 FROM forum_messages fm
      WHERE fm.id = message_reactions.message_id
    )
  );

-- Users can read reactions for chat messages in chats they're in
CREATE POLICY "Users can read chat message reactions"
  ON message_reactions
  FOR SELECT
  TO authenticated
  USING (
    message_type = 'chat'
    AND EXISTS (
      SELECT 1 FROM chat_messages cm
      JOIN chats c ON c.id = cm.chat_id
      WHERE cm.id = message_reactions.message_id
      AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  );

-- Allow anon to read forum message reactions (forum is readable by anon)
CREATE POLICY "Anon can read forum message reactions"
  ON message_reactions
  FOR SELECT
  TO anon
  USING (
    message_type = 'forum'
    AND EXISTS (
      SELECT 1 FROM forum_messages fm
      WHERE fm.id = message_reactions.message_id
    )
  );

-- Users can insert their own reaction (forum: any forum message; chat: only if in chat)
CREATE POLICY "Users can add forum reaction"
  ON message_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND message_type = 'forum'
    AND EXISTS (SELECT 1 FROM forum_messages fm WHERE fm.id = message_id)
  );

CREATE POLICY "Users can add chat reaction"
  ON message_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND message_type = 'chat'
    AND EXISTS (
      SELECT 1 FROM chat_messages cm
      JOIN chats c ON c.id = cm.chat_id
      WHERE cm.id = message_id AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  );

-- Users can update their own reaction (same message_type/message_id)
CREATE POLICY "Users can update own reaction"
  ON message_reactions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reaction
CREATE POLICY "Users can delete own reaction"
  ON message_reactions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
