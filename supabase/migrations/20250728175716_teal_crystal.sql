/*
  # Create meetup invites table

  1. New Tables
    - `meetup_invites`
      - `id` (uuid, primary key)
      - `sender_id` (uuid, references profiles)
      - `recipient_id` (uuid, references profiles)
      - `chat_id` (uuid, references chats)
      - `location` (text)
      - `event_date` (date)
      - `event_time` (time)
      - `status` (text, check constraint for pending/accepted/declined)
      - `created_at` (timestamp)
      - `responded_at` (timestamp, nullable)

  2. Security
    - Enable RLS on `meetup_invites` table
    - Add policies for users to manage their own invites
    - Add policies for reading invites they're involved in
*/

CREATE TABLE IF NOT EXISTS meetup_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  location text NOT NULL,
  event_date date NOT NULL,
  event_time time NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT meetup_invites_status_check CHECK (status IN ('pending', 'accepted', 'declined'))
);

ALTER TABLE meetup_invites ENABLE ROW LEVEL SECURITY;

-- Users can create invites they send
CREATE POLICY "Users can create own invites"
  ON meetup_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- Users can read invites they're involved in (as sender or recipient)
CREATE POLICY "Users can read own invites"
  ON meetup_invites
  FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Users can update invites they received (to accept/decline)
CREATE POLICY "Recipients can update invite status"
  ON meetup_invites
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Users can delete invites they sent
CREATE POLICY "Senders can delete own invites"
  ON meetup_invites
  FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);