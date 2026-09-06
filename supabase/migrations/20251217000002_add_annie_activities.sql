/*
  # Add Activities for Annie Znamierowski
  
  Adds Annie to:
  - Live Events (Intermediate)
  - Pickleball (Intermediate)
  - Skiing (Intermediate)
  
  Note: If "Skiing/Snowboarding" exists as a combined activity, it will use that.
  Otherwise, it will use "Skiing" if available.
*/

DO $$
DECLARE
  annie_user_id uuid;
  live_events_id uuid;
  pickleball_id uuid;
  skiing_id uuid;
  snowboarding_id uuid;
BEGIN
  -- Get Annie's user ID from email
  SELECT id INTO annie_user_id 
  FROM auth.users 
  WHERE email = 'aeznamierowski@gmail.com' 
  LIMIT 1;
  
  IF annie_user_id IS NULL THEN
    RAISE NOTICE 'Annie not found with email: aeznamierowski@gmail.com';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Found Annie with ID: %', annie_user_id;
  
  -- Get activity IDs
  SELECT id INTO live_events_id FROM activities WHERE name = 'Live Events' LIMIT 1;
  SELECT id INTO pickleball_id FROM activities WHERE name = 'Pickleball' LIMIT 1;
  SELECT id INTO skiing_id FROM activities WHERE name = 'Skiing' LIMIT 1;
  SELECT id INTO snowboarding_id FROM activities WHERE name = 'Skiing/Snowboarding' LIMIT 1;
  
  -- Use Skiing/Snowboarding if it exists, otherwise use Skiing
  IF snowboarding_id IS NOT NULL THEN
    skiing_id := snowboarding_id;
    RAISE NOTICE 'Using "Skiing/Snowboarding" activity';
  ELSIF skiing_id IS NOT NULL THEN
    RAISE NOTICE 'Using "Skiing" activity';
  ELSE
    RAISE NOTICE 'Warning: Neither "Skiing" nor "Skiing/Snowboarding" found';
  END IF;
  
  -- Add Live Events
  IF live_events_id IS NOT NULL THEN
    INSERT INTO user_activity_skills (user_id, activity_id, skill_level)
    VALUES (annie_user_id, live_events_id, 'Intermediate')
    ON CONFLICT (user_id, activity_id) 
    DO UPDATE SET skill_level = 'Intermediate';
    RAISE NOTICE 'Added Live Events (Intermediate)';
  ELSE
    RAISE NOTICE 'Warning: Live Events activity not found';
  END IF;
  
  -- Add Pickleball
  IF pickleball_id IS NOT NULL THEN
    INSERT INTO user_activity_skills (user_id, activity_id, skill_level)
    VALUES (annie_user_id, pickleball_id, 'Intermediate')
    ON CONFLICT (user_id, activity_id) 
    DO UPDATE SET skill_level = 'Intermediate';
    RAISE NOTICE 'Added Pickleball (Intermediate)';
  ELSE
    RAISE NOTICE 'Warning: Pickleball activity not found';
  END IF;
  
  -- Add Skiing (or Skiing/Snowboarding)
  IF skiing_id IS NOT NULL THEN
    INSERT INTO user_activity_skills (user_id, activity_id, skill_level)
    VALUES (annie_user_id, skiing_id, 'Intermediate')
    ON CONFLICT (user_id, activity_id) 
    DO UPDATE SET skill_level = 'Intermediate';
    RAISE NOTICE 'Added Skiing (Intermediate)';
  ELSE
    RAISE NOTICE 'Warning: Skiing activity not found';
  END IF;
  
  RAISE NOTICE 'Completed adding activities for Annie';
END $$;


