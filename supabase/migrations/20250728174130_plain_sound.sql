/*
  # Create meetup invites system

  1. New Tables
    - `meetup_invites`
      - `id` (uuid, primary key)
      - `sender_id` (uuid, references profiles)
      - `recipient_id` (uuid, references profiles)
      - `chat_id` (uuid, references chats)
      - `location` (text)
      - `event_date` (date)
      - `event_time` (time)
      - `status` (text, enum: pending/accepted/declined)
      - `created_at` (timestamp)
      - `responded_at` (timestamp, nullable)

  2. Security
    - Enable RLS on `meetup_invites` table
    - Add policies for users to manage their own invites
    - Users can read invites they sent or received
    - Users can update invites they received (to accept/decline)
    - Users can insert invites they are sending
*/

CREATE TABLE IF NOT EXISTS meetup_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  location text NOT NULL,
  event_date date NOT NULL,
  event_time time NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz
);

ALTER TABLE meetup_invites ENABLE ROW LEVEL SECURITY;

-- Users can read invites they sent or received
CREATE POLICY "Users can read own invites"
  ON meetup_invites
  FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Users can insert invites they are sending
CREATE POLICY "Users can send invites"
  ON meetup_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- Users can update invites they received (to respond)
CREATE POLICY "Recipients can respond to invites"
  ON meetup_invites
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS meetup_invites_chat_id_idx ON meetup_invites(chat_id);
CREATE INDEX IF NOT EXISTS meetup_invites_status_idx ON meetup_invites(status);
CREATE INDEX IF NOT EXISTS meetup_invites_recipient_id_idx ON meetup_invites(recipient_id);