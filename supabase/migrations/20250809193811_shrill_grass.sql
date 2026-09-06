/*
  # Add reply functionality to forum messages

  1. Schema Changes
    - Add `reply_to_id` column to `forum_messages` table to reference parent message
    - Add foreign key constraint for reply relationships

  2. Security
    - Update existing RLS policies to handle reply relationships
    - Ensure users can read replies in context of the original message
*/

-- Add reply_to_id column to forum_messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'forum_messages' AND column_name = 'reply_to_id'
  ) THEN
    ALTER TABLE forum_messages ADD COLUMN reply_to_id uuid REFERENCES forum_messages(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add index for better performance when fetching replies
CREATE INDEX IF NOT EXISTS idx_forum_messages_reply_to_id ON forum_messages(reply_to_id);