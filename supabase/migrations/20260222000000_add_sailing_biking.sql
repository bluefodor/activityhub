/*
  # Add Sailing and Biking activities

  Ensures Sailing and Biking exist in the activities table.
  Safe to run multiple times (no duplicates).
*/

INSERT INTO activities (name, emoji, description)
SELECT 'Sailing', '⛵', 'Set sail with experienced and beginner sailors'
WHERE NOT EXISTS (SELECT 1 FROM activities WHERE name = 'Sailing');

INSERT INTO activities (name, emoji, description)
SELECT 'Biking', '🚴', 'Road cycling, mountain biking, and casual rides'
WHERE NOT EXISTS (SELECT 1 FROM activities WHERE name = 'Biking');
