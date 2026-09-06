/*
  # Add Push Tokens Table for Push Notifications

  1. New Table
    - `push_tokens`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `expo_push_token` (text, unique per user)
      - `device_id` (text, optional, for multiple devices)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
      - Unique constraint on (user_id, expo_push_token)

  2. Security
    - Enable RLS
    - Users can only manage their own push tokens
    - Users can read their own tokens
*/

-- Create push_tokens table
CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  device_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, expo_push_token)
);

-- Enable RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own push tokens
CREATE POLICY "Users can read their own push tokens"
  ON push_tokens
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Users can insert their own push tokens
CREATE POLICY "Users can insert their own push tokens"
  ON push_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own push tokens
CREATE POLICY "Users can update their own push tokens"
  ON push_tokens
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own push tokens
CREATE POLICY "Users can delete their own push tokens"
  ON push_tokens
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_expo_token ON push_tokens(expo_push_token);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_push_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_push_tokens_updated_at();
