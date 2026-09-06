/*
  # Create scheduled events table

  1. New Tables
    - `scheduled_events`
      - `id` (uuid, primary key)
      - `organizer_id` (uuid, references profiles)
      - `activity_id` (uuid, references activities)
      - `title` (text)
      - `location` (text)
      - `event_date` (date)
      - `event_time` (time)
      - `description` (text, optional)
      - `max_participants` (integer, optional)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `scheduled_events` table
    - Add policy for authenticated users to read all events
    - Add policy for users to create events
    - Add policy for organizers to update/delete their own events
*/

CREATE TABLE IF NOT EXISTS scheduled_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES activities(id) ON DELETE SET NULL,
  title text NOT NULL,
  location text NOT NULL,
  event_date date NOT NULL,
  event_time time NOT NULL,
  description text DEFAULT '',
  max_participants integer DEFAULT 10,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE scheduled_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all scheduled events"
  ON scheduled_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create scheduled events"
  ON scheduled_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "Organizers can update own events"
  ON scheduled_events
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = organizer_id)
  WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "Organizers can delete own events"
  ON scheduled_events
  FOR DELETE
  TO authenticated
  USING (auth.uid() = organizer_id);