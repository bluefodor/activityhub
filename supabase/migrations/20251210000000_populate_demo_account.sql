/*
  # Populate Demo Account for Apple Review
  
  This migration populates the demo account (campbell3c2@gmail.com) with:
  - Profile with activities and skill levels
  - Forum posts in multiple activities
  - Chat conversations with other users
  - Other users to appear in People tab
  - Scheduled events/meetups
  
  IMPORTANT: Run this in Supabase SQL Editor after ensuring the demo account exists.
*/

-- Step 1: Get the demo account user ID (you'll need to replace this with actual user ID)
-- First, find the user ID from auth.users table:
-- SELECT id, email FROM auth.users WHERE email = 'campbell3c2@gmail.com';

-- Step 2: Update profile with location and activities
-- Replace 'DEMO_USER_ID' with the actual UUID from Step 1
DO $$
DECLARE
  demo_user_id uuid;
BEGIN
  -- Get the demo user ID
  SELECT id INTO demo_user_id FROM auth.users WHERE email = 'campbell3c2@gmail.com' LIMIT 1;
  
  IF demo_user_id IS NULL THEN
    RAISE NOTICE 'Demo account not found. Please create the account first.';
    RETURN;
  END IF;

  -- Update profile with location (Portland, ME area)
  UPDATE profiles 
  SET 
    latitude = 43.6591,
    longitude = -70.2568,
    location_sharing_enabled = true,
    location_updated_at = now()
  WHERE id = demo_user_id;

  -- Add activities to demo account (Tennis, Hiking, Running, Board Games)
  INSERT INTO user_activity_skills (user_id, activity_id, skill_level)
  SELECT 
    demo_user_id,
    id,
    CASE 
      WHEN name = 'Tennis' THEN 'Intermediate'
      WHEN name = 'Hiking' THEN 'Local Legend'
      WHEN name = 'Running' THEN 'Intermediate'
      WHEN name = 'Board Games' THEN 'Beginner'
      ELSE 'Intermediate'
    END
  FROM activities
  WHERE name IN ('Tennis', 'Hiking', 'Running', 'Board Games')
  ON CONFLICT (user_id, activity_id) DO UPDATE
  SET skill_level = EXCLUDED.skill_level;

  RAISE NOTICE 'Demo account profile updated with activities';
END $$;

-- NOTE: This step used to auto-insert demo forum posts for the
-- campbell3c2@gmail.com account into Tennis / Hiking / Running.
-- It has been intentionally disabled so that no automatic forum
-- messages are created when migrations run.
--
-- If you ever want to seed demo posts again for a review build,
-- you can re-enable this block manually, but it should not run
-- in normal environments.
-- DO $$
-- DECLARE
--   demo_user_id uuid;
--   tennis_activity_id uuid;
--   hiking_activity_id uuid;
--   running_activity_id uuid;
-- BEGIN
--   SELECT id INTO demo_user_id FROM auth.users WHERE email = 'campbell3c2@gmail.com' LIMIT 1;
--   
--   IF demo_user_id IS NULL THEN RETURN; END IF;
-- 
--   -- Get activity IDs
--   SELECT id INTO tennis_activity_id FROM activities WHERE name = 'Tennis' LIMIT 1;
--   SELECT id INTO hiking_activity_id FROM activities WHERE name = 'Hiking' LIMIT 1;
--   SELECT id INTO running_activity_id FROM activities WHERE name = 'Running' LIMIT 1;
--
--   -- Create forum posts
--   INSERT INTO forum_messages (activity_id, user_id, message, created_at)
--   VALUES
--     (tennis_activity_id, demo_user_id, 'Looking for a tennis partner for weekend matches! I play at the intermediate level and prefer doubles. Anyone interested?', now() - interval '2 days'),
--     (hiking_activity_id, demo_user_id, 'Planning a hike this Saturday at Bradbury Mountain. All skill levels welcome!', now() - interval '1 day'),
--     (running_activity_id, demo_user_id, 'Anyone up for a morning run? I usually do 3-5 miles around Back Cove.', now() - interval '5 hours')
--   ON CONFLICT DO NOTHING;
--
--   RAISE NOTICE 'Forum posts created for demo account';
-- END $$;

-- Step 4: Create other demo users (if they don't exist) for People tab and Chats
-- Note: These need to be created through the app signup process first
-- This script assumes some test users already exist

-- Step 5: Create chat conversations for demo account
-- Replace 'DEMO_USER_ID' with actual UUID and 'OTHER_USER_ID' with another user's UUID
DO $$
DECLARE
  demo_user_id uuid;
  other_user_id uuid;
  chat_id uuid;
BEGIN
  SELECT id INTO demo_user_id FROM auth.users WHERE email = 'campbell3c2@gmail.com' LIMIT 1;
  
  IF demo_user_id IS NULL THEN RETURN; END IF;

  -- Get another user (any user that's not the demo account)
  SELECT id INTO other_user_id 
  FROM profiles 
  WHERE id != demo_user_id 
  LIMIT 1;

  IF other_user_id IS NULL THEN
    RAISE NOTICE 'No other users found. Create test users first.';
    RETURN;
  END IF;

  -- Create or get chat
  INSERT INTO chats (participant_1, participant_2, created_at, last_message_at)
  VALUES (demo_user_id, other_user_id, now(), now())
  ON CONFLICT DO NOTHING
  RETURNING id INTO chat_id;

  -- If chat already exists, get its ID
  IF chat_id IS NULL THEN
    SELECT id INTO chat_id 
    FROM chats 
    WHERE (participant_1 = demo_user_id AND participant_2 = other_user_id)
       OR (participant_1 = other_user_id AND participant_2 = demo_user_id)
    LIMIT 1;
  END IF;

  -- Add sample messages
  IF chat_id IS NOT NULL THEN
    INSERT INTO chat_messages (chat_id, sender_id, message, created_at)
    VALUES
      (chat_id, demo_user_id, 'Hey! Are you still interested in playing tennis this weekend?', now() - interval '1 day'),
      (chat_id, other_user_id, 'Yes! Saturday works for me. What time?', now() - interval '20 hours'),
      (chat_id, demo_user_id, 'How about 10am at the courts?', now() - interval '18 hours')
    ON CONFLICT DO NOTHING;

    -- Update chat last message time
    UPDATE chats SET last_message_at = now() WHERE id = chat_id;
  END IF;

  RAISE NOTICE 'Chat conversations created for demo account';
END $$;

-- Step 6: Verify the demo account has all required data
DO $$
DECLARE
  demo_user_id uuid;
  activity_count int;
  forum_count int;
  chat_count int;
BEGIN
  SELECT id INTO demo_user_id FROM auth.users WHERE email = 'campbell3c2@gmail.com' LIMIT 1;
  
  IF demo_user_id IS NULL THEN
    RAISE NOTICE 'Demo account not found';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO activity_count 
  FROM user_activity_skills 
  WHERE user_id = demo_user_id;

  SELECT COUNT(*) INTO forum_count 
  FROM forum_messages 
  WHERE user_id = demo_user_id;

  SELECT COUNT(*) INTO chat_count 
  FROM chats 
  WHERE participant_1 = demo_user_id OR participant_2 = demo_user_id;

  RAISE NOTICE 'Demo account summary:';
  RAISE NOTICE '  Activities: %', activity_count;
  RAISE NOTICE '  Forum posts: %', forum_count;
  RAISE NOTICE '  Chats: %', chat_count;
END $$;



