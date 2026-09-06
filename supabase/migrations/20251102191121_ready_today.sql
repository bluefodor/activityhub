/*
  # Add "Ready Today" feature to user_activity_skills

  1. Schema Changes
    - Add `ready_today` boolean column to user_activity_skills table
    - Default value is false (not ready by default)
    - Add index for faster queries when filtering/sorting by ready status

  2. Features
    - Users can toggle that they're ready to join an activity today
    - Allows filtering and sorting people by their "ready" status
    - Helps match people who are available today vs. general interest

  3. Security
    - No changes to existing RLS policies needed
    - Users can only update their own ready_today status through existing RLS
*/

-- Add ready_today column to user_activity_skills table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_activity_skills' AND column_name = 'ready_today'
  ) THEN
    ALTER TABLE user_activity_skills 
    ADD COLUMN ready_today boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add index for faster queries when sorting/filtering by ready status
CREATE INDEX IF NOT EXISTS idx_user_activity_skills_ready_today 
ON user_activity_skills(activity_id, ready_today);

-- Add comment to document the column
COMMENT ON COLUMN user_activity_skills.ready_today IS 
'Indicates if the user is ready to join this activity today. Used for sorting people list to show available people first.';

