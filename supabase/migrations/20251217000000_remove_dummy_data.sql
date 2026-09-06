/*
  # Remove Dummy/Test Data
  
  This migration removes dummy data created for testing.
  
  IMPORTANT: 
  - campbell3c2@gmail.com is PRESERVED (used for Apple/Google review)
  - Only other test/dummy accounts will be deleted
  - This will permanently delete data - make sure you have a backup if needed
  - Review the test_emails array below and add any other test accounts you want to remove
*/

-- Step 1: Identify and remove demo/test accounts
-- NOTE: campbell3c2@gmail.com is EXCLUDED - it's kept for Apple/Google review
DO $$
DECLARE
  review_account_email text := 'campbell3c2@gmail.com';
  review_account_id uuid;
  test_emails text[] := ARRAY[
    'test@example.com',
    'demo@example.com',
    'admin@test.com',
    'testuser@example.com'
    -- Add any other test account emails here (NOT campbell3c2@gmail.com)
  ];
  test_user_id uuid;
BEGIN
  -- Get the review account ID to exclude it
  SELECT id INTO review_account_id FROM auth.users WHERE email = review_account_email LIMIT 1;
  
  IF review_account_id IS NOT NULL THEN
    RAISE NOTICE 'Preserving review account: % (ID: %)', review_account_email, review_account_id;
  END IF;
  
  -- Loop through test emails and remove their data (excluding review account)
  FOREACH test_user_id IN ARRAY (
    SELECT ARRAY_AGG(id) 
    FROM auth.users 
    WHERE email = ANY(test_emails)
      AND id != COALESCE(review_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  LOOP
    IF test_user_id IS NOT NULL THEN
      RAISE NOTICE 'Removing data for user: %', test_user_id;
      
      -- Remove chat messages
      DELETE FROM chat_messages 
      WHERE sender_id = test_user_id;
      
      -- Remove chats (both as participant_1 and participant_2)
      DELETE FROM chats 
      WHERE participant_1 = test_user_id OR participant_2 = test_user_id;
      
      -- Remove forum messages
      DELETE FROM forum_messages 
      WHERE user_id = test_user_id;
      
      -- Remove user activity skills
      DELETE FROM user_activity_skills 
      WHERE user_id = test_user_id;
      
      -- Remove scheduled events (if table exists)
      -- DELETE FROM scheduled_events WHERE user_id = test_user_id;
      
      -- Remove blocked users entries
      DELETE FROM blocked_users 
      WHERE user_id = test_user_id OR blocked_user_id = test_user_id;
      
      -- Remove profile
      DELETE FROM profiles 
      WHERE id = test_user_id;
      
      -- Remove auth user (this will cascade to other tables)
      DELETE FROM auth.users 
      WHERE id = test_user_id;
      
      RAISE NOTICE 'Removed all data for user: %', test_user_id;
    END IF;
  END LOOP;
END $$;

-- Step 2: Remove obviously fake/dummy forum posts
-- This removes posts with common test phrases, but PRESERVES posts from review account
DO $$
DECLARE
  review_account_id uuid;
BEGIN
  -- Get review account ID
  SELECT id INTO review_account_id FROM auth.users WHERE email = 'campbell3c2@gmail.com' LIMIT 1;
  
  -- Remove test forum posts, but keep review account's posts
  DELETE FROM forum_messages 
  WHERE 
    user_id != COALESCE(review_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      message ILIKE '%test%' 
      OR message ILIKE '%demo%'
      OR message ILIKE '%sample%'
      OR message ILIKE '%lorem ipsum%'
      OR message = 'Test message'
      OR message = 'Demo post'
      OR LENGTH(message) < 10 -- Remove very short messages that are likely tests
    );
  
  RAISE NOTICE 'Removed test forum posts (preserved review account posts)';
END $$;

-- Step 3: Remove orphaned data (data without valid users)
-- Remove forum messages from deleted users
DELETE FROM forum_messages 
WHERE user_id NOT IN (SELECT id FROM auth.users);

-- Remove chat messages from deleted users
DELETE FROM chat_messages 
WHERE sender_id NOT IN (SELECT id FROM auth.users);

-- Remove chats where one or both participants are deleted
DELETE FROM chats 
WHERE participant_1 NOT IN (SELECT id FROM auth.users)
   OR participant_2 NOT IN (SELECT id FROM auth.users);

-- Remove user activity skills from deleted users
DELETE FROM user_activity_skills 
WHERE user_id NOT IN (SELECT id FROM auth.users);

-- Step 4: Summary report
DO $$
DECLARE
  total_users int;
  total_profiles int;
  total_forum_messages int;
  total_chats int;
BEGIN
  SELECT COUNT(*) INTO total_users FROM auth.users;
  SELECT COUNT(*) INTO total_profiles FROM profiles;
  SELECT COUNT(*) INTO total_forum_messages FROM forum_messages;
  SELECT COUNT(*) INTO total_chats FROM chats;
  
  RAISE NOTICE '=== Cleanup Summary ===';
  RAISE NOTICE 'Total users: %', total_users;
  RAISE NOTICE 'Total profiles: %', total_profiles;
  RAISE NOTICE 'Total forum messages: %', total_forum_messages;
  RAISE NOTICE 'Total chats: %', total_chats;
  RAISE NOTICE '=== Cleanup Complete ===';
END $$;

