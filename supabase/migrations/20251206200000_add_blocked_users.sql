/*
  # Add Blocked Users Table for UGC Compliance

  1. New Table
    - `blocked_users`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `blocked_user_id` (uuid, references profiles)
      - `created_at` (timestamp)
      - Unique constraint on (user_id, blocked_user_id)

  2. Security
    - Enable RLS
    - Users can only manage their own blocks
    - Users can read their own blocked list
*/

-- Create blocked_users table
CREATE TABLE IF NOT EXISTS blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, blocked_user_id)
);

-- Enable RLS
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own blocked users
CREATE POLICY "Users can read their own blocked users"
  ON blocked_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Users can insert their own blocks
CREATE POLICY "Users can block other users"
  ON blocked_users
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own blocks (unblock)
CREATE POLICY "Users can unblock other users"
  ON blocked_users
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_blocked_users_user_id ON blocked_users(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_user_id ON blocked_users(blocked_user_id);

