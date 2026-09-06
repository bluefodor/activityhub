/*
  # Add Soccer and Basketball activities

  Ensures Soccer and Basketball exist in the activities table.
  Safe to run multiple times (no duplicates).
*/

INSERT INTO activities (name, emoji, description)
SELECT 'Soccer', '⚽', 'Pick-up games, league play, and casual kickarounds'
WHERE NOT EXISTS (SELECT 1 FROM activities WHERE name = 'Soccer');

INSERT INTO activities (name, emoji, description)
SELECT 'Basketball', '🏀', 'Gym runs, outdoor courts, and pick-up games'
WHERE NOT EXISTS (SELECT 1 FROM activities WHERE name = 'Basketball');
