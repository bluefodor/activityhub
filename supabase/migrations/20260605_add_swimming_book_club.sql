/*
  # Add Swimming and Book Club activities

  Ensures Swimming and Book Club exist in the activities table.
  Safe to run multiple times (no duplicates).
*/

INSERT INTO activities (name, emoji, description)
SELECT 'Swimming', '🏊', 'Lap swimming, open water, and swim buddies'
WHERE NOT EXISTS (SELECT 1 FROM activities WHERE name = 'Swimming');

INSERT INTO activities (name, emoji, description)
SELECT 'Book Club', '📖', 'Book discussions, reading groups, and literary meetups'
WHERE NOT EXISTS (SELECT 1 FROM activities WHERE name = 'Book Club');
