/*
  # Add Workouts activity

  Adds "Workouts" (plural) as its own activity, separate from existing "Workout".
  Safe to run multiple times (no duplicates).
*/

INSERT INTO activities (name, emoji, description)
SELECT 'Workouts', '🏋️', 'Gym sessions, strength training, and structured workout routines'
WHERE NOT EXISTS (SELECT 1 FROM activities WHERE name = 'Workouts');
