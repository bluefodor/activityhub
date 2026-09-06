/*
  # Rename Hiking to Hiking/Walking
  
  Updates the activity name from "Hiking" to "Hiking/Walking"
  Also merges any "Walking" activity users into "Hiking/Walking"
*/

-- Step 1: Update Hiking to Hiking/Walking
UPDATE activities 
SET name = 'Hiking/Walking', 
    description = 'Explore trails and nature, or enjoy casual walks with fellow hikers and walkers'
WHERE name = 'Hiking';

-- Step 2: If Walking exists as a separate activity, merge users into Hiking/Walking
DO $$
DECLARE
  hiking_walking_id uuid;
  walking_id uuid;
BEGIN
  -- Get the Hiking/Walking activity ID
  SELECT id INTO hiking_walking_id FROM activities WHERE name = 'Hiking/Walking' LIMIT 1;
  
  -- Get the Walking activity ID if it exists
  SELECT id INTO walking_id FROM activities WHERE name = 'Walking' LIMIT 1;
  
  -- If both exist, migrate Walking users to Hiking/Walking
  IF hiking_walking_id IS NOT NULL AND walking_id IS NOT NULL THEN
    -- First, delete any user_activity_skills that would conflict
    -- (users who already have Hiking/Walking and also have Walking)
    DELETE FROM user_activity_skills
    WHERE activity_id = walking_id
      AND user_id IN (
        SELECT user_id FROM user_activity_skills WHERE activity_id = hiking_walking_id
      );
    
    -- Now update remaining user_activity_skills to point to Hiking/Walking
    UPDATE user_activity_skills
    SET activity_id = hiking_walking_id
    WHERE activity_id = walking_id;
    
    -- Update forum_messages to point to Hiking/Walking
    UPDATE forum_messages
    SET activity_id = hiking_walking_id
    WHERE activity_id = walking_id;
    
    -- Delete the old Walking activity
    DELETE FROM activities WHERE id = walking_id;
    
    RAISE NOTICE 'Merged Walking activity into Hiking/Walking';
  END IF;
END $$;

