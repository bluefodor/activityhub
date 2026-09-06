/*
  # Fix Group Chat Policies

  1. Updated Policies
    - Fix group chat member policies to allow proper creation
    - Ensure creators can add members to their groups
    - Fix RLS policies for group chat access

  2. Security
    - Maintain proper access control
    - Allow group creators to manage their groups
    - Ensure members can only access groups they belong to
*/

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Group creators can add members" ON group_chat_members;
DROP POLICY IF EXISTS "Users can read group members for their groups" ON group_chat_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_chat_members;

-- Recreate group_chat_members policies with proper permissions
CREATE POLICY "Group creators can add members"
  ON group_chat_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_chats
      WHERE group_chats.id = group_chat_members.group_chat_id
      AND group_chats.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can read group members for their groups"
  ON group_chat_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_chat_members gcm
      WHERE gcm.group_chat_id = group_chat_members.group_chat_id
      AND gcm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can leave groups"
  ON group_chat_members
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Also fix group_chats policy to ensure proper access
DROP POLICY IF EXISTS "Users can read groups they're members of" ON group_chats;

CREATE POLICY "Users can read groups they're members of"
  ON group_chats
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_chat_members
      WHERE group_chat_members.group_chat_id = group_chats.id
      AND group_chat_members.user_id = auth.uid()
    )
  );