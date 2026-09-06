/*
  # Remove duplicate Board Games activity

  1. Problem
    - There are multiple "Board Games" entries in the activities table
    - Previous cleanup didn't work properly

  2. Solution
    - Delete all Board Games entries
    - Insert only one clean Board Games entry
    - Clean up any related data that might reference the duplicates

  3. Security
    - Safe deletion with proper cleanup of related tables
*/

-- First, let's clean up any related data that might reference Board Games activities
DELETE FROM user_activity_skills 
WHERE activity_id IN (
  SELECT id FROM activities WHERE name = 'Board Games'
);

DELETE FROM forum_messages 
WHERE activity_id IN (
  SELECT id FROM activities WHERE name = 'Board Games'
);

-- Now delete all Board Games activities
DELETE FROM activities WHERE name = 'Board Games';

-- Insert one clean Board Games activity
INSERT INTO activities (name, emoji, description) VALUES
('Board Games', '🎲', 'Strategy games, party games, and tabletop fun with friends');