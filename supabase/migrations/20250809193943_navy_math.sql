/*
  # Fix forum messages reply constraint

  1. Database Changes
    - Add missing foreign key constraint for reply_to_id in forum_messages table
    - This enables self-referencing relationships for threaded conversations

  2. Security
    - No changes to existing RLS policies
    - Maintains current security model
*/

-- Add the missing foreign key constraint for reply functionality
DO $$
BEGIN
  -- Check if the constraint doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'forum_messages_reply_to_id_fkey' 
    AND table_name = 'forum_messages'
  ) THEN
    ALTER TABLE forum_messages 
    ADD CONSTRAINT forum_messages_reply_to_id_fkey 
    FOREIGN KEY (reply_to_id) REFERENCES forum_messages(id) ON DELETE CASCADE;
  END IF;
END $$;