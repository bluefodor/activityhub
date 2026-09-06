/*
  # Add User Availability Preferences Table

  1. New Table
    - `user_availability`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `day_of_week` (integer, 0=Sunday, 1=Monday, ..., 6=Saturday)
      - `time_block` (text, 'morning', 'afternoon', 'evening')
      - `enabled` (boolean, default true)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
      - Unique constraint on (user_id, day_of_week, time_block)

  2. Security
    - Enable RLS
    - Users can read all availability (public for matching)
    - Users can only manage their own availability
*/

-- Create user_availability table
CREATE TABLE IF NOT EXISTS user_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  time_block text NOT NULL CHECK (time_block IN ('morning', 'afternoon', 'evening')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, day_of_week, time_block)
);

-- Enable RLS
ALTER TABLE user_availability ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read availability (for matching purposes)
CREATE POLICY "Anyone can read availability"
  ON user_availability
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Users can insert their own availability
CREATE POLICY "Users can insert their own availability"
  ON user_availability
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own availability
CREATE POLICY "Users can update their own availability"
  ON user_availability
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own availability
CREATE POLICY "Users can delete their own availability"
  ON user_availability
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_user_availability_user_id ON user_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_user_availability_day_time ON user_availability(day_of_week, time_block);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_availability_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_user_availability_updated_at
  BEFORE UPDATE ON user_availability
  FOR EACH ROW
  EXECUTE FUNCTION update_user_availability_updated_at();

-- Add comment to document the table
COMMENT ON TABLE user_availability IS 
'Stores user availability preferences for each day of the week and time block (morning/afternoon/evening). Used for matching users who are available at similar times.';

