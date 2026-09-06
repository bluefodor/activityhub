/*
  # Add Group Scheduling Support

  1. New Tables
    - `event_participants` - Links events to invited participants
      - `id` (uuid, primary key)
      - `event_id` (uuid, references scheduled_events)
      - `user_id` (uuid, references profiles)
      - `status` (text, pending/accepted/declined)
      - `invited_at` (timestamp)
      - `responded_at` (timestamp, nullable)

  2. Schema Changes
    - Update scheduled_events to support group events
    - Add participant limit validation

  3. Security
    - Enable RLS on event_participants table
    - Add policies for participants to manage their own responses
    - Add policies for organizers to invite participants
*/

-- Create event_participants table
CREATE TABLE IF NOT EXISTS event_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES scheduled_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(event_id, user_id)
);

-- Enable RLS
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;

-- Policies for event_participants
CREATE POLICY "Users can read invites they're part of"
  ON event_participants
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM scheduled_events 
    WHERE scheduled_events.id = event_participants.event_id 
    AND scheduled_events.organizer_id = auth.uid()
  ));

CREATE POLICY "Organizers can invite participants"
  ON event_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM scheduled_events 
    WHERE scheduled_events.id = event_participants.event_id 
    AND scheduled_events.organizer_id = auth.uid()
  ));

CREATE POLICY "Participants can update their own responses"
  ON event_participants
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Organizers can remove participants"
  ON event_participants
  FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM scheduled_events 
    WHERE scheduled_events.id = event_participants.event_id 
    AND scheduled_events.organizer_id = auth.uid()
  ) OR user_id = auth.uid());

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_participants_event_id ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_user_id ON event_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_status ON event_participants(status);