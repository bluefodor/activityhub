/*
  # Add Arts and Crafts Activity

  1. New Activity
    - Add "Arts and Crafts" activity with 🎨 emoji
    - Description: "Create, paint, sculpt, and craft together"

  2. Notes
    - Uses IF NOT EXISTS to prevent duplicates
    - Safe to run multiple times
*/

INSERT INTO activities (name, emoji, description)
SELECT 'Arts and Crafts', '🎨', 'Create, paint, sculpt, and craft together'
WHERE NOT EXISTS (
  SELECT 1 FROM activities WHERE name = 'Arts and Crafts'
);