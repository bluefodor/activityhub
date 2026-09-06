/*
  # Fix Foreign Key Constraint Error

  1. Problem Resolution
    - Remove mock profiles that violate foreign key constraints
    - Keep activities and other reference data
    - Only real authenticated users should have profiles

  2. Data Cleanup
    - Remove all mock user profiles
    - Remove related user activity skills
    - Remove forum messages from non-existent users
    - Remove chats from non-existent users
    - Keep activities table intact

  3. Security
    - Maintains proper foreign key relationships
    - Ensures data integrity
*/

-- Remove all mock data that depends on fake user profiles
DELETE FROM chat_messages WHERE sender_id IN (
  SELECT id FROM profiles WHERE id NOT IN (
    SELECT id FROM auth.users
  )
);

DELETE FROM chats WHERE participant_1 NOT IN (
  SELECT id FROM auth.users
) OR participant_2 NOT IN (
  SELECT id FROM auth.users
);

DELETE FROM forum_messages WHERE user_id NOT IN (
  SELECT id FROM auth.users
);

DELETE FROM user_activity_skills WHERE user_id NOT IN (
  SELECT id FROM auth.users
);

-- Remove mock profiles that don't correspond to real users
DELETE FROM profiles WHERE id NOT IN (
  SELECT id FROM auth.users
);

-- Keep activities table as it doesn't depend on users
-- Activities are reference data that all users can use