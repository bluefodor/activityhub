/*
  # Create Group Chat System

  1. New Tables
    - `group_chats`
      - `id` (uuid, primary key)
      - `name` (text, group name)
      - `created_by` (uuid, creator user id)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `group_chat_members`
      - `id` (uuid, primary key)
      - `group_chat_id` (uuid, foreign key)
      - `user_id` (uuid, foreign key)
      - `joined_at` (timestamp)
    
    - `group_chat_messages`
      - `id` (uuid, primary key)
      - `group_chat_id` (uuid, foreign key)
      - `sender_id` (uuid, foreign key)
      - `message` (text)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for group members to read/write
    - Add policies for creators to manage groups
*/

-- Create group_chats table
CREATE TABLE IF NOT EXISTS group_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create group_chat_members table
CREATE TABLE IF NOT EXISTS group_chat_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_chat_id uuid NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_chat_id, user_id)
);

-- Create group_chat_messages table
CREATE TABLE IF NOT EXISTS group_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_chat_id uuid NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for group_chats
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

CREATE POLICY "Users can create group chats"
  ON group_chats
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update their group chats"
  ON group_chats
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Policies for group_chat_members
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

CREATE POLICY "Users can leave groups"
  ON group_chat_members
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for group_chat_messages
CREATE POLICY "Group members can read messages"
  ON group_chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_chat_members 
      WHERE group_chat_members.group_chat_id = group_chat_messages.group_chat_id 
      AND group_chat_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members can send messages"
  ON group_chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM group_chat_members 
      WHERE group_chat_members.group_chat_id = group_chat_messages.group_chat_id 
      AND group_chat_members.user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_group_chat_members_group_id ON group_chat_members(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_members_user_id ON group_chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_messages_group_id ON group_chat_messages(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_messages_created_at ON group_chat_messages(created_at);